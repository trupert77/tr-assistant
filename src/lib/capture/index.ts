import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaptureSource,
  Database,
  InboxItemRow,
  InboxStatus,
  ItemKind,
  ItemPriority,
  ItemRow,
  PersonRole,
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

export type PromoteFields = {
  title?: string;
  body?: string | null;
  priority?: ItemPriority | null;
  due_at?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  category?: string | null;
  tags?: string[];
};

export type PromoteInput = {
  inboxItemId: string;
  kind: ItemKind;
  fields?: PromoteFields;
  people?: { name: string; role: PersonRole }[];
  /** Inbox status to set afterwards. Defaults to processed. */
  inboxStatus?: Extract<InboxStatus, "processed" | "needs_review">;
};

function defaultStatus(kind: ItemKind): ItemRow["status"] {
  return kind === "followup" ? "waiting" : "open";
}

/**
 * Turn an inbox item into a task, follow-up, or note. Idempotent: if the
 * inbox item already produced an item, that item is updated in place (so a
 * manual re-file after AI classification changes the kind rather than
 * duplicating). Fields not supplied are derived from the raw text.
 */
export async function promoteInboxItem(db: Db, input: PromoteInput): Promise<ItemRow> {
  const { data: inbox, error: readError } = await db
    .from("inbox_items")
    .select()
    .eq("id", input.inboxItemId)
    .single();
  if (readError || !inbox) throw new Error("Inbox item not found.");

  const raw = inbox.raw_text.trim();
  const fallbackTitle = deriveTitle(raw);
  const fields = input.fields ?? {};

  const { data: existing } = await db
    .from("items")
    .select()
    .eq("inbox_item_id", inbox.id)
    .limit(1)
    .maybeSingle();

  let item: ItemRow;

  if (existing) {
    const kindChanged = existing.kind !== input.kind;
    const { data, error } = await db
      .from("items")
      .update({
        kind: input.kind,
        ...(kindChanged && existing.status !== "done"
          ? { status: defaultStatus(input.kind) }
          : {}),
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.body !== undefined ? { body: fields.body } : {}),
        ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
        ...(fields.due_at !== undefined ? { due_at: fields.due_at } : {}),
        ...(fields.workspace_id !== undefined ? { workspace_id: fields.workspace_id } : {}),
        ...(fields.project_id !== undefined ? { project_id: fields.project_id } : {}),
        ...(fields.category !== undefined ? { category: fields.category } : {}),
        ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error || !data) throw new Error(`Could not update item: ${error?.message}`);
    item = data;
  } else {
    const title = fields.title ?? fallbackTitle;
    const body =
      fields.body !== undefined ? fields.body : raw === title ? null : raw;
    const { data, error } = await db
      .from("items")
      .insert({
        kind: input.kind,
        title,
        body,
        source_text: inbox.raw_text,
        status: defaultStatus(input.kind),
        priority: fields.priority ?? null,
        due_at: fields.due_at ?? null,
        workspace_id: fields.workspace_id ?? null,
        project_id: fields.project_id ?? null,
        category: fields.category ?? null,
        tags: fields.tags ?? [],
        inbox_item_id: inbox.id,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`Could not create item: ${error?.message}`);
    item = data;
  }

  if (input.people?.length) {
    await linkPeople(db, item.id, input.people);
  }

  const { error: updateError } = await db
    .from("inbox_items")
    .update({
      status: input.inboxStatus ?? "processed",
      item_id: item.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inbox.id);
  if (updateError) {
    throw new Error(`Item saved but inbox not updated: ${updateError.message}`);
  }

  return item;
}

/** Find-or-create each person by name (or alias) and link them to the item. */
async function linkPeople(
  db: Db,
  itemId: string,
  people: { name: string; role: PersonRole }[],
): Promise<void> {
  const { data: known } = await db.from("people").select("id, name, aliases");
  const byName = new Map<string, string>();
  for (const p of known ?? []) {
    byName.set(p.name.toLowerCase(), p.id);
    for (const a of p.aliases) byName.set(a.toLowerCase(), p.id);
  }

  const links: { item_id: string; person_id: string; role: PersonRole }[] = [];
  for (const person of people) {
    const name = person.name.trim();
    if (!name) continue;
    let id = byName.get(name.toLowerCase());
    if (!id) {
      const { data, error } = await db
        .from("people")
        .insert({ name })
        .select("id")
        .single();
      if (error || !data) continue;
      id = data.id;
      byName.set(name.toLowerCase(), id);
    }
    links.push({ item_id: itemId, person_id: id, role: person.role });
  }

  if (links.length) {
    await db.from("item_people").upsert(links, { onConflict: "item_id,person_id,role" });
  }
}
