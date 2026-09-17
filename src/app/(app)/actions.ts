"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { PHOTO_ONLY_TEXT } from "@/lib/ai/prompt";
import { captureText, promoteInboxItem } from "@/lib/capture";
import { isCaptureImageType, uploadCaptureImage } from "@/lib/capture/attachments";
import { classifyInboxItem } from "@/lib/capture/classify";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";
import { reopenItem } from "@/lib/items/mutations";

export type CaptureState = {
  ok?: boolean;
  error?: string;
  /** Changes on every success so the form can reset itself. */
  nonce?: number;
};

const captureSchema = z.object({
  text: z.string().trim().max(10_000),
  // "voice" when the text was dictated with the mic, "share" from the share sheet.
  source: z.enum(["web", "voice", "share"]).catch("web"),
});

function refresh() {
  revalidatePath("/", "layout");
}

export async function captureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const parsed = captureSchema.safeParse({
    text: formData.get("text") ?? "",
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const image = formData.get("image");
  const photo = image instanceof File && image.size > 0 ? image : null;
  if (!parsed.data.text && !photo) return { error: "Type something first." };
  if (photo && !isCaptureImageType(photo.type)) {
    return { error: "Photos need to be JPEG, PNG, or WebP." };
  }

  let inboxId: string;
  const db = await createSupabaseServerClient();
  try {
    let attachmentPath: string | null = null;
    if (photo && isCaptureImageType(photo.type)) {
      const user = await getCurrentUser();
      if (!user) return { error: "Sign in again to add a photo." };
      attachmentPath = await uploadCaptureImage(db, user.id, await photo.arrayBuffer(), photo.type);
    }
    const row = await captureText(db, {
      text: parsed.data.text || PHOTO_ONLY_TEXT,
      source: parsed.data.source,
      attachmentPath,
    });
    inboxId = row.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }

  // Classify after the response is sent so capture feels instant. The client
  // was created inside the request, so it carries the session into `after`.
  after(() => classifyInboxItem(db, inboxId));

  refresh();
  return { ok: true, nonce: Date.now() };
}

const idSchema = z.object({ inboxItemId: z.uuid() });

const promoteSchema = idSchema.extend({
  kind: z.enum(["task", "followup", "note", "goal"]),
});

/** Manual filing, or re-filing after the AI picked a different kind. */
export async function promoteAction(formData: FormData): Promise<void> {
  const parsed = promoteSchema.safeParse({
    inboxItemId: formData.get("inboxItemId"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  await promoteInboxItem(db, parsed.data);
  refresh();
}

/** Accept the AI's filing as-is for a needs_review row. */
export async function acceptAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ inboxItemId: formData.get("inboxItemId") });
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  await db
    .from("inbox_items")
    .update({ status: "processed" })
    .eq("id", parsed.data.inboxItemId)
    .eq("status", "needs_review");
  refresh();
}

/** Run (or re-run) classification on a pending or failed row. */
export async function classifyAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ inboxItemId: formData.get("inboxItemId") });
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  await classifyInboxItem(db, parsed.data.inboxItemId);
  refresh();
}

const reviewProjectSchema = idSchema.extend({
  name: z.string().trim().min(1).max(120),
});

/**
 * The classifier proposed a project that doesn't exist. Create it (in the
 * item's workspace), link the item, and mark the inbox row processed.
 */
export async function createProjectFromReviewAction(formData: FormData): Promise<void> {
  const parsed = reviewProjectSchema.safeParse({
    inboxItemId: formData.get("inboxItemId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  const { data: inbox } = await db
    .from("inbox_items")
    .select("id, item_id")
    .eq("id", parsed.data.inboxItemId)
    .single();
  if (!inbox?.item_id) return;

  const { data: item } = await db
    .from("items")
    .select("id, workspace_id")
    .eq("id", inbox.item_id)
    .single();
  if (!item) return;

  // Reuse an existing project of the same name rather than duplicating.
  const { data: existing } = await db
    .from("projects")
    .select("id")
    .ilike("name", parsed.data.name)
    .limit(1)
    .maybeSingle();

  let projectId = existing?.id;
  if (!projectId) {
    const { data: created } = await db
      .from("projects")
      .insert({ name: parsed.data.name, workspace_id: item.workspace_id })
      .select("id")
      .single();
    if (!created) return;
    projectId = created.id;
  }

  await db.from("items").update({ project_id: projectId }).eq("id", item.id);
  await db.from("inbox_items").update({ status: "processed" }).eq("id", inbox.id);

  refresh();
  revalidatePath("/projects");
}

const discardUndoSchema = z.object({
  inboxItemId: z.uuid(),
  /** The status to put the row back to. */
  status: z.enum(["pending", "processing", "processed", "needs_review", "failed"]),
  /** The items the delete archived, so Undo reopens only those. */
  itemIds: z.array(z.uuid()),
});

export type DiscardUndo = z.infer<typeof discardUndoSchema>;

/**
 * Delete a capture from the inbox. Like Archive, this keeps the row: it moves
 * to `discarded`, which no list asks for, and anything the capture already
 * became is archived. Returns what Undo needs to put it all back.
 */
export async function discardAction(inboxItemId: string): Promise<DiscardUndo | null> {
  const parsed = idSchema.safeParse({ inboxItemId });
  if (!parsed.success) return null;

  const db = await createSupabaseServerClient();
  const { data: row } = await db
    .from("inbox_items")
    .select("id, status")
    .eq("id", parsed.data.inboxItemId)
    .maybeSingle();
  if (!row || row.status === "discarded") return null;

  // Only the items still in play, so Undo doesn't reopen one that was already
  // archived or finished before the capture was deleted.
  const { data: live } = await db
    .from("items")
    .select("id")
    .eq("inbox_item_id", row.id)
    .in("status", ["open", "waiting"]);
  const itemIds = (live ?? []).map((i) => i.id);
  if (itemIds.length) {
    await db.from("items").update({ status: "archived" }).in("id", itemIds);
  }

  await db.from("inbox_items").update({ status: "discarded" }).eq("id", row.id);

  refresh();
  return { inboxItemId: row.id, status: row.status, itemIds };
}

/** Undo a delete: the capture comes back to the inbox with its items. */
export async function undiscardAction(undo: DiscardUndo): Promise<void> {
  const parsed = discardUndoSchema.safeParse(undo);
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  await db
    .from("inbox_items")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.inboxItemId)
    .eq("status", "discarded");
  for (const id of parsed.data.itemIds) await reopenItem(db, id);

  refresh();
}
