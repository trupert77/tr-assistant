"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAiProviderConfigured } from "@/lib/ai";
import { AI_PREFERENCE_KEY, aiProviderNameSchema } from "@/lib/ai/preference";
import { createSupabaseServerClient } from "@/lib/db/server";

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
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
