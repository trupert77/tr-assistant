"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ExpandIcon, LinkIcon, ShrinkIcon, SparklesIcon, TargetIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { kindStyles } from "@/components/ui";
import { layoutGraph, nodeRadius, type Point } from "@/lib/map/layout";
import { isCecoNode, type MapEdge, type MapEdgeType, type MapGraph, type MapNode } from "@/lib/map/types";
import { setItemCecoPageAction } from "../ceco/actions";
import { linkItemsAction, saveMapPositionsAction, suggestConnectionsAction } from "./actions";
import { NodePanel, type LinkKindChoice } from "./node-panel";

type View = { x: number; y: number; k: number };

const FILTERS = [
  { key: "task", label: "Tasks" },
  { key: "followup", label: "Follow-ups" },
  { key: "note", label: "Notes" },
  { key: "goal", label: "Goals" },
  { key: "project", label: "Projects" },
  { key: "person", label: "People" },
  { key: "ceco", label: "CECO" },
  { key: "suggested", label: "Suggestions" },
  { key: "done", label: "Done" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const DEFAULT_FILTERS: Record<FilterKey, boolean> = {
  task: true,
  followup: true,
  note: true,
  goal: true,
  project: true,
  person: true,
  ceco: true,
  suggested: true,
  done: false,
};

const KIND_COLOR = {
  task: "var(--task)",
  followup: "var(--followup)",
  note: "var(--note)",
  goal: "var(--goal)",
} as const;

const EDGE_STYLE: Record<MapEdgeType, { stroke: string; width: number; dash?: string; opacity: number }> = {
  project: { stroke: "var(--line-strong)", width: 1, opacity: 0.9 },
  person: { stroke: "var(--line-strong)", width: 1, dash: "2 4", opacity: 0.9 },
  waiting: { stroke: "var(--followup)", width: 1.25, opacity: 0.55 },
  related: { stroke: "var(--muted)", width: 1.5, opacity: 0.8 },
  step: { stroke: "var(--goal)", width: 2, opacity: 0.9 },
  blocks: { stroke: "var(--danger)", width: 1.5, dash: "6 4", opacity: 0.8 },
  suggested: { stroke: "var(--accent)", width: 1.5, dash: "1 5", opacity: 0.9 },
  ceco: { stroke: "var(--line-strong)", width: 1, opacity: 0.9 },
  about: { stroke: "var(--accent-2)", width: 1.25, opacity: 0.6 },
};

/**
 * Every node is labelled while the map is small enough to read that way.
 * Past this many, zoomed-out views keep labels only on hubs, goals, and
 * whatever is selected, the way Obsidian's graph does.
 */
const LABEL_ALL_UNDER = 45;
const LABEL_ZOOM = 0.75;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const TAP_SLOP = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const short = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The toolbar's column on the right edge; framing keeps nodes out from under it. */
const TOOLBAR_WIDTH = 56;

/** The pan and zoom that frames `points` inside `box` with some breathing room. */
function frame(points: Point[], full: { w: number; h: number }): View | null {
  if (!points.length) return null;
  const box = { w: Math.max(full.w - TOOLBAR_WIDTH, 120), h: full.h };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = clamp(Math.min(box.w / (maxX - minX + 110), box.h / (maxY - minY + 130)), MIN_ZOOM, 1.4);
  return { k, x: box.w / 2 - ((minX + maxX) / 2) * k, y: box.h / 2 - ((minY + maxY) / 2) * k };
}

const toolButton =
  "flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/90 text-muted shadow-card backdrop-blur transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-40";

type LinkMode = { fromRef: string; fromLabel: string; kind: LinkKindChoice };

const LINK_PROMPT: Record<LinkKindChoice, string> = {
  related: "Tap the item to connect it to",
  step: "Tap the item that is a step toward",
  blocks: "Tap the item that has to happen before",
};

/**
 * The map: every open item, with projects and people as hubs. The layout is
 * computed once and stands still. Drag a node and it is pinned where you
 * leave it; everything else is placed around the pins. Tap a node for its
 * connections and the link tools.
 */
export function MapCanvas({
  graph,
  focusId,
  canSuggest,
}: {
  graph: MapGraph;
  /** A node id to select and centre on arrival ("See on the map"). */
  focusId?: string;
  /** Whether meaning-based suggestions are available (embeddings configured). */
  canSuggest: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const savedRef = useRef(new Set<string>());
  const fittedRef = useRef(false);

  const [positions, setPositions] = useState<Map<string, Point>>(() => layoutGraph(graph));
  const [pinned, setPinned] = useState<Set<string>>(
    () => new Set(graph.nodes.filter((n) => n.pinned).map((n) => n.id)),
  );
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [linkMode, setLinkMode] = useState<LinkMode | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, startTransition] = useTransition();

  // A refreshed graph (new capture, new link) arrives as a new prop. Keep every
  // position already on screen and lay out only what is new.
  const [laidOut, setLaidOut] = useState(graph);
  if (laidOut !== graph) {
    setLaidOut(graph);
    setPositions((current) =>
      layoutGraph({
        edges: graph.edges,
        nodes: graph.nodes.map((n) => {
          const here = current.get(n.id);
          return here ? { ...n, x: here.x, y: here.y } : n;
        }),
      }),
    );
  }

  // Remember where the layout put anything the server has no position for yet.
  useEffect(() => {
    const fresh = graph.nodes.filter(
      (n) => n.x === undefined && !savedRef.current.has(n.id) && positions.has(n.id),
    );
    if (!fresh.length) return;
    for (const n of fresh) savedRef.current.add(n.id);
    void saveMapPositionsAction(
      fresh.map((n) => ({ id: n.id, ...positions.get(n.id)!, pinned: false })),
    );
  }, [graph, positions]);

  // ---- what is visible -----------------------------------------------------

  const visibleNodes = useMemo(
    () =>
      graph.nodes.filter((n) => {
        if (isCecoNode(n.type)) return filters.ceco;
        if (n.type !== "item") return filters[n.type as "project" | "person"];
        // A finished step stays: a goal's path with holes in it reads as broken.
        if (n.status === "done" && !filters.done && !(n.isStep && filters.goal)) return false;
        return filters[n.kind ?? "task"];
      }),
    [graph.nodes, filters],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) =>
          visibleIds.has(e.source) &&
          visibleIds.has(e.target) &&
          (e.type !== "suggested" || filters.suggested),
      ),
    [graph.edges, visibleIds, filters.suggested],
  );
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    for (const e of visibleEdges) {
      if (e.source === selected) set.add(e.target);
      if (e.target === selected) set.add(e.source);
    }
    return set;
  }, [selected, visibleEdges]);

  // ---- view ----------------------------------------------------------------

  const fit = useCallback(
    (box: { w: number; h: number }, only?: string) => {
      const target = only ? positions.get(only) : null;
      if (target) {
        // Above centre, so the panel that slides up does not cover it.
        setView({ k: 1, x: box.w / 2 - target.x, y: box.h * 0.36 - target.y });
        return;
      }
      const framed = frame(
        visibleNodes.map((n) => positions.get(n.id)).filter((p): p is Point => Boolean(p)),
        box,
      );
      if (framed) setView(framed);
    },
    [positions, visibleNodes],
  );

  // Track the box size; fit once when it is first known.
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { w: entry.contentRect.width, h: entry.contentRect.height };
      setSize(next);
      if (!fittedRef.current && next.w > 0 && next.h > 0) {
        fittedRef.current = true;
        if (focusId) setSelected(focusId);
        fitRef.current(next, focusId);
      }
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [focusId]);

  // Wheel zoom has to be a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const [px, py] = [e.clientX - rect.left, e.clientY - rect.top];
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [size]);

  // ---- pointer gestures: pan, pinch, drag a node, tap ------------------------

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { type: "pan"; start: Point; view: View; moved: boolean }
    | { type: "node"; id: string; start: Point; origin: Point; moved: boolean }
    | { type: "pinch"; distance: number; mid: Point; view: View }
    | null
  >(null);

  function localPoint(e: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const point = localPoint(e);
    pointers.current.set(e.pointerId, point);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view,
      };
      return;
    }

    const id = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
    const origin = id ? positions.get(id) : undefined;
    gesture.current =
      id && origin
        ? { type: "node", id, start: point, origin, moved: false }
        : { type: "pan", start: point, view, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const point = localPoint(e);
    pointers.current.set(e.pointerId, point);
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const k = clamp((g.view.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance, MIN_ZOOM, MAX_ZOOM);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Keep the graph point that was under the fingers under the fingers.
      setView({
        k,
        x: mid.x - ((g.mid.x - g.view.x) / g.view.k) * k,
        y: mid.y - ((g.mid.y - g.view.y) / g.view.k) * k,
      });
      return;
    }

    const [dx, dy] = [point.x - g.start.x, point.y - g.start.y];
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    g.moved = true;

    if (g.type === "pan") {
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    } else {
      const next = { x: g.origin.x + dx / view.k, y: g.origin.y + dy / view.k };
      setPositions((current) => new Map(current).set(g.id, next));
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.type === "pinch") return;

    if (g.type === "pan") {
      if (!g.moved && !linkMode) setSelected(null);
      return;
    }
    if (g.moved) {
      // Dropped by hand: it stays here from now on.
      const at = positions.get(g.id);
      if (!at) return;
      const rounded = { x: Math.round(at.x), y: Math.round(at.y) };
      setPinned((current) => new Set(current).add(g.id));
      savedRef.current.add(g.id);
      void saveMapPositionsAction([{ id: g.id, ...rounded, pinned: true }]);
      return;
    }
    onTapNode(g.id);
  }

  function onTapNode(id: string) {
    const node = nodeById.get(id);
    if (!node) return;
    if (!linkMode) {
      setSelected(id === selected ? null : id);
      return;
    }
    const mode = linkMode;
    if (node.type === "page" && mode.kind === "related") {
      // "Link to" a CECO page means: this item is about that page.
      setLinkMode(null);
      startTransition(async () => {
        const result = await setItemCecoPageAction({ itemId: mode.fromRef, path: node.refId, linked: true });
        toast(result.ok ? `Linked to ${node.label}` : result.error ?? "Could not link those.");
      });
      return;
    }
    if (node.type !== "item") {
      toast("Only items and CECO pages can be linked. Projects and people connect on their own.");
      return;
    }
    setLinkMode(null);
    startTransition(async () => {
      // step: the tapped item is a step toward the goal. blocks: the tapped item comes first.
      const result = await linkItemsAction(
        mode.kind === "related"
          ? { from: mode.fromRef, to: node.refId, kind: "related" }
          : { from: node.refId, to: mode.fromRef, kind: mode.kind },
      );
      toast(result.ok ? "Linked" : result.error ?? "Could not link those.");
    });
  }

  // ---- toolbar actions -------------------------------------------------------

  function tidy() {
    const next = layoutGraph(
      {
        edges: graph.edges,
        nodes: graph.nodes.map((n) => {
          const here = positions.get(n.id);
          return pinned.has(n.id) && here ? { ...n, x: here.x, y: here.y, pinned: true } : { ...n, x: undefined, y: undefined, pinned: false };
        }),
      },
      { fresh: true },
    );
    setPositions(next);
    void saveMapPositionsAction(
      [...next].map(([id, p]) => ({ id, ...p, pinned: pinned.has(id) })),
    );
    // Frame the new layout, not the one this render closed over.
    const framed = size && frame([...next.values()], size);
    if (framed) setView(framed);
  }

  function unpin(id: string) {
    const at = positions.get(id);
    if (!at) return;
    setPinned((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    void saveMapPositionsAction([{ id, x: Math.round(at.x), y: Math.round(at.y), pinned: false }]);
  }

  function suggest() {
    startTransition(async () => {
      const result = await suggestConnectionsAction();
      if (!result.ok) toast(result.error ?? "Could not look for connections.");
      else toast(result.added ? `${result.added} possible connection${result.added === 1 ? "" : "s"} found` : "Nothing new to suggest");
    });
  }

  const selectedNode = selected ? nodeById.get(selected) ?? null : null;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-40 flex flex-col bg-canvas"
          : "relative flex h-[64dvh] min-h-[440px] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface/40 shadow-card"
      }
      style={fullscreen ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
    >
      {/* Filters */}
      <div className="z-10 flex gap-1.5 overflow-x-auto px-3 pb-1 pt-3 [scrollbar-width:none]">
        {FILTERS.filter(
          (f) => (f.key !== "suggested" || canSuggest) && (f.key !== "ceco" || graph.nodes.some((n) => isCecoNode(n.type))),
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filters[f.key]}
            onClick={() => setFilters((current) => ({ ...current, [f.key]: !current[f.key] }))}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors ${
              filters[f.key]
                ? "border-line-strong bg-surface text-foreground"
                : "border-line bg-transparent text-faint"
            }`}
          >
            {f.key in kindStyles && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${kindStyles[f.key as keyof typeof kindStyles].dot} ${
                  filters[f.key] ? "" : "opacity-40"
                }`}
              />
            )}
            {f.label}
          </button>
        ))}
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1">
        {/* Toolbar */}
        <div className="absolute right-3 top-2 z-10 flex flex-col gap-2">
          <button type="button" className={toolButton} onClick={() => size && fit(size)} aria-label="Fit everything" title="Fit everything">
            <TargetIcon size={18} />
          </button>
          <button type="button" className={toolButton} onClick={tidy} aria-label="Tidy the layout" title="Tidy: re-arrange everything that is not pinned">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tidy</span>
          </button>
          {canSuggest && (
            <button type="button" className={toolButton} onClick={suggest} disabled={busy} aria-label="Suggest connections" title="Suggest connections">
              <SparklesIcon size={18} className="text-accent" />
            </button>
          )}
          <button
            type="button"
            className={toolButton}
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Leave full screen" : "Full screen"}
            title={fullscreen ? "Leave full screen" : "Full screen"}
          >
            {fullscreen ? <ShrinkIcon size={18} /> : <ExpandIcon size={18} />}
          </button>
        </div>

        {linkMode && (
          <div className="absolute inset-x-3 top-2 z-10 mr-14 flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-4 py-2 text-xs font-semibold text-accent shadow-card">
            <LinkIcon size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {LINK_PROMPT[linkMode.kind]} &ldquo;{short(linkMode.fromLabel, 24)}&rdquo;
            </span>
            <button type="button" onClick={() => setLinkMode(null)} className="shrink-0 underline-offset-2 hover:underline">
              Cancel
            </button>
          </div>
        )}

        <svg
          ref={svgRef}
          role="img"
          aria-label={`Map of ${visibleNodes.length} items, projects and people`}
          className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <marker id="map-arrow-step" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" style={{ fill: "var(--goal)" }} />
            </marker>
            <marker id="map-arrow-blocks" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" style={{ fill: "var(--danger)" }} />
            </marker>
          </defs>

          {size && (
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {visibleEdges.map((edge, i) => (
                <EdgeLine
                  key={`${edge.source}>${edge.target}:${edge.type}:${i}`}
                  edge={edge}
                  from={positions.get(edge.source)}
                  to={positions.get(edge.target)}
                  targetRadius={nodeRadius(nodeById.get(edge.target) ?? { type: "item" })}
                  dim={Boolean(neighbours && !(neighbours.has(edge.source) && neighbours.has(edge.target)))}
                  lit={Boolean(selected && (edge.source === selected || edge.target === selected))}
                />
              ))}
              {visibleNodes.map((node) => {
                const at = positions.get(node.id);
                if (!at) return null;
                const near = neighbours?.has(node.id) ?? false;
                return (
                  <NodeMark
                    key={node.id}
                    node={node}
                    at={at}
                    selected={node.id === selected}
                    pinned={pinned.has(node.id)}
                    dim={Boolean(neighbours && !near)}
                    zoom={view.k}
                    label={
                      view.k >= LABEL_ZOOM ||
                      visibleNodes.length <= LABEL_ALL_UNDER ||
                      (node.type !== "item" && node.type !== "page") ||
                      node.kind === "goal" ||
                      near
                    }
                  />
                );
              })}
            </g>
          )}
        </svg>

        {selectedNode && !linkMode && (
          <NodePanel
            key={selectedNode.id}
            node={selectedNode}
            pinned={pinned.has(selectedNode.id)}
            busy={busy}
            onClose={() => setSelected(null)}
            onUnpin={() => unpin(selectedNode.id)}
            onLink={(kind) => setLinkMode({ fromRef: selectedNode.refId, fromLabel: selectedNode.label, kind })}
            onJump={(itemId) => {
              const id = `item:${itemId}`;
              if (!positions.has(id)) return;
              setSelected(id);
              if (size) fit(size, id);
            }}
          />
        )}
      </div>
    </div>
  );
}

