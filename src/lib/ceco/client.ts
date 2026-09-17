import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";

/**
 * How this app talks to CECO, and where it keeps what comes back.
 *
 * CECO (ceco.info) is a separate app with its own database; this one never
 * gets a key to it. It publishes a few read-only endpoints behind one bearer
 * token, and every one of them is fetched through `fetchCecoPayload` here, so
 * a connection problem reads the same way whichever endpoint hit it.
 *
 * Each payload's last good copy lives in `external_scopes`, one row per
 * source. Pages read that copy, never the live endpoint, so nothing here
 * breaks while CECO is down or mid-deploy.
 */

export type Db = SupabaseClient<Database>;

const FETCH_TIMEOUT_MS = 10_000;

export function isCecoConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.CECO_API_URL && env.CECO_API_TOKEN);
}

/**
 * GET one of CECO's assistant endpoints and validate the envelope it answers
 * with: `{ ok: true, [key]: payload }`. Throws with a message fit to show in
 * Settings — what to fix, not what went wrong.
 */
export async function fetchCecoPayload<T>(
  path: string,
  key: string,
  schema: z.ZodType<T>,
  supportedSchema: number,
): Promise<T> {
  const env = getServerEnv();
  if (!env.CECO_API_URL || !env.CECO_API_TOKEN) {
    throw new Error("CECO_API_URL and CECO_API_TOKEN are not set.");
  }

  const url = new URL(path, env.CECO_API_URL);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.CECO_API_TOKEN}` },
      cache: "no-store",
      // Never followed. `fetch` strips Authorization across origins, so
      // following a host redirect would drop the token and look like a wrong
      // one; and a redirect to /login means the endpoint is not public yet.
      // Both are worth telling apart, which happens below.
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Could not reach ${url.host}.`);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const target = location ? new URL(location, url) : null;
    // Same path, different host: ceco.info sending us to www.ceco.info.
    if (target && target.pathname === url.pathname) {
      throw new Error(`CECO redirects to ${target.origin}. Set CECO_API_URL to exactly that.`);
    }
    throw new Error(`CECO sent us to its login page. Deploy ${path} there first.`);
  }
  if (response.status === 401) {
    throw new Error("CECO rejected the token. CECO_API_TOKEN must match its ASSISTANT_API_TOKEN.");
  }
  if (response.status === 404) {
    throw new Error(`CECO has no ${path} yet. Deploy it there first.`);
  }
  if (response.status === 503) {
    // The endpoint says which of its own settings is missing, and that is
    // more use than anything this side could guess.
    throw new Error((await cecoError(response)) ?? "CECO says its assistant API is not configured.");
  }
  if (!response.ok) {
    throw new Error((await cecoError(response)) ?? `CECO answered ${response.status}.`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    throw new Error("CECO's answer was not in the expected shape.");
  }
  const parsed = schema.safeParse((body as Record<string, unknown>)[key]);
  if (!parsed.success) throw new Error("CECO's answer was not in the expected shape.");

  // A newer payload may have dropped or changed something this app reads, so
  // it is refused rather than half-understood. The parse above is lenient
  // about *added* fields on purpose.
  const version = (parsed.data as { schema?: unknown }).schema;
  if (typeof version === "number" && version > supportedSchema) {
    throw new Error(`CECO sent ${key} schema ${version}; this app understands ${supportedSchema}.`);
  }
  return parsed.data;
}

/** The `error` string CECO sent with a failure, when it sent one. */
async function cecoError(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" && message.trim() ? `CECO: ${message.trim()}` : null;
}

/**
 * Keep a payload as this source's last good copy. `userId` is written
 * explicitly so the service-role tick can call this too.
 */
export async function saveMirror(
  db: Db,
  userId: string,
  source: string,
  payload: unknown,
): Promise<void> {
  const { error } = await db.from("external_scopes").upsert(
    { user_id: userId, source, payload, fetched_at: new Date().toISOString() },
    { onConflict: "user_id,source" },
  );
  if (error) throw new Error(`Fetched it but could not save it: ${error.message}`);
}

/**
 * The last good copy, or null when there is none — not configured, never
 * synced, or the migration has not been run.
 */
export async function loadMirror(
  db: Db,
  source: string,
  userId?: string,
): Promise<{ payload: unknown; fetchedAt: string } | null> {
  let query = db.from("external_scopes").select("payload, fetched_at").eq("source", source);
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query.limit(1).maybeSingle();
  return data ? { payload: data.payload, fetchedAt: data.fetched_at } : null;
}

/**
 * For the tick: fetch only when the copy is missing or older than
 * `staleAfterMs`. Never throws — a sync that fails leaves the old copy in
 * place and the next tick tries again.
 */
export async function syncMirrorIfStale(
  db: Db,
  userId: string,
  source: string,
  staleAfterMs: number,
  sync: (db: Db, userId: string) => Promise<unknown>,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isCecoConfigured()) return false;
  try {
    const { data } = await db
      .from("external_scopes")
      .select("fetched_at")
      .eq("user_id", userId)
      .eq("source", source)
      .maybeSingle();
    if (data && now.getTime() - new Date(data.fetched_at).getTime() < staleAfterMs) return false;
    await sync(db, userId);
    return true;
  } catch {
    return false;
  }
}
