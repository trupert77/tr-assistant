import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ItemLinkRow, ItemRow, LinkKind } from "@/lib/db/types";

type Db = SupabaseClient<Database>;

/**
 * Connections between items: "related", "step toward a goal", and "blocks".
 * A pair of items has at most one link (the table's key is the ordered pair,
 * and every write here checks the reverse direction first), so the map never
 * has to draw two lines between the same two nodes.
 */

export type LinkedItem = Pick<ItemRow, "id" | "kind" | "title" | "status" | "due_at">;

export type ItemLinks = {
  /** When this item is a goal: its steps in order. */
  steps: LinkedItem[];
  /** Goals this item is a step toward. */
  goals: LinkedItem[];
  related: LinkedItem[];
  /** Items that must be done before this one. */
  blockedBy: LinkedItem[];
  /** Items waiting on this one. */
  blocks: LinkedItem[];
  /** Proposed by the similarity search, not yet accepted. */
  suggested: LinkedItem[];
};

const LINKED_COLUMNS = "id, kind, title, status, due_at";

/** The link between two items in either direction, if any. */
async function findLink(db: Db, a: string, b: string): Promise<ItemLinkRow | null> {
  const { data } = await db
    .from("item_links")
    .select()
    .or(
      `and(from_item_id.eq.${a},to_item_id.eq.${b}),and(from_item_id.eq.${b},to_item_id.eq.${a})`,
    )
    .limit(1)
    .maybeSingle();
  return data;
}

