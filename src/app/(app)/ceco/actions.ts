"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadCecoScope, syncCecoInitiatives, syncCecoScope } from "@/lib/ceco";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";

export type CecoActionResult = {
  ok: boolean;
  error?: string;
  pages?: number;
  version?: string;
  initiatives?: number;
  /** Why the initiatives board did not come through, when the scope did. */
  initiativesNote?: string;
};

/** Pull a fresh copy of CECO's scope and initiatives board now, instead of waiting for the next tick. */
export async function syncCecoAction(): Promise<CecoActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in again." };
  try {
    const db = await createSupabaseServerClient();
    const scope = await syncCecoScope(db, user.id);

    // The board is a second endpoint with a setting of its own on CECO's side,
    // so it can be off while the scope works. That is worth a line under the
    // button, not a failed sync.
    let initiatives: number | undefined;
    let initiativesNote: string | undefined;
    try {
      initiatives = (await syncCecoInitiatives(db, user.id)).initiatives.length;
    } catch (e) {
      initiativesNote = e instanceof Error ? e.message : "Could not read the initiatives board.";
    }

    revalidatePath("/", "layout");
    return { ok: true, pages: scope.pages.length, version: scope.app.version, initiatives, initiativesNote };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not sync." };
  }
}

const pageLinkSchema = z.object({
  itemId: z.uuid(),
  path: z.string().startsWith("/").max(300),
  linked: z.boolean(),
});

/** Say that an item is, or is no longer, about a CECO page. Only paths in the synced scope are accepted. */
export async function setItemCecoPageAction(input: z.input<typeof pageLinkSchema>): Promise<CecoActionResult> {
  const parsed = pageLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown page." };
  const { itemId, path, linked } = parsed.data;

  const db = await createSupabaseServerClient();
  if (linked) {
    const stored = await loadCecoScope(db);
    if (!stored?.scope.pages.some((p) => p.path === path)) {
      return { ok: false, error: "That page is not in CECO's scope." };
    }
    const { error } = await db.from("item_ceco_pages").upsert({ item_id: itemId, path }, { onConflict: "item_id,path" });
    if (error) return { ok: false, error: error.message };
  } else {
    await db.from("item_ceco_pages").delete().eq("item_id", itemId).eq("path", path);
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/ceco");
  revalidatePath("/map");
  return { ok: true };
}
