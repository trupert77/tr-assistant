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
  Recurrence,
} from "@/lib/db/types";

type Db = SupabaseClient<Database>;

const TITLE_MAX = 100;

/**
 * Store raw input in the inbox. This is the only write on the capture path,
 * so nothing the user types can be lost by a later step failing.
 */
export async function captureText(
  db: Db,
  input: {
    text: string;
    source: CaptureSource;
    userId?: string;
    /** Storage path of an attached photo, already uploaded. */
    attachmentPath?: string | null;
  },
): Promise<InboxItemRow> {
  const raw_text = input.text.trim();
  if (!raw_text) throw new Error("Nothing to capture.");

  const { data, error } = await db
    .from("inbox_items")
    .insert({
      raw_text,
      source: input.source,
      ...(input.userId ? { user_id: input.userId } : {}),
      ...(input.attachmentPath ? { attachment_path: input.attachmentPath } : {}),
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
  recurrence?: Recurrence | null;
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

  // A capture can split into several items; the inbox row points at the first.
  const { data: existing } = inbox.item_id
    ? await db.from("items").select().eq("id", inbox.item_id).maybeSingle()
    : await db
        .from("items")
        .select()
        .eq("inbox_item_id", inbox.id)
        .order("created_at")
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
        ...(fields.due_at !== undefined ? { due_at: fields.due_at, reminded_at: null } : {}),
        ...(fields.recurrence !== undefined ? { recurrence: fields.recurrence } : {}),
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
    item = await insertItem(db, inbox, input.kind, { ...fields, title, body });
  }

  if (input.people?.length) {
    await linkPeople(db, inbox.user_id, item.id, input.people);
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

/**
 * The one place an item row is born from an inbox row. `user_id` is always
 * written, so this works for the service-role client (capture API, cron)
 * as well as a signed-in session.
 */
async function insertItem(
  db: Db,
  inbox: InboxItemRow,
  kind: ItemKind,
  fields: PromoteFields & { title: string },
): Promise<ItemRow> {
  const { data, error } = await db
    .from("items")
    .insert({
      user_id: inbox.user_id,
      kind,
      title: fields.title,
      body: fields.body ?? null,
      source_text: inbox.raw_text,
      status: defaultStatus(kind),
      priority: fields.priority ?? null,
      due_at: fields.due_at ?? null,
      workspace_id: fields.workspace_id ?? null,
      project_id: fields.project_id ?? null,
      category: fields.category ?? null,
      tags: fields.tags ?? [],
      inbox_item_id: inbox.id,
      // Only sent when set, so captures keep working before the Phase 8 migration runs.
      ...(fields.recurrence ? { recurrence: fields.recurrence } : {}),
      ...(inbox.attachment_path ? { attachment_path: inbox.attachment_path } : {}),
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Could not create item: ${error?.message}`);
  return data;
}

/**
 * The second and later items of a capture that split into several. Skips a
 * title this inbox row already produced, so retrying a failed run is safe.
 */
export async function addItemFromInbox(
  db: Db,
  inbox: InboxItemRow,
  input: {
    kind: ItemKind;
    fields: PromoteFields & { title: string };
    people?: { name: string; role: PersonRole }[];
  },
): Promise<ItemRow> {
  const { data: same } = await db
    .from("items")
    .select()
    .eq("inbox_item_id", inbox.id)
    .eq("title", input.fields.title)
    .limit(1)
    .maybeSingle();
  if (same) return same;

  const item = await insertItem(db, inbox, input.kind, input.fields);
  if (input.people?.length) {
    await linkPeople(db, inbox.user_id, item.id, input.people);
  }
  return item;
}

/** Find-or-create each person by name (or alias) and link them to the item. */
async function linkPeople(
  db: Db,
  userId: string,
  itemId: string,
  people: { name: string; role: PersonRole }[],
): Promise<void> {
  const { data: known } = await db
    .from("people")
    .select("id, name, aliases")
    .eq("user_id", userId);
  const byName = new Map<string, string>();
  for (const p of known ?? []) {
    byName.set(p.name.toLowerCase(), p.id);
    for (const a of p.aliases) byName.set(a.toLowerCase(), p.id);
  }

  const links: { user_id: string; item_id: string; person_id: string; role: PersonRole }[] = [];
  for (const person of people) {
    const name = person.name.trim();
    if (!name) continue;
    let id = byName.get(name.toLowerCase());
    if (!id) {
      const { data, error } = await db
        .from("people")
        .insert({ name, user_id: userId })
        .select("id")
        .single();
      if (error || !data) continue;
      id = data.id;
      byName.set(name.toLowerCase(), id);
    }
    links.push({ user_id: userId, item_id: itemId, person_id: id, role: person.role });
  }

  if (links.length) {
    await db.from("item_people").upsert(links, { onConflict: "item_id,person_id,role" });
  }
}
