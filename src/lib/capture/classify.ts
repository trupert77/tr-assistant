import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiProvider } from "@/lib/ai";
import type { ClassifyContext } from "@/lib/ai";
import { zonedToIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { promoteInboxItem } from "./index";

type Db = SupabaseClient<Database>;

/** Below this the item is still created, but the inbox row stays visible for review. */
export const REVIEW_THRESHOLD = 0.7;

/**
 * Run the AI classifier on one inbox item and file the result.
 *
 * Outcomes, all of which keep the raw text:
 * - no provider configured → row stays `pending` for manual filing
 * - classifier throws       → row becomes `failed` with the error text
 * - low confidence or an unknown project → item created, row `needs_review`
 * - otherwise               → item created, row `processed`
 */
export async function classifyInboxItem(db: Db, inboxItemId: string): Promise<void> {
  const provider = getAiProvider();
  if (!provider) return;

  const { data: inbox } = await db
    .from("inbox_items")
    .select()
    .eq("id", inboxItemId)
    .single();
  if (!inbox || inbox.status === "processed") return;

  await db
    .from("inbox_items")
    .update({ status: "processing", ai_error: null })
    .eq("id", inbox.id);

  try {
    const ctx = await loadContext(db);
    const { result, model } = await provider.classify(inbox.raw_text, ctx);

    const workspace = result.workspace_slug
      ? ctx.workspaceIds.get(result.workspace_slug.toLowerCase()) ?? null
      : null;
    const project = result.project_name
      ? ctx.projectIds.get(result.project_name.trim().toLowerCase()) ?? null
      : null;
    const unknownProject = Boolean(result.project_name && !project);
    const due_at = result.due_date
      ? zonedToIso(result.due_date, result.due_time, ctx.timeZone)
      : null;

    const needsReview = result.confidence < REVIEW_THRESHOLD || unknownProject;

    await promoteInboxItem(db, {
      inboxItemId: inbox.id,
      kind: result.kind,
      fields: {
        title: result.title,
        body: result.body,
        priority: result.priority,
        due_at,
        workspace_id: workspace,
        project_id: project,
        category: result.category,
        tags: result.tags.map((t) => t.toLowerCase()),
      },
      people: result.people,
      inboxStatus: needsReview ? "needs_review" : "processed",
    });

    await db
      .from("inbox_items")
      .update({
        ai_result: result,
        ai_confidence: result.confidence,
        ai_model: model,
      })
      .eq("id", inbox.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("inbox_items")
      .update({ status: "failed", ai_error: message })
      .eq("id", inbox.id);
  }
}

async function loadContext(db: Db): Promise<
  ClassifyContext & {
    workspaceIds: Map<string, string>;
    projectIds: Map<string, string>;
  }
> {
  const [{ data: workspaces }, { data: projects }, { data: people }] =
    await Promise.all([
      db.from("workspaces").select("id, name, slug").order("sort_order"),
      db
        .from("projects")
        .select("id, name, workspace_id")
        .eq("status", "active")
        .order("name"),
      db.from("people").select("name").order("name"),
    ]);

  const wsById = new Map((workspaces ?? []).map((w) => [w.id, w.slug]));

  return {
    now: new Date(),
    timeZone: getServerEnv().APP_TIMEZONE,
    workspaces: (workspaces ?? []).map((w) => ({ name: w.name, slug: w.slug })),
    projects: (projects ?? []).map((p) => ({
      name: p.name,
      workspaceSlug: p.workspace_id ? wsById.get(p.workspace_id) ?? null : null,
    })),
    people: (people ?? []).map((p) => p.name),
    workspaceIds: new Map((workspaces ?? []).map((w) => [w.slug.toLowerCase(), w.id])),
    projectIds: new Map((projects ?? []).map((p) => [p.name.toLowerCase(), p.id])),
  };
}
