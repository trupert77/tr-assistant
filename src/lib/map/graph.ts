import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCecoScope, type CecoScope } from "@/lib/ceco";
import type { Database, ItemLinkRow, ItemRow } from "@/lib/db/types";
import { nodeId, type MapEdge, type MapGraph, type MapNode } from "./types";

type Db = SupabaseClient<Database>;

/** Finished items stay on the map this long, so a cluster does not vanish the moment it is done. */
const DONE_DAYS = 14;
const ITEM_CAP = 600;

type MapItem = Pick<ItemRow, "id" | "kind" | "title" | "status" | "due_at" | "project_id" | "completed_at">;

/**
 * Pure: turn rows into the graph. Project and person edges come free from
 * data the app already has, which is what makes clusters form on their own.
 * A goal's steps are drawn as a path (step to next step, last step to the
 * goal) rather than a star, because the order is the point.
 */
export function buildGraph(input: {
  items: MapItem[];
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
  itemPeople: { item_id: string; person_id: string; role: string }[];
  links: Pick<ItemLinkRow, "from_item_id" | "to_item_id" | "kind" | "status" | "position" | "created_at">[];
  positions: { node_id: string; x: number; y: number; pinned: boolean }[];
  /**
   * The mirrored CECO portal. By default only pages that an item on the map
   * is about are drawn (with their areas and the app hub), so the portal
   * shows up where it matters. `showAll` draws every page: the whole app.
   */
  ceco?: { scope: CecoScope; itemPages: { item_id: string; path: string }[]; showAll: boolean };
  now: Date;
}): MapGraph {
  const { items, projects, people, itemPeople, links, positions, ceco, now } = input;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const saved = new Map(positions.map((p) => [p.node_id, p]));
  const nowIso = now.toISOString();
  const edges: MapEdge[] = [];

  // Steps per goal, in order.
  const stepsByGoal = new Map<string, string[]>();
  const stepLinks = links
    .filter((l) => l.kind === "step" && l.status === "confirmed")
    .filter((l) => itemById.has(l.from_item_id) && itemById.has(l.to_item_id))
    .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.created_at.localeCompare(b.created_at));
  for (const link of stepLinks) {
    stepsByGoal.set(link.to_item_id, [...(stepsByGoal.get(link.to_item_id) ?? []), link.from_item_id]);
  }
  for (const [goalId, steps] of stepsByGoal) {
    steps.forEach((stepId, n) => {
      edges.push({
        source: nodeId.item(stepId),
        target: nodeId.item(steps[n + 1] ?? goalId),
        type: "step",
      });
    });
  }

  for (const link of links) {
    if (link.kind === "step" || link.status === "dismissed") continue;
    if (!itemById.has(link.from_item_id) || !itemById.has(link.to_item_id)) continue;
    edges.push({
      source: nodeId.item(link.from_item_id),
      target: nodeId.item(link.to_item_id),
      type: link.status === "suggested" ? "suggested" : link.kind,
    });
  }

  // A step reaches its project through its goal. Drawing both lines ties the
  // path into a knot around the project hub, so the step's own line is dropped
  // when the goal already sits in the same project.
  const goalProjects = new Map<string, Set<string | null>>();
  for (const [goalId, steps] of stepsByGoal) {
    for (const stepId of steps) {
      const set = goalProjects.get(stepId) ?? new Set();
      set.add(itemById.get(goalId)?.project_id ?? null);
      goalProjects.set(stepId, set);
    }
  }

  const usedProjects = new Set<string>();
  for (const item of items) {
    if (!item.project_id) continue;
    usedProjects.add(item.project_id);
    if (goalProjects.get(item.id)?.has(item.project_id)) continue;
    edges.push({ source: nodeId.item(item.id), target: nodeId.project(item.project_id), type: "project" });
  }

  const usedPeople = new Set<string>();
  const seenPersonEdge = new Set<string>();
  // waiting_on first, so when someone is both mentioned and waited on the stronger edge wins.
  const byRole = [...itemPeople].sort((a, b) => Number(b.role === "waiting_on") - Number(a.role === "waiting_on"));
  for (const link of byRole) {
    if (!itemById.has(link.item_id)) continue;
    const key = `${link.item_id}|${link.person_id}`;
    if (seenPersonEdge.has(key)) continue;
    seenPersonEdge.add(key);
    usedPeople.add(link.person_id);
    edges.push({
      source: nodeId.item(link.item_id),
      target: nodeId.person(link.person_id),
      type: link.role === "waiting_on" ? "waiting" : "person",
    });
  }

  const place = (id: string) => {
    const p = saved.get(id);
    return p ? { x: p.x, y: p.y, pinned: p.pinned } : {};
  };

  const cecoNodes: MapNode[] = [];
  if (ceco) {
    const pageByPath = new Map(ceco.scope.pages.map((p) => [p.path, p]));
    const shown = new Set<string>(ceco.showAll ? pageByPath.keys() : []);
    for (const link of ceco.itemPages) {
      if (!itemById.has(link.item_id) || !pageByPath.has(link.path)) continue;
      shown.add(link.path);
      edges.push({ source: nodeId.item(link.item_id), target: nodeId.cecoPage(link.path), type: "about" });
    }

    const areas = new Set<string>();
    for (const path of shown) {
      const page = pageByPath.get(path)!;
      areas.add(page.area);
      cecoNodes.push({
        id: nodeId.cecoPage(path),
        type: "page",
        refId: path,
        label: page.title,
        ...place(nodeId.cecoPage(path)),
      });
      edges.push({ source: nodeId.cecoPage(path), target: nodeId.cecoArea(page.area), type: "ceco" });
    }
    for (const key of areas) {
      const area = ceco.scope.areas.find((a) => a.key === key);
      cecoNodes.push({
        id: nodeId.cecoArea(key),
        type: "area",
        refId: key,
        label: area?.label ?? key,
        emoji: area?.emoji,
        ...place(nodeId.cecoArea(key)),
      });
      edges.push({ source: nodeId.cecoArea(key), target: nodeId.cecoApp(), type: "ceco" });
    }
    if (areas.size) {
      cecoNodes.push({
        id: nodeId.cecoApp(),
        type: "app",
        refId: "ceco",
        // Not the scope's own name ("CECO App"): Travis has a project called that,
        // and two hubs with one label would be impossible to tell apart.
        label: "CECO portal",
        ...place(nodeId.cecoApp()),
      });
    }
  }

  const nodes: MapNode[] = [
    ...items.map((item): MapNode => {
      const steps = stepsByGoal.get(item.id);
      return {
        id: nodeId.item(item.id),
        type: "item",
        refId: item.id,
        label: item.title,
        kind: item.kind,
        status: item.status,
        overdue: item.status !== "done" && item.due_at !== null && item.due_at < nowIso,
        ...(goalProjects.has(item.id) ? { isStep: true } : {}),
        ...(item.kind === "goal"
          ? {
              progress: {
                done: (steps ?? []).filter((id) => itemById.get(id)?.status === "done").length,
                total: steps?.length ?? 0,
              },
            }
          : {}),
        ...place(nodeId.item(item.id)),
      };
    }),
    // A project or person with nothing on the map would only be a stray dot.
    ...projects
      .filter((p) => usedProjects.has(p.id))
      .map((p): MapNode => ({
        id: nodeId.project(p.id),
        type: "project",
        refId: p.id,
        label: p.name,
        ...place(nodeId.project(p.id)),
      })),
    ...people
      .filter((p) => usedPeople.has(p.id))
      .map((p): MapNode => ({
        id: nodeId.person(p.id),
        type: "person",
        refId: p.id,
        label: p.name,
        ...place(nodeId.person(p.id)),
      })),
    ...cecoNodes,
  ];

  return { nodes, edges };
}

