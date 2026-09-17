import type { SupabaseClient } from "@supabase/supabase-js";
import { configuredAiProviders, getAiProvider } from "@/lib/ai";
import type { Classification, ClassifyContext } from "@/lib/ai";
import { indexPendingItems } from "@/lib/ai/embeddings";
import { readAiPreference } from "@/lib/ai/preference";
import { MAX_ITEMS_PER_CAPTURE } from "@/lib/ai/types";
import { linkItemToCecoPages, loadCecoScope, type CecoScope } from "@/lib/ceco";
import { zonedToIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { suggestLinksFor } from "@/lib/links";
import { loadCaptureImage } from "./attachments";
import { addItemFromInbox, promoteInboxItem, type PromoteFields } from "./index";

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
 *
 * A capture that lists several things becomes several items; the inbox row
 * points at the first and goes to review if any of them needs it. A photo,
 * when there is one, is read by the model alongside the text.
 *
 * The provider is the user's saved choice when set, else the env default.
 * Each row records the model that filed it in `ai_model`.
 */
export async function classifyInboxItem(db: Db, inboxItemId: string): Promise<void> {
  if (configuredAiProviders().length === 0) return;

  const { data: inbox } = await db
    .from("inbox_items")
    .select()
    .eq("id", inboxItemId)
    .single();
  if (!inbox || inbox.status === "processed") return;

  const provider = getAiProvider(await readAiPreference(db, inbox.user_id));
  if (!provider) return;

  await db
    .from("inbox_items")
    .update({ status: "processing", ai_error: null })
    .eq("id", inbox.id);

  try {
    const [ctx, image] = await Promise.all([
      loadContext(db, inbox.user_id),
      inbox.attachment_path ? loadCaptureImage(db, inbox.attachment_path) : null,
    ]);
    const { results, model } = await provider.classify(inbox.raw_text, ctx, image ?? undefined);
    const filed = results.slice(0, MAX_ITEMS_PER_CAPTURE).map((result) => resolve(result, ctx));
    const [first, ...rest] = filed;

    const created: string[] = [];
    const firstItem = await promoteInboxItem(db, {
      inboxItemId: inbox.id,
      kind: first.result.kind,
      fields: first.fields,
      people: first.result.people,
      inboxStatus: filed.some((f) => f.needsReview) ? "needs_review" : "processed",
    });
    created.push(firstItem.id);
    for (const extra of rest) {
      const item = await addItemFromInbox(db, inbox, {
        kind: extra.result.kind,
        fields: extra.fields,
        people: extra.result.people,
      });
      created.push(item.id);
    }

    if (ctx.cecoScope) {
      for (const [n, entry] of filed.entries()) {
        if (entry.result.ceco_pages.length) {
          await linkItemToCecoPages(db, inbox.user_id, created[n], entry.result.ceco_pages, ctx.cecoScope);
        }
      }
    }

    await db
      .from("inbox_items")
      .update({
        ai_result: { items: filed.map((f) => f.result) },
        ai_confidence: Math.min(...filed.map((f) => f.result.confidence)),
        ai_model: model,
      })
      .eq("id", inbox.id);

    // Once the new items are searchable by meaning, see what they sit close
    // to. Proposals only: they show dotted on the map until accepted.
    if ((await indexPendingItems(db)) > 0) {
      await suggestLinksFor(db, inbox.user_id, created);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("inbox_items")
      .update({ status: "failed", ai_error: message })
      .eq("id", inbox.id);
  }
}

type Context = ClassifyContext & {
  workspaceIds: Map<string, string>;
  projectIds: Map<string, string>;
  cecoScope: CecoScope | null;
};

/** Turn the model's names and local dates into ids and instants. */
function resolve(
  result: Classification,
  ctx: Context,
): { result: Classification; fields: PromoteFields & { title: string }; needsReview: boolean } {
  const workspace = result.workspace_slug
    ? ctx.workspaceIds.get(result.workspace_slug.toLowerCase()) ?? null
    : null;
  const project = result.project_name
    ? ctx.projectIds.get(result.project_name.trim().toLowerCase()) ?? null
    : null;
  const unknownProject = Boolean(result.project_name && !project);

  return {
    result,
    fields: {
      title: result.title,
      body: result.body,
      priority: result.priority,
      due_at: result.due_date ? zonedToIso(result.due_date, result.due_time, ctx.timeZone) : null,
      recurrence: result.recurrence,
      workspace_id: workspace,
      project_id: project,
      category: result.category,
      tags: result.tags.map((t) => t.toLowerCase()),
    },
    needsReview: result.confidence < REVIEW_THRESHOLD || unknownProject,
  };
}

// Filtered by user explicitly: the capture API and cron run with the
// service-role client, which row-level security does not scope.
async function loadContext(db: Db, userId: string): Promise<Context> {
  const [{ data: workspaces }, { data: projects }, { data: people }, ceco] =
    await Promise.all([
      db.from("workspaces").select("id, name, slug").eq("user_id", userId).order("sort_order"),
      db
        .from("projects")
        .select("id, name, workspace_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("name"),
      db.from("people").select("name").eq("user_id", userId).order("name"),
      loadCecoScope(db, userId),
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
    cecoPages: (ceco?.scope.pages ?? []).map((p) => ({ path: p.path, title: p.title, area: p.area })),
    cecoScope: ceco?.scope ?? null,
    workspaceIds: new Map((workspaces ?? []).map((w) => [w.slug.toLowerCase(), w.id])),
    projectIds: new Map((projects ?? []).map((p) => [p.name.toLowerCase(), p.id])),
  };
}
