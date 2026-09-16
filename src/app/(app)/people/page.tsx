import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon } from "@/components/icons";
import { SegmentNav } from "@/components/segment-nav";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadPeopleSummaries } from "@/lib/items/queries";

export default async function PeoplePage() {
  const db = await createSupabaseServerClient();
  const people = await loadPeopleSummaries(db);

  // People you're waiting on float to the top.
  const sorted = [...people].sort(
    (a, b) => b.waitingCount - a.waitingCount || b.totalCount - a.totalCount || a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>People</h1>
        <SegmentNav />
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No one yet">
          People appear here automatically when a capture mentions them.
        </EmptyState>
      ) : (
        <ul className={`${ui.card} divide-y divide-line`}>
          {sorted.map((p) => (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent"
                  aria-hidden
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.waitingCount
                    ? `waiting on ${p.waitingCount}`
                    : p.totalCount
                      ? `${p.totalCount} open`
                      : ""}
                </span>
                <ArrowRightIcon size={16} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
