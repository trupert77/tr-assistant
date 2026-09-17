import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ItemKind, ItemPriority, ItemRow } from "@/lib/db/types";
import { nextDueAt } from "./recurrence";

type Db = SupabaseClient<Database>;

/**
 * Every way an item changes state, shared by the item buttons, the weekly
 * review, and actions the assistant proposes. Nothing here deletes a row.
 */

export function defaultStatus(kind: ItemKind): ItemRow["status"] {
  // Goals, tasks and notes all start open; only a follow-up starts out waiting.
  return kind === "followup" ? "waiting" : "open";
}

/**
 * Mark done. A recurring item spawns its next occurrence, linked through
 * `recurred_from` so completing, undoing, and completing again never makes
 * a second copy.
 */
export async function completeItem(db: Db, id: string, timeZone: string): Promise<void> {
  const { data: item } = await db
    .from("items")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (!item?.recurrence) return;

  const due_at = nextDueAt(item.due_at, item.recurrence, timeZone);
  const { data: successor } = await db
    .from("items")
    .select("id, status")
    .eq("recurred_from", item.id)
    .maybeSingle();

  if (successor) {
    // Undo archived it; bring the same row back rather than adding another.
    if (successor.status === "archived") {
      await db
        .from("items")
        .update({ status: defaultStatus(item.kind), due_at, reminded_at: null })
        .eq("id", successor.id);
    }
    return;
  }

  const { data: next } = await db
    .from("items")
    .insert({
      user_id: item.user_id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      source_text: item.source_text,
      status: defaultStatus(item.kind),
      priority: item.priority,
      due_at,
      workspace_id: item.workspace_id,
      project_id: item.project_id,
      organization_id: item.organization_id,
      category: item.category,
      tags: item.tags,
      recurrence: item.recurrence,
      recurred_from: item.id,
    })
    .select("id")
    .single();
  if (!next) return;

  const { data: links } = await db
    .from("item_people")
    .select("person_id, role")
    .eq("item_id", item.id);
  if (links?.length) {
    await db.from("item_people").insert(
      links.map((l) => ({
        user_id: item.user_id,
        item_id: next.id,
        person_id: l.person_id,
        role: l.role,
      })),
    );
  }
}

/** Undo done or archived. Takes back the occurrence a recurring item spawned, if untouched. */
export async function reopenItem(db: Db, id: string): Promise<void> {
  const { data: item } = await db.from("items").select("kind").eq("id", id).single();
  if (!item) return;
  await db
    .from("items")
    .update({ status: defaultStatus(item.kind), completed_at: null })
    .eq("id", id);
  await db
    .from("items")
    .update({ status: "archived" })
    .eq("recurred_from", id)
    .in("status", ["open", "waiting"]);
}

/** Move or clear the due date. Resets the reminder so the new time notifies again. */
export async function rescheduleItem(db: Db, id: string, due_at: string | null): Promise<void> {
  await db.from("items").update({ due_at, reminded_at: null }).eq("id", id);
}

export async function setItemPriority(db: Db, id: string, priority: ItemPriority): Promise<void> {
  await db.from("items").update({ priority }).eq("id", id);
}

/** Archive keeps the row; nothing is ever deleted. */
export async function archiveItem(db: Db, id: string): Promise<void> {
  await db.from("items").update({ status: "archived" }).eq("id", id);
}
