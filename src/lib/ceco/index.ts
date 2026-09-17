import { z } from "zod";
import { type Db, fetchCecoPayload, loadMirror, saveMirror, syncMirrorIfStale } from "./client";

/**
 * The CECO portal (ceco.info), seen from outside. CECO is a separate app with
 * its own database; this one never gets a key to it. CECO publishes a
 * description of itself at GET /api/assistant/scope: its areas, its pages,
 * and recent What's New entries, with no employee or customer data. This
 * module fetches that, keeps the last good copy in `external_scopes`, and
 * records which pages an item is about.
 *
 * Read-only by design. Nothing here can change anything in CECO.
 *
 * The private initiatives board is a second endpoint and lives in
 * `./initiatives`; the transport both share is in `./client`.
 */

export { isCecoConfigured } from "./client";
export * from "./initiatives";

export const CECO_SOURCE = "ceco";

/** The tick refreshes the copy when it is older than this. */
const STALE_AFTER_MS = 6 * 3_600_000;

// Lenient on purpose: CECO may add fields or areas without breaking the mirror.
const scopeSchema = z.object({
  schema: z.number(),
  generatedAt: z.string(),
  app: z.object({
    name: z.string(),
    version: z.string(),
    commit: z.string(),
    buildDate: z.string(),
    url: z.string(),
  }),
  areas: z.array(z.object({ key: z.string(), label: z.string(), emoji: z.string(), blurb: z.string() })),
  pages: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      area: z.string(),
      kind: z.string(),
      permission: z.string().nullable(),
      keywords: z.array(z.string()),
    }),
  ),
  updates: z.array(
    z.object({
      date: z.string(),
      publishedAt: z.string(),
      title: z.string(),
      pages: z.array(z.string()),
      areas: z.array(z.string()),
      items: z.array(z.string()),
    }),
  ),
});

export type CecoScope = z.infer<typeof scopeSchema>;
export type CecoPage = CecoScope["pages"][number];
export type CecoUpdate = CecoScope["updates"][number];

/** The newest scope shape this app understands. */
const SUPPORTED_SCHEMA = 1;

/** Ask CECO for its scope. Throws with a message fit to show in Settings. */
export async function fetchCecoScope(): Promise<CecoScope> {
  return fetchCecoPayload("/api/assistant/scope", "scope", scopeSchema, SUPPORTED_SCHEMA);
}

/** Fetch and store. `userId` is written explicitly so the service-role tick can call this too. */
export async function syncCecoScope(db: Db, userId: string): Promise<CecoScope> {
  const scope = await fetchCecoScope();
  await saveMirror(db, userId, CECO_SOURCE, scope);
  return scope;
}

/** For the tick: refresh only when the copy is missing or old. Never throws. */
export async function syncCecoScopeIfStale(db: Db, userId: string, now: Date = new Date()): Promise<boolean> {
  return syncMirrorIfStale(db, userId, CECO_SOURCE, STALE_AFTER_MS, syncCecoScope, now);
}

export type StoredCecoScope = { scope: CecoScope; fetchedAt: string };

/** The last good copy, or null when there is none (not configured, never synced, migration not run). */
export async function loadCecoScope(db: Db, userId?: string): Promise<StoredCecoScope | null> {
  const stored = await loadMirror(db, CECO_SOURCE, userId);
  if (!stored) return null;
  const parsed = scopeSchema.safeParse(stored.payload);
  return parsed.success ? { scope: parsed.data, fetchedAt: stored.fetchedAt } : null;
}

/** Attach an item to CECO pages. Paths that are not in the scope are dropped, so the model cannot invent one. */
export async function linkItemToCecoPages(
  db: Db,
  userId: string,
  itemId: string,
  paths: string[],
  scope: CecoScope,
): Promise<void> {
  const known = new Set(scope.pages.map((p) => p.path));
  const rows = [...new Set(paths)]
    .filter((path) => known.has(path))
    .slice(0, 5)
    .map((path) => ({ user_id: userId, item_id: itemId, path }));
  if (rows.length) await db.from("item_ceco_pages").upsert(rows, { onConflict: "item_id,path" });
}

/** item id → the CECO paths it is about. */
export async function loadCecoPagesFor(db: Db, itemIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!itemIds.length) return map;
  const { data } = await db.from("item_ceco_pages").select("item_id, path").in("item_id", itemIds);
  for (const row of data ?? []) map.set(row.item_id, [...(map.get(row.item_id) ?? []), row.path]);
  return map;
}
