import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PHOTO_ONLY_TEXT } from "@/lib/ai/prompt";
import { captureText } from "@/lib/capture";
import {
  isCaptureImageType,
  uploadCaptureImage,
  type CaptureImageType,
} from "@/lib/capture/attachments";
import { classifyInboxItem } from "@/lib/capture/classify";
import { createSupabaseAdminClient, resolveAllowedUserId } from "@/lib/db/admin";
import { getServerEnv } from "@/lib/env";

/**
 * POST /api/capture
 * Headers: Authorization: Bearer <CAPTURE_API_TOKEN>
 * Body, either:
 *   JSON       { "text": "...", "image": "<base64>", "image_type": "image/jpeg" }
 *   multipart  text=...  image=<file>
 * `text` or `image` is required; both are fine. `source` may be "voice" or
 * "share" so the inbox shows where it came from.
 *
 * For iOS Shortcuts and other clients that have no browser session. Enabled
 * only when CAPTURE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY are both set.
 * The service-role client bypasses row-level security, so the user id is
 * resolved from ALLOWED_EMAIL and written explicitly.
 */

const fieldsSchema = z.object({
  text: z.string().trim().max(10_000).default(""),
  source: z.enum(["api", "voice", "share"]).catch("api"),
});

type Photo = { bytes: Uint8Array; type: CaptureImageType };

function tokenMatches(header: string | null, expected: string): boolean {
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pull text and an optional photo out of either body format. Null when malformed. */
async function readBody(
  request: NextRequest,
): Promise<{ text: string; source: "api" | "voice" | "share"; photo: Photo | null } | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    const fields = fieldsSchema.safeParse({
      text: form.get("text") ?? "",
      source: form.get("source"),
    });
    if (!fields.success) return null;
    const file = form.get("image");
    const photo =
      file instanceof File && file.size > 0 && isCaptureImageType(file.type)
        ? { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type }
        : null;
    return { ...fields.data, photo };
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") return null;
  const fields = fieldsSchema.safeParse(json);
  if (!fields.success) return null;
  const { image, image_type } = json as { image?: unknown; image_type?: unknown };
  const type = typeof image_type === "string" && isCaptureImageType(image_type) ? image_type : "image/jpeg";
  const photo =
    typeof image === "string" && image.length > 0
      ? { bytes: new Uint8Array(Buffer.from(image.replace(/^data:[^,]+,/, ""), "base64")), type }
      : null;
  return { ...fields.data, photo };
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const admin = createSupabaseAdminClient();
  if (!env.CAPTURE_API_TOKEN || !admin) {
    return NextResponse.json(
      { error: "Capture API is not configured." },
      { status: 503 },
    );
  }

  if (!tokenMatches(request.headers.get("authorization"), env.CAPTURE_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await readBody(request);
  if (!body || (!body.text && !body.photo)) {
    return NextResponse.json({ error: "Body must include text or image." }, { status: 400 });
  }

  try {
    const userId = await resolveAllowedUserId(admin);
    if (!userId) {
      return NextResponse.json(
        { error: "Allowed user has not signed in yet." },
        { status: 409 },
      );
    }

    const attachmentPath = body.photo
      ? await uploadCaptureImage(admin, userId, body.photo.bytes, body.photo.type)
      : null;
    const row = await captureText(admin, {
      text: body.text || PHOTO_ONLY_TEXT,
      source: body.source,
      userId,
      attachmentPath,
    });

    // File it after the response, the same way the capture bar does.
    after(() => classifyInboxItem(admin, row.id));

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