/** Everything the map draws: open items, recently finished ones, and any step of an open goal. */
export async function loadMapGraph(
  db: Db,
  options: { cecoAll?: boolean; now?: Date } = {},
): Promise<MapGraph & { hasCeco: boolean }> {
  const now = options.now ?? new Date();
  const doneSince = new Date(now.getTime() - DONE_DAYS * 86_400_000).toISOString();
  const columns = "id, kind, title, status, due_at, project_id, completed_at";

  const [{ data: open }, { data: done }, { data: links }, { data: positions }, ceco, { data: itemPages }] = await Promise.all([
    db
      .from("items")
      .select(columns)
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: false })
      .limit(ITEM_CAP),
    db.from("items").select(columns).eq("status", "done").gte("completed_at", doneSince).limit(200),
    db.from("item_links").select("from_item_id, to_item_id, kind, status, position, created_at"),
    db.from("map_positions").select("node_id, x, y, pinned"),
    loadCecoScope(db),
    db.from("item_ceco_pages").select("item_id, path"),
  ]);

  const items = new Map<string, MapItem>();
  for (const item of [...(open ?? []), ...(done ?? [])]) items.set(item.id, item);

  // Steps finished long ago still belong on their goal's path.
  const goalIds = new Set([...items.values()].filter((i) => i.kind === "goal").map((i) => i.id));
  const missingSteps = (links ?? [])
    .filter((l) => l.kind === "step" && goalIds.has(l.to_item_id) && !items.has(l.from_item_id))
    .map((l) => l.from_item_id);
  if (missingSteps.length) {
    const { data: steps } = await db
      .from("items")
      .select(columns)
      .in("id", missingSteps)
      .neq("status", "archived");
    for (const step of steps ?? []) items.set(step.id, step);
  }

  const ids = [...items.keys()];
  const [{ data: projects }, { data: itemPeople }] = await Promise.all([
    db.from("projects").select("id, name").eq("status", "active"),
    ids.length
      ? db.from("item_people").select("item_id, person_id, role").in("item_id", ids)
      : Promise.resolve({ data: [] as { item_id: string; person_id: string; role: string }[] }),
  ]);
  const personIds = [...new Set((itemPeople ?? []).map((l) => l.person_id))];
  const { data: people } = personIds.length
    ? await db.from("people").select("id, name").in("id", personIds)
    : { data: [] as { id: string; name: string }[] };

  const graph = buildGraph({
    items: [...items.values()],
    projects: projects ?? [],
    people: people ?? [],
    itemPeople: itemPeople ?? [],
    links: links ?? [],
    positions: positions ?? [],
    ceco: ceco
      ? { scope: ceco.scope, itemPages: itemPages ?? [], showAll: Boolean(options.cecoAll) }
      : undefined,
    now,
  });
  return { ...graph, hasCeco: ceco !== null };
}
