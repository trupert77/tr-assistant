import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";

type Db = SupabaseClient<Database>;

/**
 * Semantic search. Embeddings come from OpenAI regardless of which provider
 * files captures, because Anthropic has no embeddings endpoint. Without
 * OPENAI_API_KEY every function here is a no-op and search stays keyword-only.
 */

let client: OpenAI | undefined;

function getClient(): OpenAI | null {
  const key = getServerEnv().OPENAI_API_KEY;
  if (!key) return null;
  client ??= new OpenAI({ apiKey: key });
  return client;
}

export function isSemanticSearchEnabled(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY);
}

/** Must match `vector(1536)` in the migration. */
const DIMENSIONS = 1536;
const MAX_CHARS = 8000;

async function embed(texts: string[]): Promise<number[][] | null> {
  const openai = getClient();
  if (!openai || !texts.length) return null;
  const response = await openai.embeddings.create({
    model: getServerEnv().OPENAI_EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, MAX_CHARS)),
    dimensions: DIMENSIONS,
  });
  return response.data.map((d) => d.embedding);
}

/** pgvector's text form. */
const toVector = (values: number[]) => `[${values.join(",")}]`;

/**
 * Embed items whose text changed since they were last embedded, oldest
 * first. Cheap to call often: it asks Postgres for the stale set and returns
 * at once when there is none. Never throws; search just stays a little
 * behind if OpenAI is down.
 */
export async function indexPendingItems(db: Db, limit = 25): Promise<number> {
  if (!isSemanticSearchEnabled()) return 0;
  try {
    const { data: stale, error } = await db.rpc("items_to_embed", { max_count: limit });
    if (error || !stale?.length) return 0;

    const vectors = await embed(
      stale.map((i) => [i.title, i.body, i.source_text].filter(Boolean).join("\n")),
    );
    if (!vectors) return 0;

    const { error: writeError } = await db.from("item_embeddings").upsert(
      stale.map((item, n) => ({
        item_id: item.id,
        user_id: item.user_id,
        content_hash: item.content_hash,
        embedding: toVector(vectors[n]),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "item_id" },
    );
    return writeError ? 0 : stale.length;
  } catch {
    return 0;
  }
}

/** Ids of the items closest in meaning to `query`, best first. Empty on any failure. */
export async function semanticMatches(
  db: Db,
  query: string,
  limit = 20,
): Promise<{ id: string; similarity: number }[]> {
  if (!isSemanticSearchEnabled() || !query.trim()) return [];
  try {
    const vectors = await embed([query]);
    if (!vectors) return [];
    const { data, error } = await db.rpc("match_items", {
      query_embedding: toVector(vectors[0]),
      match_count: limit,
    });
    if (error) return [];
    return (data ?? []).map((row) => ({ id: row.item_id, similarity: row.similarity }));
  } catch {
    return [];
  }
}
