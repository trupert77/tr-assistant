import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { captureText } from "@/lib/capture";
import type { Database } from "@/lib/db/types";
import { getServerEnv, publicEnv } from "@/lib/env";

/**
 * POST /api/capture
 * Headers: Authorization: Bearer <CAPTURE_API_TOKEN>
 * Body:    { "text": "..." }
 *
 * For iOS Shortcuts and other clients that have no browser session. Enabled
 * only when CAPTURE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY are both set.
 * The service-role client bypasses row-level security, so the user id is
 * resolved from ALLOWED_EMAIL and written explicitly.
 */

const bodySchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

let cachedUserId: string | undefined;

function tokenMatches(header: string | null, expected: string): boolean {
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.CAPTURE_API_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Capture API is not configured." },
      { status: 503 },
    );
  }

  if (!tokenMatches(request.headers.get("authorization"), env.CAPTURE_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { text }." }, { status: 400 });
  }

  const admin = createClient<Database>(
    publicEnv.supabaseUrl,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  if (!cachedUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const target = env.ALLOWED_EMAIL.toLowerCase();
    cachedUserId = data.users.find((u) => u.email?.toLowerCase() === target)?.id;
    if (!cachedUserId) {
      return NextResponse.json(
        { error: "Allowed user has not signed in yet." },
        { status: 409 },
      );
    }
  }

  try {
    const row = await captureText(admin, {
      text: parsed.data.text,
      source: "api",
      userId: cachedUserId,
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
