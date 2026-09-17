import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifyImage } from "@/lib/ai";
import type { Database } from "@/lib/db/types";

type Db = SupabaseClient<Database>;

/** Private bucket created by the Phase 8 migration. Paths are `<user id>/<uuid>.<ext>`. */
const BUCKET = "captures";

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CaptureImageType = keyof typeof EXTENSIONS;

/** Just under the bucket's own 5 MB cap. The capture bar downsizes photos well below this. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isCaptureImageType(type: string): type is CaptureImageType {
  return type in EXTENSIONS;
}

/** Store a photo and return its path. The first folder is the user id, which the storage policies check. */
export async function uploadCaptureImage(
  db: Db,
  userId: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: CaptureImageType,
): Promise<string> {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("That photo is too large.");
  const path = `${userId}/${randomUUID()}.${EXTENSIONS[contentType]}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) throw new Error(`Could not save the photo: ${error.message}`);
  return path;
}

/** Load a stored photo for the classifier. Null when it cannot be read. */
export async function loadCaptureImage(db: Db, path: string): Promise<ClassifyImage | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const mediaType = isCaptureImageType(data.type) ? data.type : "image/jpeg";
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  return { mediaType, base64 };
}

/** A link the browser can load for an hour. Null when the file is gone. */
export async function signedCaptureUrl(db: Db, path: string): Promise<string | null> {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