function EdgeLine({
  edge,
  from,
  to,
  targetRadius,
  dim,
  lit,
}: {
  edge: MapEdge;
  from?: Point;
  to?: Point;
  targetRadius: number;
  dim: boolean;
  lit: boolean;
}) {
  if (!from || !to) return null;
  const style = EDGE_STYLE[edge.type];
  const arrow = edge.type === "step" || edge.type === "blocks";

  // Stop an arrow at the rim of its target so the head is not hidden under the node.
  let end = to;
  if (arrow) {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const back = targetRadius + 5;
    end = { x: to.x - ((to.x - from.x) / length) * back, y: to.y - ((to.y - from.y) / length) * back };
  }

  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={end.x}
      y2={end.y}
      strokeLinecap="round"
      strokeDasharray={style.dash}
      markerEnd={arrow ? `url(#map-arrow-${edge.type})` : undefined}
      style={{
        stroke: style.stroke,
        strokeWidth: lit ? style.width + 0.75 : style.width,
        opacity: dim ? 0.08 : style.opacity,
      }}
    />
  );
}

function NodeMark({
  node,
  at,
  selected,
  pinned,
  dim,
  label,
  zoom,
}: {
  node: MapNode;
  at: Point;
  selected: boolean;
  pinned: boolean;
  dim: boolean;
  label: boolean;
  zoom: number;
}) {
  const r = nodeRadius(node);
  // Zoomed out, text would shrink past reading; hold it near its on-screen size instead.
  const textScale = 1 / clamp(zoom, 0.6, 1);
  const done = node.status === "done";
  const color = node.type === "item" ? KIND_COLOR[node.kind ?? "task"] : "var(--muted)";
  const progress = node.progress && node.progress.total > 0 ? node.progress.done / node.progress.total : null;
  const ring = 2 * Math.PI * (r + 4);
  const hub = node.type === "project" || node.type === "area" || node.type === "app" || node.kind === "goal";
  // A goal and its steps stack in a column, so their labels go beside them like a checklist.
  const beside = Boolean(node.isStep || progress !== null);

  return (
    <g
      data-node={node.id}
      transform={`translate(${at.x} ${at.y})`}
      className="cursor-pointer"
      style={{ opacity: dim ? 0.18 : done ? 0.45 : 1 }}
    >
      {/* A generous invisible target so small nodes are easy to hit with a thumb. */}
      <circle r={Math.max(r + 10, 20)} fill="transparent" />

      {selected && <circle r={r + 8} style={{ fill: "var(--accent-glow)" }} />}

      {node.type === "app" ? (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={8}
          style={{ fill: "var(--accent-soft)", stroke: "var(--accent)", strokeWidth: selected ? 3 : 2 }}
        />
      ) : node.type === "page" ? (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={3}
          style={{ fill: "var(--surface)", stroke: selected ? "var(--accent)" : "var(--accent-2)", strokeWidth: 1.5 }}
        />
      ) : node.type === "project" || node.type === "area" ? (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={6}
          style={{ fill: "var(--surface-2)", stroke: selected ? "var(--accent)" : "var(--line-strong)", strokeWidth: 1.5 }}
        />
      ) : node.type === "person" ? (
        <circle r={r} style={{ fill: "var(--surface)", stroke: selected ? "var(--accent)" : "var(--muted)", strokeWidth: 1.5 }} />
      ) : (
        <>
          <circle
            r={r}
            style={{
              fill: color,
              stroke: node.overdue ? "var(--danger)" : selected ? "var(--accent)" : "var(--canvas)",
              strokeWidth: node.overdue || selected ? 2.5 : 1.5,
            }}
          />
          {progress !== null && (
            <>
              <circle r={r + 4} fill="none" style={{ stroke: "var(--line-strong)", strokeWidth: 2.5 }} />
              <circle
                r={r + 4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${ring * progress} ${ring}`}
                transform="rotate(-90)"
                style={{ stroke: "var(--goal)", strokeWidth: 2.5 }}
              />
            </>
          )}
        </>
      )}

      {node.type === "area" && node.emoji && (
        <text textAnchor="middle" dy="5" fontSize="14">
          {node.emoji}
        </text>
      )}
      {node.type === "app" && (
        <text textAnchor="middle" dy="5" fontSize="13" fontWeight="800" style={{ fill: "var(--accent)" }}>
          C
        </text>
      )}

      {node.type === "person" && (
        <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="700" style={{ fill: "var(--muted)" }}>
          {node.label.slice(0, 1).toUpperCase()}
        </text>
      )}

      {pinned && <circle cx={r - 1} cy={-r + 1} r={3} style={{ fill: "var(--accent)", stroke: "var(--canvas)", strokeWidth: 1 }} />}

      {label && (
        <text
          x={beside ? r + (progress !== null ? 12 : 8) : 0}
          y={beside ? 4 * textScale : r + 3 + 11 * textScale}
          textAnchor={beside ? "start" : "middle"}
          fontSize={(hub ? 12 : 11) * textScale}
          fontWeight={hub || selected ? 700 : 500}
          paintOrder="stroke"
          style={{
            fill: "var(--foreground)",
            stroke: "var(--canvas)",
            strokeWidth: 3.5 * textScale,
            strokeLinejoin: "round",
            textDecoration: done ? "line-through" : undefined,
          }}
        >
          {short(node.label, selected ? 60 : beside ? 34 : 24)}
        </text>
      )}
    </g>
  );
}
