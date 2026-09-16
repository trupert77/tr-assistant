import Link from "next/link";
import { completeAction, reopenAction } from "@/app/(app)/items/actions";
import { formatDue } from "@/lib/dates";
import type { ItemRow as Item, PersonRole } from "@/lib/db/types";
import { CheckIcon } from "./icons";
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

  const meta = [
    item.due_at ? formatDue(item.due_at, timeZone) : null,
    waitingOn.length ? `waiting on ${waitingOn.join(", ")}` : null,
    projectName ?? null,
    !waitingOn.length && mentioned.length ? mentioned.join(", ") : null,
  ].filter(Boolean);

  return (
    <li className={ui.row}>
      {/* 44px hit area around a 24px circle, pulled in with negative margin. */}
      <form action={done ? reopenAction : completeAction} className="-m-2.5 -mr-1 shrink-0">
        <input type="hidden" name="id" value={item.id} />
        <button
          type="submit"
          aria-label={done ? "Mark not done" : "Mark done"}
          className="group flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
              done
                ? "border-accent bg-accent text-accent-foreground"
                : "border-line-strong group-hover:border-accent"
            }`}
          >
            {done && <CheckIcon size={14} strokeWidth={3} />}
          </span>
        </button>
      </form>

      <Link href={`/items/${item.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-[15px] leading-6 ${done ? "text-muted line-through" : ""}`}
        >
          {item.title}
        </span>
        {(meta.length > 0 || item.priority === "high") && (
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
          </span>
        )}
      </Link>
    </li>
  );
}
