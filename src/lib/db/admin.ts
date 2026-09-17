import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getServerEnv, publicEnv } from "@/lib/env";

/**
 * Service-role client for code that runs without a browser session: the
 * capture API and the cron tick. It bypasses row-level security, so every
 * write made with it must set `user_id` explicitly. Null when the key is
 * not configured.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let cachedUserId: string | undefined;

/** The id of the one allowed user, looked up from ALLOWED_EMAIL and cached. */
export async function resolveAllowedUserId(
  admin: SupabaseClient<Database>,
): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (error) throw new Error(error.message);
  const target = getServerEnv().ALLOWED_EMAIL.toLowerCase();
  cachedUserId = data.users.find((u) => u.email?.toLowerCase() === target)?.id;
  return cachedUserId ?? null;
}
