import { describe, expect, it } from "vitest";
import { nextDueAt } from "./recurrence";

const tz = "America/Detroit";
// Wednesday, September 16, 2026, 10:00 in Detroit (EDT, UTC-4).
const now = new Date("2026-09-16T14:00:00Z");

describe("nextDueAt", () => {
  it("keeps a weekly item on its weekday and time", () => {
    // Due Monday Sep 14 at 3pm, completed two days late.
    expect(nextDueAt("2026-09-14T19:00:00Z", "weekly", tz, now)).toBe("2026-09-21T19:00:00.000Z");
  });

  it("skips occurrences that are already in the past", () => {
    // A weekly item that sat overdue for a month comes back next week, not a month ago.
    expect(nextDueAt("2026-08-10T13:00:00Z", "weekly", tz, now)).toBe("2026-09-21T13:00:00.000Z");
  });

  it("moves a daily item done today to tomorrow", () => {
    expect(nextDueAt("2026-09-16T13:00:00Z", "daily", tz, now)).toBe("2026-09-17T13:00:00.000Z");
  });

  it("skips the weekend for weekdays", () => {
    const friday = new Date("2026-09-18T14:00:00Z");
    expect(nextDueAt("2026-09-18T13:00:00Z", "weekdays", tz, friday)).toBe("2026-09-21T13:00:00.000Z");
  });

  it("clamps monthly to the end of a short month", () => {
    const jan31 = new Date("2026-01-31T15:00:00Z");
    // 9:00 EST is 14:00 UTC.
    expect(nextDueAt("2026-01-31T14:00:00Z", "monthly", tz, jan31)).toBe("2026-02-28T14:00:00.000Z");
  });

  it("holds the wall-clock time across a daylight saving change", () => {
    // 9:00 EDT on Oct 5 is 13:00 UTC; 9:00 EST on Nov 5 is 14:00 UTC.
    const oct = new Date("2026-10-05T15:00:00Z");
    expect(nextDueAt("2026-10-05T13:00:00Z", "monthly", tz, oct)).toBe("2026-11-05T14:00:00.000Z");
  });

  it("steps from today at 9:00 when there was no due date", () => {
    expect(nextDueAt(null, "yearly", tz, now)).toBe("2027-09-16T13:00:00.000Z");
  });
});
