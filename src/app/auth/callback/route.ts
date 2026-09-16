import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Completes a magic-link sign-in. Handles both link styles Supabase can send:
 * the default `?code=` PKCE flow, and `?token_hash=&type=` if the email
 * template is customised. Redirects to `/` on success, `/login` on failure.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    failed = Boolean(error);
  }

  return NextResponse.redirect(new URL(failed ? "/login?error=link" : "/", origin));
}
