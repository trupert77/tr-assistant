"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAiProviderConfigured } from "@/lib/ai";
import { AI_PREFERENCE_KEY, aiProviderNameSchema } from "@/lib/ai/preference";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";
import { isPushConfigured, sendPush } from "@/lib/push";

export type SettingsState = {
  message?: string;
  error?: string;
};

export async function setPassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = z
    .object({
      password: z.string().min(8, "Use at least 8 characters."),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: "Passwords do not match.",
      path: ["confirm"],
    })
    .safeParse({
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };
  return { message: "Password saved." };
}

/** Save which provider files captures. Stored in auth user metadata. */
export async function setAiProvider(name: string): Promise<void> {
  const parsed = aiProviderNameSchema.safeParse(name);
  if (!parsed.success || !isAiProviderConfigured(parsed.data)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { [AI_PREFERENCE_KEY]: parsed.data },
  });
  if (error) throw new Error(error.message);
  // The switch under the capture bar lives in the app layout, so refresh everything.
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export type PushState = { ok: boolean; error?: string };

/** Save this device's push subscription. Re-subscribing the same device updates it in place. */
export async function subscribePushAction(subscription: unknown, userAgent: string): Promise<PushState> {
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "The browser returned an invalid subscription." };
  if (!isPushConfigured()) return { ok: false, error: "Push keys are not set on the server." };

  const db = await createSupabaseServerClient();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unsubscribePushAction(endpoint: string): Promise<PushState> {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Send a notification to every subscribed device, to prove the whole chain works. */
export async function sendTestPushAction(): Promise<PushState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const db = await createSupabaseServerClient();
  const delivered = await sendPush(db, user.id, {
    title: "TR Assistant",
    body: "Notifications are working. The morning digest lands here.",
    url: "/",
    tag: "test",
  });
  return delivered > 0
    ? { ok: true }
    : { ok: false, error: "No device accepted it. Try turning notifications off and on again." };
}
