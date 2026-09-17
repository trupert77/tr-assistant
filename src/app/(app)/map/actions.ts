"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { indexPendingItems } from "@/lib/ai/embeddings";
import { getUserAiProvider } from "@/lib/ai/preference";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";
import type { ItemRow } from "@/lib/db/types";
import {
  addLink,
  decideSuggestion,
  loadLinksFor,
  moveStep,
  removeLink,
  suggestLinksFor,
} from "@/lib/links";
import { hybridSearch } from "@/lib/retrieval";

export type ActionResult = { ok: boolean; error?: string };

const fail = (e: unknown): ActionResult => ({
  ok: false,
  error: e instanceof Error ? e.message : "Something went wrong.",
});

function refresh(...itemIds: string[]) {
  revalidatePath("/map");
  revalidatePath("/");
  for (const id of itemIds) revalidatePath(`/items/${id}`);
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

const positionsSchema = z
  .array(
    z.object({
      id: z
        .string()
        .max(400)
        .regex(/^((item|project|person):[0-9a-f-]{36}|ceco:app|ceco:area:[\w-]+|ceco:page:\/[\w\-./[\]]*)$/),
      x: z.number().finite(),
      y: z.number().finite(),
      pinned: z.boolean(),
    }),
  )
  .max(1500);

/** Remember where nodes sit. Called after a layout places new nodes, and after a drag. */
export async function saveMapPositionsAction(input: unknown): Promise<ActionResult> {
  const parsed = positionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid positions." };
  if (!parsed.data.length) return { ok: true };

  const db = await createSupabaseServerClient();
  const { error } = await db.from("map_positions").upsert(
    parsed.data.map((p) => ({
      node_id: p.id,
      x: p.x,
      y: p.y,
      pinned: p.pinned,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,node_id" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Tidy: forget every position that was not placed by hand, so the layout starts over around the pins. */
export async function resetMapLayoutAction(): Promise<ActionResult> {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("map_positions").delete().eq("pinned", false);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/map");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const linkSchema = z.object({
  from: z.uuid(),
  to: z.uuid(),
  kind: z.enum(["related", "step", "blocks"]),
});

/**
 * Connect two items. `step`: from is the step, to is the goal.
 * `blocks`: from has to happen before to.
 */
export async function linkItemsAction(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick two different items." };
  const { from, to, kind } = parsed.data;

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Sign in again." };
    const db = await createSupabaseServerClient();

    if (kind === "step") {
      const { data: goal } = await db.from("items").select("kind").eq("id", to).maybeSingle();
      if (goal?.kind !== "goal") return { ok: false, error: "Steps can only be added to a goal." };
    }
    await addLink(db, user.id, from, to, kind);
    refresh(from, to);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const pairSchema = z.object({ a: z.uuid(), b: z.uuid() });

export async function unlinkItemsAction(input: z.input<typeof pairSchema>): Promise<ActionResult> {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown items." };
  const db = await createSupabaseServerClient();
  await removeLink(db, parsed.data.a, parsed.data.b);
  refresh(parsed.data.a, parsed.data.b);
  return { ok: true };
}

export async function decideSuggestionAction(
  input: z.input<typeof pairSchema> & { accept: boolean },
): Promise<ActionResult> {
  const parsed = pairSchema.extend({ accept: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown items." };
  const db = await createSupabaseServerClient();
  await decideSuggestion(db, parsed.data.a, parsed.data.b, parsed.data.accept);
  refresh(parsed.data.a, parsed.data.b);
  return { ok: true };
}

/** Item-to-item connections of one item, for the map's side panel. */
export async function loadNodeLinksAction(itemId: string) {
  const parsed = z.uuid().safeParse(itemId);
  if (!parsed.success) return null;
  const db = await createSupabaseServerClient();
  return loadLinksFor(db, parsed.data);
}

/**
 * Look for connections nobody has drawn yet: bring the search index up to
 * date, then propose links for recent items from what is closest in meaning.
 */
export async function suggestConnectionsAction(): Promise<ActionResult & { added?: number }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Sign in again." };
    const db = await createSupabaseServerClient();
    await indexPendingItems(db, 100);

    const { data: recent } = await db
      .from("items")
      .select("id")
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: false })
      .limit(40);
    const added = await suggestLinksFor(db, user.id, (recent ?? []).map((i) => i.id));
    refresh();
    return { ok: true, added };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Goals and steps
// ---------------------------------------------------------------------------

const newStepsSchema = z.object({
  goalId: z.uuid(),
  steps: z
    .array(z.object({ title: z.string().trim().min(1).max(200), detail: z.string().max(1000).nullable() }))
    .min(1)
    .max(20),
});

/** Create tasks and attach them to the goal, in the order given, after any steps it has. */
export async function addStepsAction(input: z.input<typeof newStepsSchema>): Promise<ActionResult> {
  const parsed = newStepsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the step a name." };

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Sign in again." };
    const db = await createSupabaseServerClient();
    const { data: goal } = await db
      .from("items")
      .select("id, kind, workspace_id, project_id")
      .eq("id", parsed.data.goalId)
      .maybeSingle();
    if (goal?.kind !== "goal") return { ok: false, error: "That is not a goal." };

    for (const step of parsed.data.steps) {
      // Steps inherit the goal's workspace and project, so they cluster with it.
      const { data: item, error } = await db
        .from("items")
        .insert({
          kind: "task",
          title: step.title,
          body: step.detail,
          workspace_id: goal.workspace_id,
          project_id: goal.project_id,
        })
        .select("id")
        .single();
      if (error || !item) throw new Error(error?.message ?? "Could not create the step.");
      await addLink(db, user.id, item.id, goal.id, "step");
    }

    refresh(goal.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveStepAction(input: {
  goalId: string;
  stepId: string;
  direction: "up" | "down";
}): Promise<ActionResult> {
  const parsed = z
    .object({ goalId: z.uuid(), stepId: z.uuid(), direction: z.enum(["up", "down"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown step." };
  const db = await createSupabaseServerClient();
  await moveStep(db, parsed.data.goalId, parsed.data.stepId, parsed.data.direction);
  refresh(parsed.data.goalId);
  return { ok: true };
}

export type PlanResult = ActionResult & { steps?: { title: string; detail: string | null }[] };

/** Ask the assistant to break a goal down. Returns proposals; nothing is saved here. */
export async function planGoalAction(goalId: string): Promise<PlanResult> {
  const parsed = z.uuid().safeParse(goalId);
  if (!parsed.success) return { ok: false, error: "Unknown goal." };

  const provider = await getUserAiProvider();
  if (!provider) return { ok: false, error: "Add an AI key in Settings to plan goals." };

  try {
    const db = await createSupabaseServerClient();
    const { data: goal } = await db.from("items").select().eq("id", parsed.data).maybeSingle();
    if (!goal) return { ok: false, error: "Unknown goal." };
    const links = await loadLinksFor(db, goal.id);

    const steps = await provider.planGoal({
      title: goal.title,
      body: goal.body ?? goal.source_text,
      existingSteps: links.steps.map((s) => s.title),
    });
    return { ok: true, steps: steps.slice(0, 12) };
  } catch (e) {
    return fail(e);
  }
}

export type LinkCandidate = Pick<ItemRow, "id" | "kind" | "title" | "status">;

/** Find items to connect to, by keyword and by meaning, leaving out the item itself. */
export async function searchForLinkAction(query: string, excludeId: string): Promise<LinkCandidate[]> {
  const text = query.trim().slice(0, 200);
  if (text.length < 2) return [];
  const db = await createSupabaseServerClient();
  // Full-text search ignores short and common words; a plain title match catches those.
  const [hits, { data: byTitle }] = await Promise.all([
    hybridSearch(db, text, 12),
    db
      .from("items")
      .select()
      .ilike("title", `%${text.replace(/[%_\\]/g, "\\$&")}%`)
      .neq("status", "archived")
      .limit(8),
  ]);
  const seen = new Set<string>();
  return [...(byTitle ?? []), ...hits]
    .filter((i) => !seen.has(i.id) && Boolean(seen.add(i.id)))
    .filter((i) => i.id !== excludeId)
    .slice(0, 8)
    .map((i) => ({ id: i.id, kind: i.kind, title: i.title, status: i.status }));
}
