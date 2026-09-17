import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { MapEdgeType, MapGraph, MapNode } from "./types";

export type Point = { x: number; y: number };

/**
 * How far apart each kind of edge wants its ends, and how hard it pulls.
 * The distances are sized for the labels, not the dots: a title is about
 * 150 units wide, so anything tighter than this stacks text on text.
 */
const LINK: Record<MapEdgeType, { distance: number; strength: number }> = {
  // Steps are placed by rule (see `goalColumns`), so this only matters for a pinned step.
  step: { distance: 60, strength: 0.2 },
  blocks: { distance: 130, strength: 0.4 },
  related: { distance: 140, strength: 0.45 },
  suggested: { distance: 190, strength: 0.06 },
  project: { distance: 160, strength: 0.3 },
  waiting: { distance: 150, strength: 0.3 },
  person: { distance: 180, strength: 0.12 },
  ceco: { distance: 120, strength: 0.6 },
  about: { distance: 140, strength: 0.35 },
};

/** Room each node claims around itself, mostly for its label. */
const LABEL_CLEARANCE = 44;

/** Vertical gap between the steps of a goal. */
export const STEP_SPACING = 46;

export function nodeRadius(node: Pick<MapNode, "type" | "kind">): number {
  if (node.type === "app") return 20;
  if (node.type === "project" || node.type === "area") return 15;
  if (node.type === "person") return 10;
  if (node.type === "page") return 8;
  return node.kind === "goal" ? 15 : 9;
}

/**
 * Each goal's steps, first to last. Read back from the step edges, which run
 * step to next step and finally into the goal. A step shared by two goals
 * stacks above whichever comes first.
 */
export function goalColumns(graph: MapGraph): Map<string, string[]> {
  const stepEdges = graph.edges.filter((e) => e.type === "step");
  const into = new Map<string, string>();
  for (const e of stepEdges) if (!into.has(e.target)) into.set(e.target, e.source);
  const sources = new Set(stepEdges.map((e) => e.source));

  const columns = new Map<string, string[]>();
  const taken = new Set<string>();
  for (const e of stepEdges) {
    const goal = e.target;
    if (sources.has(goal) || columns.has(goal)) continue; // only the end of a path is the goal
    const steps: string[] = [];
    for (let at = into.get(goal); at && !taken.has(at); at = into.get(at)) {
      steps.unshift(at);
      taken.add(at);
    }
    columns.set(goal, steps);
  }
  return columns;
}

type SimNode = SimulationNodeDatum & {
  id: string;
  radius: number;
  /** How much room the node claims when others are pushed off it. */
  clearance: number;
};
type SimLink = SimulationLinkDatum<SimNode> & { distance: number; strength: number };

/**
 * Place the graph. The layout runs to completion in one go and returns
 * still positions, so the map is calm: nothing drifts while you read it.
 *
 * Two kinds of placement happen together:
 * - Relationships are a force layout. Projects and people pull their items
 *   into clusters; links pull related things close.
 * - A goal's steps are a checklist. They stack in a column above the goal,
 *   first step on top, so the order reads at a glance. The column is a rule,
 *   not a force: it is re-imposed after every tick, and everything else
 *   arranges itself around it.
 *
 * Nodes that already have a position keep it exactly, and only new nodes are
 * placed, starting beside whatever they connect to. That is what keeps the
 * map recognisable from one visit to the next. The exception is a column that
 * gained a step: its unpinned steps shift to make room. `fresh` throws the
 * unpinned positions away and arranges everything again (the Tidy button).
 * Pinned nodes never move either way.
 *
 * Deterministic: d3-force seeds its own random source, so the same graph
 * lays out the same way on the server and in the browser.
 */
