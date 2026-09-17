import Link from "next/link";
import { ArrowRightIcon, CheckIcon, FolderIcon, InboxIcon, ListCheckIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { RowActions } from "@/components/row-actions";
import { ui } from "@/components/ui";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";
import type { ItemRow as Item } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { loadReview, type RowMeta } from "@/lib/items/queries";
import { lastReviewOf } from "@/lib/review";
import { finishReviewAction } from "./actions";

/**
 * The weekly review: one pass over everything that tends to slip. Each row
 * gets a decision (do it, move it, park it, or let it go), and rows leave
 * the list as they are decided, so an empty page means done.
 */
export default async function ReviewPage() {
  const timeZone = getServerEnv().APP_TIMEZONE;
  const db = await createSupabaseServerClient();
  const [data, user] = await Promise.all([loadReview(db, timeZone), getCurrentUser()]);
  const last = lastReviewOf(user);
  const open = data.overdue.length + data.staleTasks.length + data.waiting.length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-xs font-semibold text-muted hover:text-foreground">
          ← Today
        </Link>
        <div className="flex items-center gap-3">
          <ListCheckIcon size={22} className="text-accent" />
          <h1 className={ui.pageTitle}>Weekly review</h1>
        </div>
        <p className="text-sm text-muted">
          {data.doneThisWeek > 0 ? `${data.doneThisWeek} done in the last 7 days. ` : ""}
          {last ? `Last review ${formatRelative(last.toISOString(), timeZone)}.` : "First review."}
          {open > 0 ? ` ${open} to decide.` : ""}
        </p>
      </div>

      {data.inboxCount > 0 && (
        <Link
          href="/inbox"
          className={`${ui.cardPad} flex items-center gap-4 transition-colors hover:border-line-strong hover:bg-surface-2`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <InboxIcon size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-bold">Clear the inbox first</span>
            <span className="text-xs text-muted">
              {data.inboxCount} capture{data.inboxCount === 1 ? "" : "s"} waiting to be filed or checked.
            </span>
          </span>
          <ArrowRightIcon size={18} className="shrink-0 text-faint" />
        </Link>
      )}

      <ReviewSection
        title="Overdue"
        hint="Still doing it? Pick a real day. Not doing it? Let it go."
        items={data.overdue}
        meta={data.meta}
        timeZone={timeZone}
        tone="overdue"
      />
      <ReviewSection
        title="Waiting on"
        hint="Open one to draft a nudge, or mark it done if it came through."
        items={data.waiting}
        meta={data.meta}
        timeZone={timeZone}
      />
      <ReviewSection
        title="Sitting undated"
        hint="No date for two weeks or more. Schedule it, keep it in Someday, or archive it."
        items={data.staleTasks}
        meta={data.meta}
        timeZone={timeZone}
      />

      {data.quietProjects.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={ui.sectionTitle}>
              Projects with nothing open
              <span className="ml-2 text-faint">{data.quietProjects.length}</span>
            </h2>
            <p className="text-xs text-muted">Finished? Archive it. Not finished? Capture the next step.</p>
          </div>
          <ul className={`${ui.card} divide-y divide-line`}>
            {data.quietProjects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <FolderIcon size={18} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
                  <ArrowRightIcon size={16} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={finishReviewAction} className="flex flex-col gap-2">
        <button type="submit" className={`${ui.btnPrimary} w-full`}>
          <CheckIcon size={16} strokeWidth={2.6} />
          {open === 0 ? "All clear. Finish review" : "Finish review"}
        </button>
        <p className="text-center text-xs text-faint">Today will remind you again in a week.</p>
      </form>
    </div>
  );
}

function ReviewSection({
  title,
  hint,
  items,
  meta,
  timeZone,
  tone = "default",
}: {
  title: string;
  hint: string;
  items: Item[];
  meta: RowMeta;
  timeZone: string;
  tone?: "default" | "overdue";
}) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={`${ui.sectionTitle} ${tone === "overdue" ? "text-danger" : ""}`}>
          {title}
          <span className="ml-2 text-faint">{items.length}</span>
        </h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <ul className={`${ui.card} divide-y divide-line`}>
        {items.map((item) => (
          <li key={item.id} className="flex flex-col">
            <ul>
              <ItemRow
                item={item}
                timeZone={timeZone}
                people={meta.people.get(item.id)}
                projectName={item.project_id ? meta.projects.get(item.project_id) : undefined}
                tone={tone}
              />
            </ul>
            <RowActions id={item.id} title={item.title} dated={item.due_at !== null} />
          </li>
        ))}
      </ul>
    </section>
  );
}
