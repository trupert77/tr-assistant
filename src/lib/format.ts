const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "yesterday", or a short date. */
export function formatRelative(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "yesterday";

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(then);
}
