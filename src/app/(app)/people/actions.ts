"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const updateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  aliases: z.string().default(""),
  notes: z.preprocess(emptyToNull, z.string().trim().max(5000).nullable()),
});

export type PersonState = { error?: string; saved?: boolean };

/**
 * Rename a person or add aliases. Aliases let the classifier match "Matt"
 * and "Matthew Jones" to the same row.
 */
export async function updatePersonAction(
  _prev: PersonState,
  formData: FormData,
): Promise<PersonState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    aliases: formData.get("aliases"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { id, name, notes } = parsed.data;
  const aliases = [...new Set(
    parsed.data.aliases.split(",").map((a) => a.trim()).filter(Boolean),
  )].filter((a) => a.toLowerCase() !== name.toLowerCase());

  const db = await createSupabaseServerClient();
  const { error } = await db.from("people").update({ name, aliases, notes }).eq("id", id);
  if (error) {
    return {
      error: error.code === "23505" ? "Someone with that name already exists." : error.message,
    };
  }

  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  revalidatePath("/");
  return { saved: true };
}
