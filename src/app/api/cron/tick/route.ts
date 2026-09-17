import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { getServerEnv } from "@/lib/env";
import { runTick } from "@/lib/push/tick";

/**
 * GET /api/cron/tick
 * Headers: Authorization: Bearer <CRON_SECRET>
 *
 * Sends the morning digest and due-time reminders, files captures that got
 * stuck, and tops up the search index. Vercel Cron calls it (see
 * vercel.json) and adds the header itself when CRON_SECRET is set. Anything
 * else that can make an authenticated GET works too, which is how timed
 * reminders get finer than Vercel's daily schedule: see the guide.
 */

export const maxDuration = 60;

function tokenMatches(header: string | null, expected: string): boolean {
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const admin = createSupabaseAdminClient();
  if (!env.CRON_SECRET || !admin) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (!tokenMatches(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runTick(admin));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tick failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
