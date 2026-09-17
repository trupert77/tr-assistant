import ical, { type VEvent } from "node-ical";
import type { ContextEvent } from "@/lib/ai";
import { zonedToIso } from "@/lib/dates";
import { getServerEnv } from "@/lib/env";

/**
 * Read-only calendar from an iCal feed: the "secret address in iCal format"
 * from Google Calendar, or a published Outlook / Microsoft 365 calendar.
 * No OAuth and nothing is ever written back. The URL is a credential, so it
 * lives in CALENDAR_ICS_URL and never reaches the browser.
 */

export type CalendarEvent = ContextEvent;

const CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 8000;

let cache: { at: number; events: VEvent[] } | undefined;

export function isCalendarConnected(): boolean {
  return Boolean(getServerEnv().CALENDAR_ICS_URL);
}

async function loadFeed(): Promise<VEvent[]> {
  const url = getServerEnv().CALENDAR_ICS_URL;
  if (!url) return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events;

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Calendar feed returned ${response.status}.`);

  const parsed = ical.sync.parseICS(await response.text());
  const events = Object.values(parsed).filter(
    (c): c is VEvent => Boolean(c) && (c as { type?: string }).type === "VEVENT",
  );
  cache = { at: Date.now(), events };
  return events;
}

const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "val" in value
      ? String((value as { val: unknown }).val)
      : "";

/** node-ical builds all-day dates in server-local time; read the calendar day back the same way. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Events overlapping [from, to), recurring ones expanded, soonest first.
 * Never throws: a broken feed means an empty calendar, not a broken Today.
 */
export async function loadEvents(from: Date, to: Date, timeZone: string): Promise<CalendarEvent[]> {
  try {
    const feed = await loadFeed();
    const out: CalendarEvent[] = [];

    for (const event of feed) {
      if (event.status === "CANCELLED") continue;
      const instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true });
      for (const instance of instances) {
        const start = instance.isFullDay
          ? zonedToIso(ymd(instance.start), "00:00", timeZone)
          : instance.start.toISOString();
        const end = instance.isFullDay
          ? zonedToIso(ymd(instance.end), "00:00", timeZone)
          : instance.end.toISOString();
        if (!start || !end || start >= to.toISOString() || end <= from.toISOString()) continue;
        out.push({
          title: text(instance.summary) || "(busy)",
          start,
          end,
          allDay: instance.isFullDay,
          location: text(instance.event.location) || null,
        });
      }
    }

    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  } catch {
    return [];
  }
}
