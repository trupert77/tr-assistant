import Link from "next/link";
import { CompleteButton } from "@/components/complete-button";
import { EmptyState } from "@/components/empty-state";
import { TargetIcon } from "@/components/icons";
import { kindStyles, ui } from "@/components/ui";
import { formatDue } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { loadFocus } from "@/lib/items/queries";

/** The top three, and nothing else. For when the full board is too much to look at. */
export default async function FocusPage() {
  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();
  const { items, hidden, meta } = await loadFocus(db, timeZone);
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className={ui.eyebrow}>Focus</p>
        <h1 className={ui.pageTitle}>
          {items.length ? `Just ${items.length === 1 ? "this" : `these ${items.length}`}` : "You're clear"}
        </h1>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<TargetIcon size={22} />} title="Nothing pressing">
          Nothing is overdue, due today, or marked high priority. Pick something from Someday, or
          take the win.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, n) => {
            const waitingOn = (meta.people.get(item.id) ?? [])
              .filter((p) => p.role === "waiting_on")
              .map((p) => p.name);
            const overdue = item.due_at !== null && item.due_at < now;
            return (
              <li key={item.id} className={`${ui.cardPad} flex items-start gap-4`}>
                <span className="pt-1">
                  <CompleteButton id={item.id} title={item.title} done={false} />
                </span>
                <Link href={`/items/${item.id}`} className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
                    {n + 1} of {items.length}
                  </span>
                  <span className="text-lg font-bold leading-7">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${kindStyles[item.kind].dot}`} aria-hidden />
                    {item.priority === "high" && <span className="font-semibold text-danger">High</span>}
                    {item.due_at && (
                      <span className={overdue ? "font-semibold text-danger" : ""}>
                        {formatDue(item.due_at, timeZone)}
                      </span>
                    )}
                    {waitingOn.length > 0 && <span>waiting on {waitingOn.join(", ")}</span>}
                    {item.project_id && meta.projects.get(item.project_id) && (
                      <span>{meta.projects.get(item.project_id)}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-center text-xs text-muted">
        {hidden > 0 ? `${hidden} more can wait. ` : ""}
        <Link href="/" className="font-semibold text-accent underline-offset-2 hover:underline">
          See everything
        </Link>
      </p>
    </div>
  );
}
