import type { CalendarEvent } from "@/lib/calendar";
import type { ItemRow } from "@/lib/db/types";
import type { PushPayload } from "./index";

/** A follow-up with no answer for this long shows up in the digest and on the row. */
export const STALE_WAITING_DAYS = 5;

const DAY_MS = 86_400_000;

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

export type DigestInput = {
  overdue: ItemRow[];
  today: ItemRow[];
  /** Follow-ups still waiting after STALE_WAITING_DAYS, oldest first. */
  staleWaiting: { item: ItemRow; person: string | null }[];
  events: CalendarEvent[];
  /** Friday: point at the weekly review. */
  reviewDay: boolean;
  timeZone: string;
  now: Date;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(":00", "")
    .replace(" ", "")
    .toLowerCase();
}

/**
 * The morning push. Phone notifications show about four short lines, so the
 * counts come first and each following line earns its place. Null when
 * there is nothing at all to say.
 */
export function buildDigest(input: DigestInput): PushPayload | null {
  const { overdue, today, staleWaiting, events, reviewDay, timeZone, now } = input;
  if (!overdue.length && !today.length && !staleWaiting.length && !events.length && !reviewDay) {
    return null;
  }

  const counts = [
    today.length ? `${today.length} due today` : null,
    overdue.length ? `${overdue.length} overdue` : null,
    staleWaiting.length ? plural(staleWaiting.length, "stale follow-up") : null,
  ].filter(Boolean);

  const lines: string[] = [];
  lines.push(counts.length ? counts.join(", ") + "." : "Nothing due today.");

  const timed = events.filter((e) => !e.allDay);
  if (timed.length) {
    lines.push(
      "Calendar: " +
        timed
          .slice(0, 3)
          .map((e) => `${clock(e.start, timeZone)} ${e.title}`)
          .join(", ") +
        (timed.length > 3 ? ` +${timed.length - 3}` : ""),
    );
  }

  const first = [...overdue, ...today].slice(0, 3).map((i) => i.title);
  if (first.length) lines.push("First: " + first.join(" · "));

  const stalest = staleWaiting[0];
  if (stalest) {
    const who = stalest.person ? `${stalest.person}: ` : "";
    lines.push(`Waiting ${daysSince(stalest.item.created_at, now)}d: ${who}${stalest.item.title}`);
  }

  if (reviewDay) lines.push("Friday: your weekly review is ready.");

  return {
    title: "Good morning, Travis",
    body: lines.join("\n"),
    url: reviewDay && !today.length && !overdue.length ? "/review" : "/",
    tag: "digest",
  };
}