export function layoutGraph(graph: MapGraph, options: { fresh?: boolean } = {}): Map<string, Point> {
  const { nodes, edges } = graph;
  const result = new Map<string, Point>();
  if (!nodes.length) return result;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasPlace = (n: MapNode) => n.x !== undefined && n.y !== undefined;
  const isNew = (n: MapNode) => !hasPlace(n) || Boolean(options.fresh && !n.pinned);

  // Steps the column rule owns: every unpinned step of a column that has anything new in it.
  const columns = goalColumns(graph);
  const ruled = new Set<string>();
  for (const [goal, steps] of columns) {
    const members = [goal, ...steps].map((id) => byId.get(id)).filter((n): n is MapNode => Boolean(n));
    if (!members.some(isNew)) continue;
    for (const id of steps) if (!byId.get(id)?.pinned) ruled.add(id);
  }

  const keeps = (n: MapNode) => !isNew(n) && !ruled.has(n.id);
  const kept = nodes.filter(keeps);
  if (kept.length === nodes.length) {
    for (const n of nodes) result.set(n.id, { x: n.x!, y: n.y! });
    return result;
  }

  const keptById = new Map(kept.map((n) => [n.id, n]));
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    neighbours.set(e.source, [...(neighbours.get(e.source) ?? []), e.target]);
    neighbours.set(e.target, [...(neighbours.get(e.target) ?? []), e.source]);
  }

  // Members of a column sit closer together than the collision force would
  // allow. Left at full size they would shove their own goal away on every
  // tick and then follow it, forever. Their labels run beside them, so they
  // need little room above and below anyway.
  const inColumn = new Set<string>();
  for (const [goal, steps] of columns) {
    if (steps.some((id) => ruled.has(id))) for (const id of [goal, ...steps]) inColumn.add(id);
  }

  const sim: SimNode[] = nodes.map((n, index) => {
    const radius = nodeRadius(n);
    const clearance = inColumn.has(n.id) ? STEP_SPACING / 2 - 1 : radius + LABEL_CLEARANCE;
    if (keeps(n)) return { id: n.id, radius, clearance, x: n.x, y: n.y, fx: n.x, fy: n.y };

    // Start next to placed neighbours, fanned out by index so new nodes do not stack.
    const placed = (neighbours.get(n.id) ?? []).map((id) => keptById.get(id)).filter(Boolean) as MapNode[];
    if (placed.length) {
      const angle = index * 2.399963; // the golden angle
      return {
        id: n.id,
        radius,
        clearance,
        x: placed.reduce((sum, p) => sum + p.x!, 0) / placed.length + Math.cos(angle) * 60,
        y: placed.reduce((sum, p) => sum + p.y!, 0) / placed.length + Math.sin(angle) * 60,
      };
    }
    return { id: n.id, radius, clearance };
  });
  const simById = new Map(sim.map((n) => [n.id, n]));

  const simLinks: SimLink[] = edges
    .filter((e) => simById.has(e.source) && simById.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, ...LINK[e.type] }));

  const simulation = forceSimulation(sim)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance((l) => l.distance)
        .strength((l) => l.strength),
    )
    .force("charge", forceManyBody<SimNode>().strength(-520).distanceMax(900))
    .force("collide", forceCollide<SimNode>((d) => d.clearance).strength(0.9))
    // Gentle, so unconnected items drift to the rim instead of flying off.
    .force("x", forceX<SimNode>(0).strength(0.03))
    // A little stronger vertically: labels run sideways, so a wide map reads better than a tall one.
    .force("y", forceY<SimNode>(0).strength(0.05))
    .stop();

  const stackColumns = () => {
    for (const [goalId, steps] of columns) {
      const goal = simById.get(goalId);
      if (!goal) continue;
      steps.forEach((id, n) => {
        const step = simById.get(id);
        if (!step || !ruled.has(id)) return;
        step.x = goal.x ?? 0;
        step.y = (goal.y ?? 0) - (steps.length - n) * STEP_SPACING;
        step.vx = 0;
        step.vy = 0;
      });
    }
  };

  const ticks = kept.length ? 160 : 320;
  for (let i = 0; i < ticks; i += 1) {
    simulation.tick();
    stackColumns();
  }

  for (const n of sim) result.set(n.id, { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) });
  return result;
}
