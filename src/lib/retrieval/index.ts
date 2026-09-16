import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerContext, ContextItem } from "@/lib/ai";
import type { Database, ItemRow } from "@/lib/db/types";
import { loadPeopleFor, loadProjectNames } from "@/lib/items/queries";

type Db = SupabaseClient<Database>;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "what", "when", "where", "who", "why", "how",
  "have", "has", "had", "did", "does", "about", "from", "that", "this", "there",
  "was", "were", "are", "you", "your", "need", "should", "any", "all", "get",
  "got", "can", "could", "would", "will", "into", "out", "not", "but", "still",
  "waiting", "wait", "show", "list", "tell", "know", "written", "said", "say",
  "everything", "anything", "something", "related", "things", "thing", "todo",
  "today", "week", "tomorrow", "overdue", "due", "done", "open", "down", "up",
  "last", "next", "this", "just", "also", "been", "than", "then", "them",
]);

/**
 * Turn free text into an OR'd prefix tsquery: "Kalamazoo networking" →
 * "kalamazoo:* | network:*". OR is deliberate; AND misses too much on short
 * notes. Ranking by how many terms hit happens in the caller.
 */
export function toSearchQuery(text: string): string | null {
  const tokens = [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9.\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  )].slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" | ");
}

/** Full-text search over title, body, and original capture. Any status except archived. */
export async function searchItems(db: Db, text: string, limit = 30): Promise<ItemRow[]> {
  const query = toSearchQuery(text);
  if (!query) return [];
  const { data } = await db
    .from("items")
    .select()
    .textSearch("search", query, { config: "english" })
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

const OPEN_CAP = 300;
const HIT_CAP = 40;

export type Retrieved = {
  ctx: AnswerContext;
  /** Full-text hits for the question, for the "Matches" list. */
  hits: ItemRow[];
  /** Every item in the context, by id, so cited ids can be rendered. */
  byId: Map<string, ItemRow>;
  people: Awaited<ReturnType<typeof loadPeopleFor>>;
  projects: Map<string, string>;
};

/**
 * Build what the model sees: every open item (capped) plus full-text hits
 * for the question across all statuses, so "what did I say about X" can
 * reach notes and finished items. At personal scale this fits comfortably.
 */
export async function retrieveForQuestion(
  db: Db,
  question: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<Retrieved> {
  const [{ data: open }, hits] = await Promise.all([
    db
      .from("items")
      .select()
      .in("status", ["open", "waiting"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(OPEN_CAP + 1),
    searchItems(db, question, HIT_CAP),
  ]);

  const truncated = (open?.length ?? 0) > OPEN_CAP;
  const byId = new Map<string, ItemRow>();
  for (const i of (open ?? []).slice(0, OPEN_CAP)) byId.set(i.id, i);
  for (const i of hits) byId.set(i.id, i);

  const ids = [...byId.keys()];
  const [people, projects] = await Promise.all([
    loadPeopleFor(db, ids),
    loadProjectNames(db),
  ]);

  const items: ContextItem[] = ids.map((id) => {
    const i = byId.get(id)!;
    return {
      id: i.id,
      kind: i.kind,
      status: i.status,
      title: i.title,
      body: i.body,
      priority: i.priority,
      due_at: i.due_at,
      category: i.category,
      tags: i.tags,
      project: i.project_id ? projects.get(i.project_id) ?? null : null,
      people: (people.get(i.id) ?? []).map((p) => ({ name: p.name, role: p.role })),
      created_at: i.created_at,
    };
  });

  return {
    ctx: { now, timeZone, items, truncated },
    hits,
    byId,
    people,
    projects,
  };
}
