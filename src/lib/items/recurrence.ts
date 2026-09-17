import { isoToZonedParts, localDate, shiftLocalDate, zonedToIso } from "@/lib/dates";
import type { Recurrence } from "@/lib/db/types";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};

/** Add whole months to a YYYY-MM-DD, clamping to the last day of the target month. */
function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

function step(date: string, rule: Recurrence): string {
  switch (rule) {
    case "daily":
      return shiftLocalDate(date, 1);
    case "weekdays": {
      let next = shiftLocalDate(date, 1);
      for (;;) {
        const [y, m, d] = next.split("-").map(Number);
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        if (dow !== 0 && dow !== 6) return next;
        next = shiftLocalDate(next, 1);
      }
    }
    case "weekly":
      return shiftLocalDate(date, 7);
    case "biweekly":
      return shiftLocalDate(date, 14);
    case "monthly":
      return shiftMonths(date, 1);
    case "quarterly":
      return shiftMonths(date, 3);
    case "yearly":
      return shiftMonths(date, 12);
  }
}

/**
 * When the next occurrence is due, given the one just completed. Steps from
 * the old due date so "every Monday" stays on Mondays even when it was done
 * late, and keeps stepping until the result is after today so a task that
 * sat overdue for a month does not come back already overdue. The time of
 * day carries over. With no due date it steps from today.
 */
export function nextDueAt(
  dueAt: string | null,
  rule: Recurrence,
  timeZone: string,
  now: Date = new Date(),
): string {
  const today = localDate(now, timeZone);
  const base = dueAt ? isoToZonedParts(dueAt, timeZone) : { date: today, time: "09:00" };

  let next = step(base.date, rule);
  while (next <= today) next = step(next, rule);

  return zonedToIso(next, base.time, timeZone)!;
}
