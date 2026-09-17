import type { ItemKind, ItemStatus } from "@/lib/db/types";

/**
 * The map's graph, as plain data that crosses from the server loader to the
 * client canvas. Node ids are "item:<uuid>", "project:<uuid>", "person:<uuid>",
 * and for the mirrored CECO portal "ceco:app", "ceco:area:<key>",
 * "ceco:page:<path>". They are the same strings `map_positions.node_id` stores.
 */

export type MapNodeType = "item" | "project" | "person" | "app" | "area" | "page";

/** The three node types that make up the mirrored CECO portal. */
export const isCecoNode = (type: MapNodeType) => type === "app" || type === "area" || type === "page";

export type MapNode = {
  id: string;
  type: MapNodeType;
  /** The row's own id, for links to its page and for link actions. */
  refId: string;
  label: string;
  /** Items only. */
  kind?: ItemKind;
  status?: ItemStatus;
  overdue?: boolean;
  /** True when the item is a step toward some goal. Finished steps stay on the map: the path is the point. */
  isStep?: boolean;
  /** CECO areas only: the emoji CECO uses for the area. */
  emoji?: string;
  /** Goals only: finished and total steps. */
  progress?: { done: number; total: number };
  /** Saved position, when there is one. */
  x?: number;
  y?: number;
  pinned?: boolean;
};

export type MapEdgeType =
  /** Item belongs to a project. */
  | "project"
  /** Item mentions a person. */
  | "person"
  /** Item is waiting on a person. */
  | "waiting"
  | "related"
  /** One link of a goal's path: step to next step, last step to the goal. */
  | "step"
  | "blocks"
  /** A related link proposed by the similarity search, not yet accepted. */
  | "suggested"
  /** CECO's own structure: page to area, area to app. */
  | "ceco"
  /** An item is about a CECO page. */
  | "about";

export type MapEdge = {
  source: string;
  target: string;
  type: MapEdgeType;
};

export type MapGraph = { nodes: MapNode[]; edges: MapEdge[] };

export const nodeId = {
  item: (id: string) => `item:${id}`,
  project: (id: string) => `project:${id}`,
  person: (id: string) => `person:${id}`,
  cecoApp: () => "ceco:app",
  cecoArea: (key: string) => `ceco:area:${key}`,
  cecoPage: (path: string) => `ceco:page:${path}`,
};
