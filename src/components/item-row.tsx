import Link from "next/link";
import { formatDue } from "@/lib/dates";
import type { ItemRow as Item, PersonRole } from "@/lib/db/types";
import { RECURRENCE_LABELS } from "@/lib/items/recurrence";
import { STALE_WAITING_DAYS, daysSince } from "@/lib/push/digest";
import { CompleteButton } from "./complete-button";
import { RepeatIcon } from "./icons";
import { kindStyles, ui } from "./ui";

export function ItemRow({
  item,
  timeZone,
  people = [],
  projectName,
  tone = "default",
}: {
  item: Item;
  timeZone: string;
  people?: { name: string; role: PersonRole }[];
  projectName?: string;
  tone?: "default" | "overdue";
}) {
  const done = item.status === "done";
  const waitingOn = people.filter((p) => p.role === "waiting_on").map((p) => p.name);
  const mentioned = people.filter((p) => p.role !== "waiting_on").map((p) => p.name);

  // How long a follow-up has sat unanswered. Shown from day two; red once
  // stale. One scheduled for later is not late yet, so it shows no age.
  const scheduledLater = item.due_at !== null && new Date(item.due_at) > new Date();
  const waitedDays =
    item.status === "waiting" && !scheduledLater ? daysSince(item.created_at) : 0;
  const stale = waitedDays >= STALE_WAITING_DAYS;

  const meta = [
    item.due_at ? formatDue(item.due_at, timeZone) : null,
    waitingOn.length ? `waiting on ${waitingOn.join(", ")}` : null,
    projectName ?? null,
    !waitingOn.length && mentioned.length ? mentioned.join(", ") : null,
  ].filter(Boolean);

  const showMeta =
    meta.length > 0 || item.priority === "high" || waitedDays >= 2 || Boolean(item.recurrence);

  return (
    <li className={ui.row}>
      <CompleteButton id={item.id} title={item.title} done={done} />

      <Link href={`/items/${item.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-[15px] leading-6 ${done ? "text-muted line-through" : ""}`}
        >
          {item.title}
        </span>
        {showMeta && (
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${kindStyles[item.kind].dot}`} aria-hidden />
            {item.priority === "high" && (
              <span className="font-semibold text-danger">High</span>
            )}
            {meta.map((m, i) => (
              <span key={i} className={i === 0 && tone === "overdue" ? "font-semibold text-danger" : ""}>
                {m}
              </span>
            ))}
            {waitedDays >= 2 && (
              <span className={stale ? "font-semibold text-danger" : ""}>{waitedDays}d waiting</span>
            )}
            {item.recurrence && (
              <span className="inline-flex items-center gap-1">
                <RepeatIcon size={11} strokeWidth={2.2} />
                {RECURRENCE_LABELS[item.recurrence].toLowerCase()}
              </span>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}
