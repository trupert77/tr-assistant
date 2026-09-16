"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  localDate,
  nextMondayLocal,
  shiftLocalDate,
  zonedToIso,
} from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ItemKind } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";

const idSchema = z.object({ id: z.uuid() });

function refresh(id: string) {
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath(`/items/${id}`);
}

function defaultStatus(kind: ItemKind) {
  return kind === "followup" ? "waiting" : "open";
}

export async function completeAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await db
    .from("items")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  refresh(parsed.data.id);
}

export async function reopenAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  const { data: item } = await db
    .from("items")
    .select("kind")
    .eq("id", parsed.data.id)
    .single();
  if (!item) return;
  await db
    .from("items")
    .update({ status: defaultStatus(item.kind), completed_at: null })
    .eq("id", parsed.data.id);
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
  await db.from("items").update({ due_at }).eq("id", parsed.data.id);
  refresh(parsed.data.id);
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const updateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["task", "followup", "note"]),
  title: z.string().trim().min(1, "Title is required.").max(200),
  body: z.preprocess(emptyToNull, z.string().trim().max(10_000).nullable()),
  status: z.enum(["open", "waiting", "done", "archived"]),
  priority: z.preprocess(emptyToNull, z.enum(["low", "normal", "high"]).nullable()),
  due_date: z.preprocess(emptyToNull, z.string().nullable()),
  due_time: z.preprocess(emptyToNull, z.string().nullable()),
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
      "due_time", "workspace_id", "project_id", "category", "tags",
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
  const { error } = await db
    .from("items")
    .update({
      kind: v.kind,
      title: v.title,
      body: v.body,
      status: v.status,
      priority: v.priority,
      due_at,
      workspace_id: v.workspace_id,
      project_id: v.project_id,
      category: v.category,
      tags,
      completed_at: v.status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", v.id);
  if (error) return { error: error.message };

  refresh(v.id);
  redirect(`/items/${v.id}?saved=1`);
}

/** Archive keeps the row; nothing is ever deleted. */
export async function archiveAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await db.from("items").update({ status: "archived" }).eq("id", parsed.data.id);
  refresh(parsed.data.id);
  redirect("/");
}
