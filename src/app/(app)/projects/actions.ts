"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  workspace_id: z.preprocess(emptyToNull, z.uuid().nullable()),
});

export type ProjectState = { error?: string };

export async function createProjectAction(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    workspace_id: formData.get("workspace_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("projects")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create project." };

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

const updateSchema = createSchema.extend({
  id: z.uuid(),
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
});

export async function updateProjectAction(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    workspace_id: formData.get("workspace_id"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { id, ...fields } = parsed.data;
  const db = await createSupabaseServerClient();
  const { error } = await db.from("projects").update(fields).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  return {};
}

const idSchema = z.object({ id: z.uuid() });

/** Archive hides the project from lists; its items keep their link. */
export async function archiveProjectAction(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const db = await createSupabaseServerClient();
  await db.from("projects").update({ status: "archived" }).eq("id", parsed.data.id);
  revalidatePath("/projects");
  redirect("/projects");
}
