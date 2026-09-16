import { EmptyState } from "@/components/empty-state";
import { ExampleCaptures } from "@/components/example-captures";
import { SunIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { ItemRow as Item } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";
import { loadToday, type TodayData } from "@/lib/items/queries";

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
  const data = await loadToday(db, timeZone, now);
  const total =
    data.overdue.length + data.today.length + data.upcoming.length +
    data.waiting.length + data.recent.length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <p className={ui.eyebrow}>{dateLabel}</p>
        <h1 className={ui.pageTitle}>{greeting(hour)}, Travis</h1>
      </div>

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