/** Everything connected to one item, grouped the way its page shows it. */
export async function loadLinksFor(db: Db, itemId: string): Promise<ItemLinks> {
  const { data: links } = await db
    .from("item_links")
    .select()
    .or(`from_item_id.eq.${itemId},to_item_id.eq.${itemId}`)
    .neq("status", "dismissed");

  const otherIds = [
    ...new Set((links ?? []).map((l) => (l.from_item_id === itemId ? l.to_item_id : l.from_item_id))),
  ];
  const { data: items } = otherIds.length
    ? await db.from("items").select(LINKED_COLUMNS).in("id", otherIds).neq("status", "archived")
    : { data: [] as LinkedItem[] };
  const byId = new Map((items ?? []).map((i) => [i.id, i as LinkedItem]));

  const out: ItemLinks = { steps: [], goals: [], related: [], blockedBy: [], blocks: [], suggested: [] };
  const ordered = [...(links ?? [])].sort(
    (a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.created_at.localeCompare(b.created_at),
  );

  for (const link of ordered) {
    const outgoing = link.from_item_id === itemId;
    const other = byId.get(outgoing ? link.to_item_id : link.from_item_id);
    if (!other) continue;
    if (link.status === "suggested") out.suggested.push(other);
    else if (link.kind === "related") out.related.push(other);
    else if (link.kind === "step") (outgoing ? out.goals : out.steps).push(other);
    else (outgoing ? out.blocks : out.blockedBy).push(other);
  }
  return out;
}

/**
 * Connect two items. For "step", `from` is the step and `to` the goal; for
 * "blocks", `from` comes first. An existing link between the pair (including
 * a suggestion or a dismissal) is replaced, so the newest decision wins.
 */
export async function addLink(
  db: Db,
  userId: string,
  from: string,
  to: string,
  kind: LinkKind,
): Promise<void> {
  if (from === to) throw new Error("An item cannot link to itself.");

  const existing = await findLink(db, from, to);
  if (existing) {
    await db
      .from("item_links")
      .delete()
      .eq("from_item_id", existing.from_item_id)
      .eq("to_item_id", existing.to_item_id);
  }

  let position: number | null = null;
  if (kind === "step") {
    const { data: last } = await db
      .from("item_links")
      .select("position")
      .eq("to_item_id", to)
      .eq("kind", "step")
      .order("position", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    position = (last?.position ?? 0) + 1;
  }

  const { error } = await db.from("item_links").insert({
    user_id: userId,
    from_item_id: from,
    to_item_id: to,
    kind,
    status: "confirmed",
    position,
  });
  if (error) throw new Error(error.message);
}

/** Remove whatever link joins the two items. */
export async function removeLink(db: Db, a: string, b: string): Promise<void> {
  const existing = await findLink(db, a, b);
  if (!existing) return;
  await db
    .from("item_links")
    .delete()
    .eq("from_item_id", existing.from_item_id)
    .eq("to_item_id", existing.to_item_id);
}

/** Accept or dismiss a suggestion. Dismissed rows stay so the pair is not proposed again. */
export async function decideSuggestion(
  db: Db,
  a: string,
  b: string,
  accept: boolean,
): Promise<void> {
  const existing = await findLink(db, a, b);
  if (!existing || existing.status !== "suggested") return;
  await db
    .from("item_links")
    .update({ status: accept ? "confirmed" : "dismissed" })
    .eq("from_item_id", existing.from_item_id)
    .eq("to_item_id", existing.to_item_id);
}

/** Swap a step with its neighbour. Positions are rewritten 1..n so gaps never build up. */
export async function moveStep(
  db: Db,
  goalId: string,
  stepId: string,
  direction: "up" | "down",
): Promise<void> {
  const { data: links } = await db
    .from("item_links")
    .select()
    .eq("to_item_id", goalId)
    .eq("kind", "step")
    .eq("status", "confirmed")
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at");
  const order = (links ?? []).map((l) => l.from_item_id);
  const at = order.indexOf(stepId);
  const swap = direction === "up" ? at - 1 : at + 1;
  if (at < 0 || swap < 0 || swap >= order.length) return;
  [order[at], order[swap]] = [order[swap], order[at]];

  await Promise.all(
    order.map((id, n) =>
      db
        .from("item_links")
        .update({ position: n + 1 })
        .eq("from_item_id", id)
        .eq("to_item_id", goalId),
    ),
  );
}

/** How many suggestions one item may collect, and how alike two items must be. */
const SUGGESTIONS_PER_ITEM = 3;
const SUGGEST_MIN_SIMILARITY = 0.5;

/**
 * Propose "related" links for items from what is closest in meaning. Pairs
 * that already have any link, accepted or dismissed, are left alone. Quietly
 * does nothing when embeddings are off or the migration has not run.
 */
export async function suggestLinksFor(db: Db, userId: string, itemIds: string[]): Promise<number> {
  let added = 0;
  for (const itemId of itemIds) {
    try {
      const { data: near, error } = await db.rpc("related_items", {
        source_id: itemId,
        match_count: SUGGESTIONS_PER_ITEM + 3,
        min_similarity: SUGGEST_MIN_SIMILARITY,
      });
      if (error || !near?.length) continue;

      let mine = 0;
      for (const match of near) {
        if (mine >= SUGGESTIONS_PER_ITEM) break;
        if (await findLink(db, itemId, match.item_id)) continue;
        const { error: writeError } = await db.from("item_links").insert({
          user_id: userId,
          from_item_id: itemId,
          to_item_id: match.item_id,
          kind: "related",
          status: "suggested",
        });
        if (!writeError) {
          mine += 1;
          added += 1;
        }
      }
    } catch {
      // A suggestion is a nicety; never let it fail a capture.
    }
  }
  return added;
}

export type GoalProgress = {
  goal: LinkedItem;
  done: number;
  total: number;
  /** The first unfinished step whose blockers are all done, if any. */
  next: ItemRow | null;
};

/**
 * Progress and the next actionable step for every open goal. "Actionable"
 * means not done, and nothing that blocks it is still open. This is what
 * puts a goal's next move on Today without the goal needing a date.
 */
export async function loadGoalProgress(db: Db): Promise<GoalProgress[]> {
  const { data: goals } = await db
    .from("items")
    .select(LINKED_COLUMNS)
    .eq("kind", "goal")
    .in("status", ["open", "waiting"])
    .order("created_at");
  if (!goals?.length) return [];

  const { data: stepLinks } = await db
    .from("item_links")
    .select()
    .eq("kind", "step")
    .eq("status", "confirmed")
    .in("to_item_id", goals.map((g) => g.id));
  const stepIds = [...new Set((stepLinks ?? []).map((l) => l.from_item_id))];
  if (!stepIds.length) {
    return goals.map((goal) => ({ goal: goal as LinkedItem, done: 0, total: 0, next: null }));
  }

  const [{ data: steps }, { data: blockLinks }] = await Promise.all([
    db.from("items").select().in("id", stepIds).neq("status", "archived"),
    db
      .from("item_links")
      .select("from_item_id, to_item_id")
      .eq("kind", "blocks")
      .eq("status", "confirmed")
      .in("to_item_id", stepIds),
  ]);
  const stepById = new Map((steps ?? []).map((s) => [s.id, s]));

  // A blocker outside the goal's own steps still counts, so look those up too.
  const blockerIds = [...new Set((blockLinks ?? []).map((l) => l.from_item_id))];
  const unknown = blockerIds.filter((id) => !stepById.has(id));
  const { data: outside } = unknown.length
    ? await db.from("items").select("id, status").in("id", unknown)
    : { data: [] as { id: string; status: ItemRow["status"] }[] };
  const statusById = new Map<string, ItemRow["status"]>([
    ...(steps ?? []).map((s) => [s.id, s.status] as const),
    ...(outside ?? []).map((s) => [s.id, s.status] as const),
  ]);
  const isOpen = (id: string) => {
    const status = statusById.get(id);
    return status === "open" || status === "waiting";
  };

  return goals.map((goal) => {
    const ordered = (stepLinks ?? [])
      .filter((l) => l.to_item_id === goal.id)
      .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.created_at.localeCompare(b.created_at))
      .map((l) => stepById.get(l.from_item_id))
      .filter((s): s is ItemRow => Boolean(s));

    const next =
      ordered.find(
        (step) =>
          isOpen(step.id) &&
          !(blockLinks ?? []).some((l) => l.to_item_id === step.id && isOpen(l.from_item_id)),
      ) ?? null;

    return {
      goal: goal as LinkedItem,
      done: ordered.filter((s) => s.status === "done").length,
      total: ordered.length,
      next,
    };
  });
}
