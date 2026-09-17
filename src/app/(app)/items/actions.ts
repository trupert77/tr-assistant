"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { indexPendingItems } from "@/lib/ai/embeddings";
import { getUserAiProvider } from "@/lib/ai/preference";
import { RECURRENCES } from "@/lib/ai/types";
import {
  formatDue,
  localDate,
  nextMondayLocal,
  shiftLocalDate,
  zonedToIso,
} from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import {
  archiveItem,
  completeItem,
  reopenItem,
  rescheduleItem,
} from "@/lib/items/mutations";
import { loadPeopleFor } from "@/lib/items/queries";

const idSchema = z.object({ id: z.uuid() });

function refresh(id: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/items/${id}`);
}

export async function completeAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await completeItem(db, parsed.data.id, getServerEnv().APP_TIMEZONE);
  refresh(parsed.data.id);
}

/** Undo for both Done and Archive. */
export async function reopenAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await reopenItem(db, parsed.data.id);
  refresh(parsed.data.id);
}

const snoozeSchema = idSchema.extend({
  until: z.enum(["tomorrow", "next-week", "clear"]),
});

/** Move the due date. Date-only, 9:00 local, like the classifier's default. */
export async function snoozeAction(formData: FormData): Promise<void> {
  const parsed = snoozeSchema.safeParse({
    id: formData.get("id"),
    until: formData.get("until"),
  });
  if (!parsed.success) return;

  const tz = getServerEnv().APP_TIMEZONE;
  const now = new Date();
  const due_at =
    parsed.data.until === "clear"
      ? null
      : zonedToIso(
          parsed.data.until === "tomorrow"
            ? shiftLocalDate(localDate(now, tz), 1)
            : nextMondayLocal(now, tz),
          null,
          tz,
        );

  const db = await createSupabaseServerClient();
  await rescheduleItem(db, parsed.data.id, due_at);
  refresh(parsed.data.id);
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const updateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["task", "followup", "note", "goal"]),
  title: z.string().trim().min(1, "Title is required.").max(200),
  body: z.preprocess(emptyToNull, z.string().trim().max(10_000).nullable()),
  status: z.enum(["open", "waiting", "done", "archived"]),
  priority: z.preprocess(emptyToNull, z.enum(["low", "normal", "high"]).nullable()),
  due_date: z.preprocess(emptyToNull, z.string().nullable()),
  due_time: z.preprocess(emptyToNull, z.string().nullable()),
  recurrence: z.preprocess(emptyToNull, z.enum(RECURRENCES).nullable()),
  workspace_id: z.preprocess(emptyToNull, z.uuid().nullable()),
  project_id: z.preprocess(emptyToNull, z.uuid().nullable()),
  category: z.preprocess(emptyToNull, z.string().trim().max(100).nullable()),
  tags: z.string().default(""),
});

export type UpdateState = { error?: string };

export async function updateItemAction(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const raw = Object.fromEntries(
    [
      "id", "kind", "title", "body", "status", "priority", "due_date",
      "due_time", "recurrence", "workspace_id", "project_id", "category", "tags",
    ].map((k) => [k, formData.get(k)]),
  );
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;
  const tz = getServerEnv().APP_TIMEZONE;

  let due_at: string | null = null;
  if (v.due_date) {
    due_at = zonedToIso(v.due_date, v.due_time, tz);
    if (!due_at) return { error: "That date or time isn't valid." };
  }

  const tags = [...new Set(
    v.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  )];

  const db = await createSupabaseServerClient();
  const { data: before } = await db
    .from("items")
    .select("status, due_at")
    .eq("id", v.id)
    .single();

  const { error } = await db
    .from("items")
    .update({
      kind: v.kind,
      title: v.title,
      body: v.body,
      // Done goes through completeItem below so a recurring item spawns its next.
      status: v.status === "done" ? before?.status ?? "open" : v.status,
      priority: v.priority,
      due_at,
      recurrence: v.recurrence,
      workspace_id: v.workspace_id,
      project_id: v.project_id,
      category: v.category,
      tags,
      ...(v.status === "done" ? {} : { completed_at: null }),
      ...(before?.due_at !== due_at ? { reminded_at: null } : {}),
    })
    .eq("id", v.id);
  if (error) return { error: error.message };

  if (v.status === "done" && before?.status !== "done") {
    await completeItem(db, v.id, tz);
  }

  // The text may have changed, so the search embedding is stale.
  after(() => indexPendingItems(db));

  refresh(v.id);
  redirect(`/items/${v.id}?saved=1`);
}

/** Archive keeps the row; nothing is ever deleted. */
export async function archiveAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await archiveItem(db, parsed.data.id);
  refresh(parsed.data.id);
}

export type NudgeState = { text?: string; error?: string };

/** Draft a message to chase whoever this follow-up is waiting on. */
export async function draftNudgeAction(id: string): Promise<NudgeState> {
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return { error: "Unknown item." };

  const provider = await getUserAiProvider();
  if (!provider) return { error: "Add an AI key in Settings to draft messages." };

  const db = await createSupabaseServerClient();
  const { data: item } = await db.from("items").select().eq("id", parsed.data.id).maybeSingle();
  if (!item) return { error: "Unknown item." };

  const people = (await loadPeopleFor(db, [item.id])).get(item.id) ?? [];
  const person = people.find((p) => p.role === "waiting_on") ?? people[0];
  if (!person) return { error: "This follow-up has nobody linked to chase." };

  const tz = getServerEnv().APP_TIMEZONE;
  try {
    const text = await provider.draftNudge({
      person: person.name,
      title: item.title,
      body: item.body ?? item.source_text,
      waitingDays: Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86_400_000),
      dueLabel: item.due_at ? formatDue(item.due_at, tz) : null,
    });
    return { text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not draft a message." };
  }
}
