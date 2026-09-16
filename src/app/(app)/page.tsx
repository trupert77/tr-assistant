import { EmptyState } from "@/components/empty-state";
import { SunIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { getServerEnv } from "@/lib/env";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className={ui.eyebrow}>{dateLabel}</p>
        <h1 className={ui.pageTitle}>{greeting(hour)}, Travis</h1>
      </div>
      <EmptyState icon={<SunIcon size={22} />} title="Nothing due yet">
        Capture anything in the box above. Tasks and follow-ups with dates will
        show up here once they exist.
      </EmptyState>
    </div>
  );
}
