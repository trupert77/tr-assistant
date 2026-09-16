import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaptureSource,
  Database,
  InboxItemRow,
  ItemKind,
  ItemRow,
} from "@/lib/db/types";

type Db = SupabaseClient<Database>;

const TITLE_MAX = 100;

/**
 * Store raw input in the inbox. This is the only write on the capture path,
 * so nothing the user types can be lost by a later step failing.
 */
export async function captureText(
  db: Db,
  input: { text: string; source: CaptureSource; userId?: string },
): Promise<InboxItemRow> {
  const raw_text = input.text.trim();
  if (!raw_text) throw new Error("Nothing to capture.");

  const { data, error } = await db
    .from("inbox_items")
    .insert({
      raw_text,
      source: input.source,
      ...(input.userId ? { user_id: input.userId } : {}),
    })
    .select()
    .single();

  if (error) throw new Error(`Could not save to inbox: ${error.message}`);
  return data;
}

/** First line of the text, trimmed to a sensible title length at a word boundary. */
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine.length <= TITLE_MAX) return firstLine || "Untitled";
  const cut = firstLine.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Turn an inbox item into a task, follow-up, or note. Idempotent: if the
 * inbox item already produced an item, that item is returned unchanged.
 * Phase 3 will call this with AI-derived fields; today the caller picks the kind.
 */
export async function promoteInboxItem(
  db: Db,
  input: { inboxItemId: string; kind: ItemKind },
): Promise<ItemRow> {
  const { data: inbox, error: readError } = await db
    .from("inbox_items")
    .select()
    .eq("id", input.inboxItemId)
    .single();
  if (readError || !inbox) throw new Error("Inbox item not found.");

  // Look up by inbox_item_id rather than inbox.item_id so a promote that
  // created the item but failed to mark the inbox row still won't duplicate.
  const { data: existing } = await db
    .from("items")
    .select()
    .eq("inbox_item_id", inbox.id)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const title = deriveTitle(inbox.raw_text);
  const body = inbox.raw_text.trim() === title ? null : inbox.raw_text.trim();

  const { data: item, error: insertError } = await db
    .from("items")
    .insert({
      kind: input.kind,
      title,
      body,
      source_text: inbox.raw_text,
      status: input.kind === "followup" ? "waiting" : "open",
      inbox_item_id: inbox.id,
    })
    .select()
    .single();
  if (insertError || !item) {
    throw new Error(`Could not create item: ${insertError?.message ?? "unknown"}`);
  }

  const { error: updateError } = await db
    .from("inbox_items")
    .update({
      status: "processed",
      item_id: item.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inbox.id);
  if (updateError) {
    // The item exists; the inbox row will show as pending and re-promoting
    // returns the same item because of the item_id check above.
    throw new Error(`Item created but inbox not updated: ${updateError.message}`);
  }

  return item;
}
