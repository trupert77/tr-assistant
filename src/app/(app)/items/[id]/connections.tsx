"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { LinkIcon, MapIcon, SparklesIcon, XIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { kindStyles, ui } from "@/components/ui";
import type { ItemKind } from "@/lib/db/types";
import type { ItemLinks, LinkedItem } from "@/lib/links";
import {
  decideSuggestionAction,
  linkItemsAction,
  searchForLinkAction,
  unlinkItemsAction,
  type LinkCandidate,
} from "../../map/actions";

const smallButton =
  "shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-40";

/**
 * What this item connects to, and the tools to connect it to more. The same
 * links the map draws: goals it is a step toward, what blocks it, what it
 * blocks, related items, and suggestions waiting on a yes or no.
 */
export function Connections({
  itemId,
  kind,
  links,
}: {
  itemId: string;
  kind: ItemKind;
  links: ItemLinks;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  // Search as you type, a beat after the last keystroke.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchForLinkAction(text, itemId).then((found) => {
        if (cancelled) return;
        setResults(found);
        setSearching(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, itemId]);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, said: string) =>
    startTransition(async () => {
      const result = await action();
      toast(result.ok ? said : result.error ?? "That did not work.");
      if (result.ok) {
        setQuery("");
        setResults([]);
      }
    });

  const linked = new Set(
    [...links.goals, ...links.steps, ...links.related, ...links.blockedBy, ...links.blocks].map((i) => i.id),
  );
  const groups: { title: string; rows: LinkedItem[] }[] = [
    { title: "Step toward", rows: links.goals },
    { title: "Blocked by", rows: links.blockedBy },
    { title: "Blocks", rows: links.blocks },
    { title: "Related", rows: links.related },
  ].filter((g) => g.rows.length > 0);

  const showResults = query.trim().length >= 2;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={ui.sectionTitle}>Connections</h2>
        <Link
          href={{ pathname: "/map", query: { focus: `item:${itemId}` } }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-2 hover:underline"
        >
          <MapIcon size={13} strokeWidth={2.2} />
          See on the map
        </Link>
      </div>

      {links.suggested.length > 0 && (
        <div className="flex flex-col gap-2 rounded-3xl border border-accent/30 bg-accent-soft/40 p-4">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <SparklesIcon size={13} strokeWidth={2.2} />
            Possibly related
          </span>
          {links.suggested.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <ItemLink item={item} />
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => decideSuggestionAction({ a: itemId, b: item.id, accept: true }), "Linked")}
                className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-40"
              >
                Link
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => decideSuggestionAction({ a: itemId, b: item.id, accept: false }), "Dismissed")}
                className="shrink-0 px-1.5 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-40"
              >
                No
              </button>
            </div>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className={`${ui.cardPad} flex flex-col gap-3`}>
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</span>
              {group.rows.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <ItemLink item={item} />
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remove the link to ${item.title}`}
                    onClick={() => run(() => unlinkItemsAction({ a: itemId, b: item.id }), "Link removed")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-danger disabled:opacity-40"
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="link-search" className="sr-only">
          Find an item to connect
        </label>
        <div className="relative">
          <LinkIcon size={16} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            id="link-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Connect to another item…"
            autoComplete="off"
            className={`${ui.input} pl-12`}
          />
        </div>

        {showResults && (
          <ul className={`${ui.card} divide-y divide-line`}>
            {results.length === 0 && (
              <li className="px-5 py-3 text-sm text-muted">{searching ? "Searching…" : "Nothing matches."}</li>
            )}
            {results.map((candidate) => {
              const already = linked.has(candidate.id);
              return (
                <li key={candidate.id} className="flex flex-col gap-2 px-5 py-3">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kindStyles[candidate.kind].dot}`} />
                    <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                    <span className="shrink-0 text-xs text-faint">{kindStyles[candidate.kind].label}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => linkItemsAction({ from: itemId, to: candidate.id, kind: "related" }), "Linked")}
                      className={smallButton}
                    >
                      {already ? "Make it related" : "Related"}
                    </button>
                    {candidate.kind === "goal" && kind !== "goal" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => linkItemsAction({ from: itemId, to: candidate.id, kind: "step" }), "Added as a step")}
                        className={smallButton}
                      >
                        This is a step toward it
                      </button>
                    )}
                    {kind === "goal" && candidate.kind !== "goal" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => linkItemsAction({ from: candidate.id, to: itemId, kind: "step" }), "Added as a step")}
                        className={smallButton}
                      >
                        Make it a step
                      </button>
                    )}
                    {kind !== "goal" && kind !== "note" && candidate.kind !== "note" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => linkItemsAction({ from: candidate.id, to: itemId, kind: "blocks" }), "Marked as a blocker")}
                        className={smallButton}
                      >
                        Has to happen first
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemLink({ item }: { item: LinkedItem }) {
  return (
    <Link href={`/items/${item.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-sm hover:text-accent">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kindStyles[item.kind].dot}`} />
      <span className={`truncate ${item.status === "done" ? "text-muted line-through" : ""}`}>{item.title}</span>
    </Link>
  );
}
