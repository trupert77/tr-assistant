import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { CompleteButton } from "@/components/complete-button";
import { ExampleCaptures } from "@/components/example-captures";
import { CloudIcon, FlagIcon, FolderIcon, ListCheckIcon, SunIcon, TargetIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import { loadEvents, type CalendarEvent } from "@/lib/calendar";
import { isCecoConfigured } from "@/lib/ceco";
import { localDayBounds } from "@/lib/dates";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/db/server";
import type { ItemRow as Item } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { loadNextSteps, loadToday, type NextStep, type TodayData } from "@/lib/items/queries";
import { isReviewDue } from "@/lib/review";

const quickLink =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-foreground";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const timeZone = getServerEnv().APP_TIMEZONE;
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(now),
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  const db = await createSupabaseServerClient();
  const { start, end } = localDayBounds(now, timeZone);
  const [data, nextSteps, events, user] = await Promise.all([
    loadToday(db, timeZone, now),
    loadNextSteps(db),
    loadEvents(new Date(start), new Date(end), timeZone),
    getCurrentUser(),
  ]);
  const reviewDue = isReviewDue(user, now);
  const total =
    data.overdue.length + data.today.length + data.upcoming.length +
    data.waiting.length + data.recent.length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <p className={ui.eyebrow}>{dateLabel}</p>
        <h1 className={ui.pageTitle}>{greeting(hour)}, Travis</h1>
      </div>

      <nav aria-label="Views" className="-mt-2 flex flex-wrap gap-2">
        <Link href="/focus" className={quickLink}>
          <TargetIcon size={15} />
          Focus
        </Link>
        <Link href="/someday" className={quickLink}>
          <CloudIcon size={15} />
          Someday
        </Link>
        <Link
          href="/review"
          className={`${quickLink} ${reviewDue ? "border-accent/40 bg-accent-soft text-accent hover:text-accent" : ""}`}
        >
          <ListCheckIcon size={15} />
          {reviewDue ? "Review due" : "Review"}
        </Link>
        {isCecoConfigured() && (
          <Link href="/ceco" className={quickLink}>
            <FolderIcon size={15} />
            CECO
          </Link>
        )}
      </nav>

      <Calendar events={events} timeZone={timeZone} now={now} />

      <NextSteps steps={nextSteps} />

      {total === 0 ? (
        <EmptyState
          icon={<SunIcon size={22} />}
          title="Nothing on the board"
          action={<ExampleCaptures />}
        >
          Capture anything in the box above. Tasks and follow-ups with dates
          show up here as they come due.
        </EmptyState>
      ) : (
        <>
          <Section title="Overdue" items={data.overdue} data={data} timeZone={timeZone} tone="overdue" />
          <Section title="Today" items={data.today} data={data} timeZone={timeZone} />
          <Section title="Waiting on" items={data.waiting} data={data} timeZone={timeZone} />
          <Section title="Coming up" items={data.upcoming} data={data} timeZone={timeZone} />
          <Section title="Recently captured" items={data.recent} data={data} timeZone={timeZone} />
        </>
      )}
    </div>
  );
}

/**
 * The next move on each open goal. Steps usually have no date, so without
 * this a goal would only make progress when Travis went looking for it.
 */
function NextSteps({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className={ui.sectionTitle}>
        Next on your goals
        <span className="ml-2 text-faint">{steps.length}</span>
      </h2>
      <ul className={`${ui.card} divide-y divide-line`}>
        {steps.map(({ step, goalId, goalTitle, done, total }) => (
          <li key={`${goalId}-${step.id}`} className={ui.row}>
            <CompleteButton id={step.id} title={step.title} done={false} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link href={`/items/${step.id}`} className="text-[15px] leading-6">
                {step.title}
              </Link>
              <Link
                href={`/items/${goalId}`}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
              >
                <FlagIcon size={11} strokeWidth={2.2} className="shrink-0 text-goal" />
                <span className="truncate">{goalTitle}</span>
                <span className="shrink-0 text-faint">
                  {done}/{total}
                </span>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Today's events from the read-only calendar feed. Hidden when there are none. */
function Calendar({
  events,
  timeZone,
  now,
}: {
  events: CalendarEvent[];
  timeZone: string;
  now: Date;
}) {
  if (!events.length) return null;
  const clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const nowIso = now.toISOString();

  return (
    <section className="flex flex-col gap-3">
      <h2 className={ui.sectionTitle}>
        On the calendar
        <span className="ml-2 text-faint">{events.length}</span>
      </h2>
      <ul className={`${ui.card} divide-y divide-line`}>
        {events.map((e, i) => {
          const over = !e.allDay && e.end <= nowIso;
          const on = !e.allDay && e.start <= nowIso && e.end > nowIso;
          return (
            <li key={`${e.start}-${i}`} className={`flex items-baseline gap-3 px-5 py-3 ${over ? "opacity-50" : ""}`}>
              <span className={`w-20 shrink-0 text-xs tabular-nums ${on ? "font-semibold text-accent" : "text-muted"}`}>
                {e.allDay ? "All day" : clock.format(new Date(e.start))}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] leading-6">{e.title}</span>
                {e.location && <span className="truncate text-xs text-muted">{e.location}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Section({
  title,
  items,
  data,
  timeZone,
  tone = "default",
}: {
  title: string;
  items: Item[];
  data: TodayData;
  timeZone: string;
  tone?: "default" | "overdue";
}) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className={`${ui.sectionTitle} ${tone === "overdue" ? "text-danger" : ""}`}>
        {title}
        <span className="ml-2 text-faint">{items.length}</span>
      </h2>
      <ul className={`${ui.card} divide-y divide-line`}>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            timeZone={timeZone}
            people={data.people.get(item.id)}
            projectName={item.project_id ? data.projects.get(item.project_id) : undefined}
            tone={tone}
          />
        ))}
      </ul>
    </section>
  );
}
