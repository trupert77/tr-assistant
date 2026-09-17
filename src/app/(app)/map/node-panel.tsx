"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { LinkIcon, PinIcon, SparklesIcon, XIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { kindStyles } from "@/components/ui";
import type { ItemLinks, LinkedItem } from "@/lib/links";
import type { MapNode } from "@/lib/map/types";
import { decideSuggestionAction, loadNodeLinksAction, unlinkItemsAction } from "./actions";

/** The three ways to connect from the map. */
export type LinkKindChoice = "related" | "step" | "blocks";

const panelButton =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-40";

/**
 * The card that slides up when a node is tapped: what it is, what it connects
 * to, the suggestions waiting on a yes or no, and the link tools.
 */
export function NodePanel({
  node,
  pinned,
  busy,
  onClose,
  onUnpin,
  onLink,
  onJump,
}: {
  node: MapNode;
  pinned: boolean;
  busy: boolean;
  onClose: () => void;
  onUnpin: () => void;
  onLink: (kind: LinkKindChoice) => void;
  onJump: (itemId: string) => void;
}) {
  const [links, setLinks] = useState<ItemLinks | null>(null);
  const [working, startTransition] = useTransition();

  // Keyed by node id in the parent, so this runs once per selection.
  useEffect(() => {
    if (node.type !== "item") return;
    let cancelled = false;
    void loadNodeLinksAction(node.refId).then((result) => {
      if (!cancelled) setLinks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [node.type, node.refId]);

  const href = (
    node.type === "item"
      ? `/items/${node.refId}`
      : node.type === "project"
        ? `/projects/${node.refId}`
        : node.type === "person"
          ? `/people/${node.refId}`
          : node.type === "page"
            ? `/ceco?page=${encodeURIComponent(node.refId)}`
            : node.type === "area"
              ? `/ceco#area-${node.refId}`
              : "/ceco"
  ) as Route;

  const act = (run: () => Promise<{ ok: boolean; error?: string }>, said: string) =>
    startTransition(async () => {
      const result = await run();
      toast(result.ok ? said : result.error ?? "That did not work.");
      if (result.ok) setLinks(await loadNodeLinksAction(node.refId));
    });

  const connected: { title: string; rows: LinkedItem[] }[] = links
    ? [
        { title: "Steps", rows: links.steps },
        { title: "Step toward", rows: links.goals },
        { title: "Blocked by", rows: links.blockedBy },
        { title: "Blocks", rows: links.blocks },
        { title: "Related", rows: links.related },
      ].filter((group) => group.rows.length > 0)
    : [];

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex max-h-[55%] flex-col gap-3 overflow-y-auto rounded-3xl border border-line-strong bg-surface/95 p-4 shadow-float backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {node.type === "item" ? (
              <span className={`rounded-full px-2 py-0.5 normal-case tracking-normal ${kindStyles[node.kind ?? "task"].chip}`}>
                {kindStyles[node.kind ?? "task"].label}
              </span>
            ) : (
              { project: "Project", person: "Person", app: "CECO portal", area: "CECO area", page: "CECO page" }[node.type]
            )}
            {node.status === "done" && <span className="text-accent">Done</span>}
            {node.overdue && <span className="text-danger">Overdue</span>}
            {node.progress && node.progress.total > 0 && (
              <span className="normal-case tracking-normal">
                {node.progress.done} of {node.progress.total} steps
              </span>
            )}
          </span>
          <span className="text-[15px] font-bold leading-6">{node.label}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2">
          <XIcon size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link href={href} className={`${panelButton} border-transparent bg-linear-to-r from-accent to-accent-2 text-accent-foreground`}>
          Open
        </Link>
        {node.type === "item" && (
          <>
            <button type="button" disabled={busy} onClick={() => onLink("related")} className={panelButton}>
              <LinkIcon size={13} />
              Link to…
            </button>
            {node.kind === "goal" && (
              <button type="button" disabled={busy} onClick={() => onLink("step")} className={panelButton}>
                Add a step…
              </button>
            )}
            {node.kind !== "goal" && node.kind !== "note" && (
              <button type="button" disabled={busy} onClick={() => onLink("blocks")} className={panelButton}>
                Blocked by…
              </button>
            )}
          </>
        )}
        {pinned && (
          <button type="button" onClick={onUnpin} className={panelButton}>
            <PinIcon size={13} />
            Unpin
          </button>
        )}
      </div>

      {links && links.suggested.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <SparklesIcon size={12} strokeWidth={2.2} />
            Possibly related
          </span>
          {links.suggested.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => onJump(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kindStyles[item.kind].dot}`} />
                <span className="truncate">{item.title}</span>
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => act(() => decideSuggestionAction({ a: node.refId, b: item.id, accept: true }), "Linked")}
                className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-40"
              >
                Link
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => act(() => decideSuggestionAction({ a: node.refId, b: item.id, accept: false }), "Dismissed")}
                className="shrink-0 px-1 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-40"
              >
                No
              </button>
            </div>
          ))}
        </div>
      )}

      {connected.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</span>
          {group.rows.map((item, n) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => onJump(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent">
                {group.title === "Steps" ? (
                  <span className="w-4 shrink-0 text-right text-xs tabular-nums text-faint">{n + 1}</span>
                ) : (
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kindStyles[item.kind].dot}`} />
                )}
                <span className={`truncate ${item.status === "done" ? "text-muted line-through" : ""}`}>{item.title}</span>
              </button>
              <button
                type="button"
                disabled={working}
                aria-label={`Remove the link to ${item.title}`}
                onClick={() => act(() => unlinkItemsAction({ a: node.refId, b: item.id }), "Link removed")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-danger disabled:opacity-40"
              >
                <XIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
