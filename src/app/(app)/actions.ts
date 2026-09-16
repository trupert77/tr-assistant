"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { captureText, promoteInboxItem } from "@/lib/capture";
import { createSupabaseServerClient } from "@/lib/db/server";

export type CaptureState = {
  ok?: boolean;
  error?: string;
  /** Changes on every success so the form can reset itself. */
  nonce?: number;
};

const captureSchema = z.object({
  text: z.string().trim().min(1, "Type something first.").max(10_000),
});

export async function captureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const parsed = captureSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const db = await createSupabaseServerClient();
    await captureText(db, { text: parsed.data.text, source: "web" });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }

  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true, nonce: Date.now() };
}

const promoteSchema = z.object({
  inboxItemId: z.uuid(),
  kind: z.enum(["task", "followup", "note"]),
});

export async function promoteAction(formData: FormData): Promise<void> {
  const parsed = promoteSchema.safeParse({
    inboxItemId: formData.get("inboxItemId"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return;

  const db = await createSupabaseServerClient();
  await promoteInboxItem(db, parsed.data);

  revalidatePath("/inbox");
  revalidatePath("/");
}
