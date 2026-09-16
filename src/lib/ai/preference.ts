import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { getCurrentUser } from "@/lib/db/server";
import { getAiProvider, type AiProvider, type AiProviderName } from "./index";

/**
 * The user's chosen provider lives in Supabase auth user metadata under
 * `ai_provider`. That keeps it out of the schema and readable from both the
 * browser session and the service-role capture API.
 */
export const AI_PREFERENCE_KEY = "ai_provider";

export const aiProviderNameSchema = z.enum(["anthropic", "openai"]);

/** The saved choice on a user record, or null when unset or unrecognised. */
export function aiPreferenceOf(user: User | null | undefined): AiProviderName | null {
  const parsed = aiProviderNameSchema.safeParse(user?.user_metadata?.[AI_PREFERENCE_KEY]);
  return parsed.success ? parsed.data : null;
}

/**
 * Read the saved choice for `userId`. Works with a session client (server
 * components and actions) and with the service-role client used by the
 * capture API, which has no session and looks the user up by id instead.
 * Never throws: a lookup failure just means "use the default".
 */
export async function readAiPreference(
  db: SupabaseClient<never, never, never> | SupabaseClient,
  userId: string,
): Promise<AiProviderName | null> {
  try {
    const { data } = await db.auth.getUser();
    if (data.user) return data.user.id === userId ? aiPreferenceOf(data.user) : null;
    const { data: byId } = await db.auth.admin.getUserById(userId);
    return aiPreferenceOf(byId?.user);
  } catch {
    return null;
  }
}

/**
 * The provider for the signed-in user, honouring their saved choice. For
 * server components and actions; classification uses `readAiPreference`
 * because it may run without a session.
 */
export async function getUserAiProvider(): Promise<AiProvider | null> {
  return getAiProvider(aiPreferenceOf(await getCurrentUser()));
}
