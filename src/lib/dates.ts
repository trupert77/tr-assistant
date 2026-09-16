/** Timezone helpers without a date library. */

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Offset of `timeZone` from UTC at `instant`, in minutes (east positive). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Interpret a wall-clock date (YYYY-MM-DD) and optional time (HH:MM) in
 * `timeZone` and return the instant as an ISO string. Date-only inputs
 * default to 09:00 local so "Friday" sorts before "Friday at 3pm".
 */
export function zonedToIso(
  date: string,
  time: string | null,
  timeZone: string,
): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = t ? [Number(t[1]), Number(t[2])] : [9, 0];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;

  const wall = Date.UTC(y, mo - 1, da, h, mi);
  // Two passes handle the DST edge where the offset changes at the target.
  let instant = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  instant = wall - offsetMinutes(new Date(instant), timeZone) * 60_000;
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** "Wednesday, September 16, 2026 at 3:45 PM" in the given zone. */
export function describeNow(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

/** YYYY-MM-DD for `now` in the given zone. */
export function localDate(now: Date, timeZone: string): string {
  const parts = partsFormatter(timeZone).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Short human label for a due instant: "Fri, Sep 18" or "Today 3:00 PM". */
export function formatDue(iso: string, timeZone: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = localDate(d, timeZone) === localDate(now, timeZone);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  if (sameDay) return `Today ${time}`;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  return time === "9:00 AM" ? day : `${day} ${time}`;
}
