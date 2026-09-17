import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph";
import { STEP_SPACING, goalColumns, layoutGraph } from "./layout";
import { nodeId } from "./types";

const now = new Date("2026-09-17T15:00:00Z");
const created_at = "2026-09-16T00:00:00Z";

type Kind = "task" | "followup" | "note" | "goal";
const item = (id: string, kind: Kind, extra: Partial<Parameters<typeof buildGraph>[0]["items"][number]> = {}) => ({
  id,
  kind,
  title: id,
  status: "open" as const,
  due_at: null,
  project_id: null,
  completed_at: null,
  ...extra,
});
const step = (from: string, to: string, position: number) => ({
  from_item_id: from,
  to_item_id: to,
  kind: "step" as const,
  status: "confirmed" as const,
  position,
  created_at,
});

const base = { projects: [], people: [], itemPeople: [], links: [], positions: [], now };

describe("buildGraph", () => {
  it("draws a goal's steps as a path in position order, ending at the goal", () => {
    const graph = buildGraph({
      ...base,
      items: [item("goal", "goal"), item("a", "task"), item("b", "task"), item("c", "task")],
      // Stored out of order on purpose.
      links: [step("c", "goal", 3), step("a", "goal", 1), step("b", "goal", 2)],
    });
    const path = graph.edges.filter((e) => e.type === "step").map((e) => `${e.source}>${e.target}`);
    expect(path).toEqual(["item:a>item:b", "item:b>item:c", "item:c>item:goal"]);
    expect(graph.nodes.find((n) => n.id === "item:goal")?.progress).toEqual({ done: 0, total: 3 });
    expect(graph.nodes.find((n) => n.id === "item:a")?.isStep).toBe(true);
  });

  it("counts finished steps toward progress", () => {
    const graph = buildGraph({
      ...base,
      items: [item("goal", "goal"), item("a", "task", { status: "done" }), item("b", "task")],
      links: [step("a", "goal", 1), step("b", "goal", 2)],
    });
    expect(graph.nodes.find((n) => n.id === "item:goal")?.progress).toEqual({ done: 1, total: 2 });
  });

  it("routes a step to its project through the goal, not directly", () => {
    const graph = buildGraph({
      ...base,
      items: [item("goal", "goal", { project_id: "p" }), item("a", "task", { project_id: "p" }), item("loose", "task", { project_id: "p" })],
      projects: [{ id: "p", name: "Aspen" }],
      links: [step("a", "goal", 1)],
    });
    const toProject = graph.edges.filter((e) => e.type === "project").map((e) => e.source);
    expect(toProject.sort()).toEqual(["item:goal", "item:loose"]);
  });

  it("shows suggestions, hides dismissals, and leaves out hubs nothing points at", () => {
    const graph = buildGraph({
      ...base,
      items: [item("a", "task"), item("b", "note"), item("c", "note")],
      projects: [{ id: "unused", name: "Empty" }],
      links: [
        { from_item_id: "a", to_item_id: "b", kind: "related", status: "suggested", position: null, created_at },
        { from_item_id: "a", to_item_id: "c", kind: "related", status: "dismissed", position: null, created_at },
      ],
    });
    expect(graph.edges).toEqual([{ source: "item:a", target: "item:b", type: "suggested" }]);
    expect(graph.nodes.some((n) => n.type === "project")).toBe(false);
  });

  it("prefers the waiting-on edge when someone is both mentioned and waited on", () => {
    const graph = buildGraph({
      ...base,
      items: [item("a", "followup")],
      people: [{ id: "matt", name: "Matt" }],
      itemPeople: [
        { item_id: "a", person_id: "matt", role: "mentioned" },
        { item_id: "a", person_id: "matt", role: "waiting_on" },
      ],
    });
    expect(graph.edges).toEqual([{ source: "item:a", target: "person:matt", type: "waiting" }]);
  });

  it("marks overdue items, but never finished ones", () => {
    const graph = buildGraph({
      ...base,
      items: [
        item("late", "task", { due_at: "2026-09-10T13:00:00Z" }),
        item("done-late", "task", { due_at: "2026-09-10T13:00:00Z", status: "done" }),
      ],
    });
    expect(graph.nodes.map((n) => n.overdue)).toEqual([true, false]);
  });
});

describe("layoutGraph", () => {
  const graph = buildGraph({
    ...base,
    items: [item("goal", "goal"), item("a", "task"), item("b", "task"), item("x", "note"), item("y", "note")],
    links: [
      step("a", "goal", 1),
      step("b", "goal", 2),
      { from_item_id: "x", to_item_id: "y", kind: "related", status: "confirmed", position: null, created_at },
    ],
  });

  it("reads each goal's steps back in order", () => {
    expect([...goalColumns(graph)]).toEqual([["item:goal", ["item:a", "item:b"]]]);
  });

  it("stacks a goal's steps in a column above it, first step on top", () => {
    const at = layoutGraph(graph);
    const goal = at.get("item:goal")!;
    expect(at.get("item:b")).toEqual({ x: goal.x, y: goal.y - STEP_SPACING });
    expect(at.get("item:a")).toEqual({ x: goal.x, y: goal.y - 2 * STEP_SPACING });
  });

  it("is deterministic and keeps everything on a sane canvas", () => {
    const first = layoutGraph(graph);
    expect([...layoutGraph(graph)]).toEqual([...first]);
    for (const p of first.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThan(2000);
      expect(Math.abs(p.y)).toBeLessThan(2000);
    }
  });

  it("leaves placed nodes exactly where they were when something new arrives", () => {
    const first = layoutGraph(graph);
    const placed = graph.nodes.map((n) => ({ ...n, ...first.get(n.id)! }));
    const grown = {
      nodes: [...placed, { id: nodeId.item("new"), type: "item" as const, refId: "new", label: "new", kind: "task" as const }],
      edges: [...graph.edges, { source: "item:new", target: "item:x", type: "related" as const }],
    };
    const second = layoutGraph(grown);
    for (const n of graph.nodes) expect(second.get(n.id)).toEqual(first.get(n.id));
    expect(second.get("item:new")).toBeDefined();
  });

  it("never moves a pinned node, even on Tidy", () => {
    const pinnedGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "item:x" ? { ...n, x: 500, y: -300, pinned: true } : n)),
    };
    expect(layoutGraph(pinnedGraph, { fresh: true }).get("item:x")).toEqual({ x: 500, y: -300 });
  });

  it("shifts a column to make room when a goal gains a step", () => {
    const first = layoutGraph(graph);
    const placed = graph.nodes.map((n) => ({ ...n, ...first.get(n.id)! }));
    const grown = buildGraph({
      ...base,
      items: [item("goal", "goal"), item("a", "task"), item("b", "task"), item("c", "task"), item("x", "note"), item("y", "note")],
      links: [step("a", "goal", 1), step("b", "goal", 2), step("c", "goal", 3)],
      positions: placed.map((n) => ({ node_id: n.id, x: n.x, y: n.y, pinned: false })),
    });
    const second = layoutGraph(grown);
    const goal = second.get("item:goal")!;
    expect(goal).toEqual(first.get("item:goal"));
    expect(second.get("item:c")).toEqual({ x: goal.x, y: goal.y - STEP_SPACING });
    expect(second.get("item:a")).toEqual({ x: goal.x, y: goal.y - 3 * STEP_SPACING });
  });
});
