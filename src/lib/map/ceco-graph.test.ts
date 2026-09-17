import { describe, expect, it } from "vitest";
import type { CecoScope } from "@/lib/ceco";
import { buildGraph } from "./graph";
import { layoutGraph } from "./layout";

const page = (path: string, title: string, area: string) => ({
  path,
  title,
  description: null,
  area,
  kind: "page",
  permission: null,
  keywords: [],
});

const scope: CecoScope = {
  schema: 1,
  generatedAt: "2026-09-17T00:00:00Z",
  app: { name: "CECO App", version: "v1", commit: "", buildDate: "", url: "https://ceco.example" },
  areas: [
    { key: "trucking", label: "Trucking", emoji: "🚚", blurb: "" },
    { key: "sales", label: "Sales", emoji: "📈", blurb: "" },
  ],
  pages: [
    page("/trucking/jobboard", "Trucking Request Board", "trucking"),
    page("/trucking/request", "Trucking Request form", "trucking"),
    page("/leads", "Leads", "sales"),
  ],
  updates: [],
};

const item = (id: string, kind: "task" | "note") => ({
  id,
  kind,
  title: id,
  status: "open" as const,
  due_at: null,
  project_id: null,
  completed_at: null,
});

const base = {
  items: [item("bug", "task"), item("other", "note")],
  projects: [],
  people: [],
  itemPeople: [],
  links: [],
  positions: [],
  now: new Date("2026-09-17T15:00:00Z"),
};

const itemPages = [
  { item_id: "bug", path: "/trucking/jobboard" },
  // Neither of these may draw anything: a path CECO no longer has, and an item that is off the map.
  { item_id: "bug", path: "/not/a/real/page" },
  { item_id: "gone", path: "/leads" },
];

describe("buildGraph with the CECO portal", () => {
  it("draws only the pages an item is about, with their area and the app hub", () => {
    const graph = buildGraph({ ...base, ceco: { scope, itemPages, showAll: false } });
    const ceco = graph.nodes.filter((n) => n.id.startsWith("ceco:")).map((n) => n.id).sort();
    expect(ceco).toEqual(["ceco:app", "ceco:area:trucking", "ceco:page:/trucking/jobboard"]);
    expect(graph.edges).toEqual([
      { source: "item:bug", target: "ceco:page:/trucking/jobboard", type: "about" },
      { source: "ceco:page:/trucking/jobboard", target: "ceco:area:trucking", type: "ceco" },
      { source: "ceco:area:trucking", target: "ceco:app", type: "ceco" },
    ]);
  });

  it("draws the whole app on request", () => {
    const graph = buildGraph({ ...base, ceco: { scope, itemPages, showAll: true } });
    expect(graph.nodes.filter((n) => n.type === "page")).toHaveLength(3);
    expect(graph.nodes.filter((n) => n.type === "area")).toHaveLength(2);
    expect(graph.nodes.find((n) => n.id === "ceco:area:trucking")?.emoji).toBe("🚚");
  });

  it("adds nothing when no item touches the portal", () => {
    const graph = buildGraph({ ...base, ceco: { scope, itemPages: [], showAll: false } });
    expect(graph.nodes.some((n) => n.id.startsWith("ceco:"))).toBe(false);
  });

  it("lays the whole app out without anything flying off", () => {
    const at = layoutGraph(buildGraph({ ...base, ceco: { scope, itemPages, showAll: true } }));
    expect(at.size).toBe(2 + 3 + 2 + 1);
    for (const p of at.values()) expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(4000);
  });
});
