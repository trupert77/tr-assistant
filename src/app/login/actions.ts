"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

export type LoginState = {
  message?: string;
  error?: string;
};

const emailSchema = z.email();

function isAllowed(email: string) {
  return email.toLowerCase() === getServerEnv().ALLOWED_EMAIL.toLowerCase();
}

/** Sends a magic link. Responds identically for unknown emails so nothing is revealed. */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const email = parsed.data;
  const sent = { message: "If that address is allowed, a sign-in link is on its way." };
  if (!isAllowed(email)) return sent;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getServerEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return sent;
}

export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1) })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return { error: "Enter your email and password." };

  const { email, password } = parsed.data;
  if (!isAllowed(email)) return { error: "Invalid email or password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };

  redirect("/");
}
