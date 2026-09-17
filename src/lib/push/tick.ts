import type { SupabaseClient } from "@supabase/supabase-js";
import { indexPendingItems } from "@/lib/ai/embeddings";
import { loadEvents } from "@/lib/calendar";
import { classifyInboxItem } from "@/lib/capture/classify";
import { syncCecoInitiativesIfStale, syncCecoScopeIfStale } from "@/lib/ceco";
import { resolveAllowedUserId } from "@/lib/db/admin";
import { formatDue, isoToZonedParts, localDayBounds } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { STALE_WAITING_DAYS, buildDigest } from "./digest";
import { sendPush } from "./index";

type Db = SupabaseClient<Database>;

export type TickResult = {
  /** True when the CECO scope copy was refreshed on this run. */
  cecoSynced: boolean;
  /** True when the CECO initiatives board copy was refreshed on this run. */
  cecoInitiativesSynced: boolean;
  digests: number;
  reminders: number;
  classified: number;
  embedded: number;
};

/** The digest goes out in this many hours after DIGEST_HOUR, then waits for tomorrow. */
const DIGEST_WINDOW_HOURS = 5;
/** A due time this far in the past is no longer worth a buzz. */
const REMINDER_LOOKBACK_MS = 12 * 3_600_000;
/** Captures still pending after this long missed their after() run. */
const STUCK_CAPTURE_MS = 2 * 60_000;

/**
 * Everything that has to happen without the app being open. Safe to call at
 * any frequency: the digest is locked per day by `notification_log`, and a
 * reminder is sent once per due time via `items.reminded_at`. Once a day is
 * enough for the digest; every ten minutes or so makes timed reminders land
 * on time.
 */
export async function runTick(admin: Db, now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = {
    cecoSynced: false,
    cecoInitiativesSynced: false,
    digests: 0,
    reminders: 0,
    classified: 0,
    embedded: 0,
  };
  const env = getServerEnv();
  const timeZone = env.APP_TIMEZONE;

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];

  for (const userId of userIds) {
    if (await sendDigestIfDue(admin, userId, timeZone, env.DIGEST_HOUR, now)) result.digests += 1;
    result.reminders += await sendDueReminders(admin, userId, timeZone, now);
  }

  // Before classifying anything, so a stuck capture sees the current page list.
  // The board is refreshed on a shorter fuse than the scope — a step gets
  // checked off mid-afternoon, where pages change when CECO deploys. Neither
  // throws: a sync that fails leaves the last good copy alone.
  const owner = await resolveAllowedUserId(admin).catch(() => null);
  if (owner) {
    result.cecoSynced = await syncCecoScopeIfStale(admin, owner, now);
    result.cecoInitiativesSynced = await syncCecoInitiativesIfStale(admin, owner, now);
  }

  // Fallback for captures whose after() run was cut short.
  const { data: stuck } = await admin
    .from("inbox_items")
    .select("id")
    .in("status", ["pending", "processing"])
    .lt("created_at", new Date(now.getTime() - STUCK_CAPTURE_MS).toISOString())
    .limit(10);
  for (const row of stuck ?? []) {
    await classifyInboxItem(admin, row.id);
    result.classified += 1;
  }

  result.embedded = await indexPendingItems(admin, 50);
  return result;
}

async function sendDigestIfDue(
  admin: Db,
  userId: string,
  timeZone: string,
  digestHour: number,
  now: Date,
): Promise<boolean> {
  const { today, start, end } = localDayBounds(now, timeZone);
  const hour = Number(isoToZonedParts(now.toISOString(), timeZone).time.slice(0, 2));
  if (hour < digestHour || hour >= digestHour + DIGEST_WINDOW_HOURS) return false;

  // The unique key is the lock. Losing the race means another run has it.
  const { error: lockError } = await admin
    .from("notification_log")
    .insert({ user_id: userId, kind: "digest", local_date: today });
  if (lockError) return false;

  const staleBefore = new Date(now.getTime() - STALE_WAITING_DAYS * 86_400_000).toISOString();
  const [{ data: dated }, { data: waiting }, events] = await Promise.all([
    admin
      .from("items")
      .select()
      .eq("user_id", userId)
      .in("status", ["open", "waiting"])
      .not("due_at", "is", null)
      .lt("due_at", end)
      .order("due_at"),
    admin
      .from("items")
      .select()
      .eq("user_id", userId)
      .eq("kind", "followup")
      .eq("status", "waiting")
      .lt("created_at", staleBefore)
      .or(`due_at.is.null,due_at.lt.${start}`)
      .order("created_at")
      .limit(10),
    loadEvents(new Date(start), new Date(end), timeZone),
  ]);

  const staleIds = (waiting ?? []).map((i) => i.id);
  const { data: links } = staleIds.length
    ? await admin
        .from("item_people")
        .select("item_id, person_id")
        .eq("role", "waiting_on")
        .in("item_id", staleIds)
    : { data: [] as { item_id: string; person_id: string }[] };
  const personIds = [...new Set((links ?? []).map((l) => l.person_id))];
  const { data: people } = personIds.length
    ? await admin.from("people").select("id, name").in("id", personIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.name]));
  const personByItem = new Map(
    (links ?? []).map((l) => [l.item_id, nameById.get(l.person_id) ?? null]),
  );

  const rank = { high: 0, normal: 1, low: 2 } as const;
  const byUrgency = [...(dated ?? [])].sort(
    (a, b) =>
      (a.priority ? rank[a.priority] : 1) - (b.priority ? rank[b.priority] : 1) ||
      a.due_at!.localeCompare(b.due_at!),
  );

  const payload = buildDigest({
    overdue: byUrgency.filter((i) => i.due_at! < start),
    today: byUrgency.filter((i) => i.due_at! >= start),
    staleWaiting: (waiting ?? []).map((item) => ({
      item,
      person: personByItem.get(item.id) ?? null,
    })),
    events,
    reviewDay: new Date(`${today}T12:00:00Z`).getUTCDay() === 5,
    timeZone,
    now,
  });
  if (!payload) return false;
  return (await sendPush(admin, userId, payload)) > 0;
}

/**
 * Buzz for items whose stated time has arrived. Date-only items sit at 09:00
 * local by convention and are covered by the digest, so they are skipped.
 */
async function sendDueReminders(
  admin: Db,
  userId: string,
  timeZone: string,
  now: Date,
): Promise<number> {
  const { data: due } = await admin
    .from("items")
    .select()
    .eq("user_id", userId)
    .in("status", ["open", "waiting"])
    .is("reminded_at", null)
    .lte("due_at", now.toISOString())
    .gte("due_at", new Date(now.getTime() - REMINDER_LOOKBACK_MS).toISOString())
    .order("due_at");

  const timed = (due ?? []).filter(
    (i) => isoToZonedParts(i.due_at!, timeZone).time !== "09:00",
  );
  if (!timed.length) return 0;

  // Mark first: a reminder that fails to send is better than one that repeats.
  await admin
    .from("items")
    .update({ reminded_at: now.toISOString() })
    .in("id", timed.map((i) => i.id));

  const [first] = timed;
  await sendPush(
    admin,
    userId,
    timed.length === 1
      ? {
          title: first.kind === "followup" ? "Follow up now" : "Due now",
          body: `${first.title}\n${formatDue(first.due_at!, timeZone, now)}`,
          url: `/items/${first.id}`,
          tag: `due-${first.id}`,
        }
      : {
          title: `${timed.length} things due now`,
          body: timed.slice(0, 4).map((i) => i.title).join("\n"),
          url: "/",
          tag: "due",
        },
  );
  return timed.length;
}
