import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ExampleCaptures } from "@/components/example-captures";
import { MapIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { isSemanticSearchEnabled } from "@/lib/ai/embeddings";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadMapGraph } from "@/lib/map/graph";
import { MapCanvas } from "./map-canvas";

/**
 * Everything open, drawn as a graph. Projects and people are hubs, so
 * clusters form from data that already exists; links and goal paths are the
 * connections Travis (or the similarity search) adds on top.
 */
export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const { focus, ceco } = await searchParams;
  const focusId = (Array.isArray(focus) ? focus[0] : focus) || undefined;
  // A link straight to a CECO page has to draw it even if no item is about it yet.
  const cecoAll = ceco === "all" || Boolean(focusId?.startsWith("ceco:"));

  const db = await createSupabaseServerClient();
  const { hasCeco, ...graph } = await loadMapGraph(db, { cecoAll });
  const items = graph.nodes.filter((n) => n.type === "item").length;
  const links = graph.edges.filter((e) => e.type === "related" || e.type === "step" || e.type === "blocks").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={ui.pageTitle}>Map</h1>
          {items > 0 && (
            <span className="text-xs text-faint">
              {items} item{items === 1 ? "" : "s"} · {links} link{links === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          Drag to arrange; what you move stays put. Tap anything to see what it connects to.
        </p>
      </div>

      {items === 0 ? (
        <EmptyState icon={<MapIcon size={22} />} title="Nothing to map yet" action={<ExampleCaptures />}>
          Capture a few things and they show up here, grouped by project and by who they involve.
        </EmptyState>
      ) : (
        <MapCanvas graph={graph} focusId={focusId} canSuggest={isSemanticSearchEnabled()} />
      )}

      {hasCeco && items > 0 && (
        <p className="text-xs text-muted">
          {cecoAll
            ? "Showing every page of the CECO portal. "
            : "CECO pages show up when one of your items is about them. "}
          <Link
            href={cecoAll ? "/map" : { pathname: "/map", query: { ceco: "all" } }}
            className="font-semibold text-accent underline-offset-2 hover:underline"
          >
            {cecoAll ? "Only the pages I have items on" : "Show the whole app"}
          </Link>
        </p>
      )}

      {items > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
          <Key line="var(--goal)" label="Step toward a goal" arrow />
          <Key line="var(--muted)" label="Related" />
          <Key line="var(--danger)" label="Has to happen first" dash="6 4" arrow />
          <Key line="var(--accent)" label="Suggested" dash="1 5" />
          <Key line="var(--followup)" label="Waiting on" />
        </dl>
      )}
    </div>
  );
}

function Key({ line, label, dash, arrow }: { line: string; label: string; dash?: string; arrow?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <dt aria-hidden>
        <svg width="30" height="8" viewBox="0 0 30 8">
          <line x1="1" y1="4" x2={arrow ? 23 : 29} y2="4" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} style={{ stroke: line }} />
          {arrow && <path d="M22 0.5L29 4L22 7.5z" style={{ fill: line }} />}
        </svg>
      </dt>
      <dd>{label}</dd>
    </div>
  );
}
