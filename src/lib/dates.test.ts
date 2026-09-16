import { describe, expect, it } from "vitest";
import {
  formatDue,
  isoToZonedParts,
  localDate,
  localDayBounds,
  nextMondayLocal,
  shiftLocalDate,
  zonedToIso,
} from "./dates";

const TZ = "America/Detroit"; // EDT = UTC-4 in September, EST = UTC-5 in January

describe("zonedToIso", () => {
  it("defaults date-only input to 09:00 local", () => {
    expect(zonedToIso("2026-09-18", null, TZ)).toBe("2026-09-18T13:00:00.000Z");
  });

  it("honours an explicit time", () => {
    expect(zonedToIso("2026-09-18", "15:30", TZ)).toBe("2026-09-18T19:30:00.000Z");
  });

  it("uses the winter offset in January", () => {
    expect(zonedToIso("2026-01-15", "09:00", TZ)).toBe("2026-01-15T14:00:00.000Z");
  });

  it("rejects malformed or out-of-range input", () => {
    expect(zonedToIso("2026/09/18", null, TZ)).toBeNull();
    expect(zonedToIso("2026-13-01", null, TZ)).toBeNull();
    expect(zonedToIso("2026-09-18", "25:00", TZ)).toBeNull();
  });
});

describe("localDate / isoToZonedParts", () => {
  it("reports the wall-clock date in the zone, not UTC", () => {
    // 01:30Z on the 17th is still the evening of the 16th in Detroit.
    expect(localDate(new Date("2026-09-17T01:30:00Z"), TZ)).toBe("2026-09-16");
  });

  it("round-trips through zonedToIso", () => {
    const iso = zonedToIso("2026-09-18", "15:30", TZ)!;
    expect(isoToZonedParts(iso, TZ)).toEqual({ date: "2026-09-18", time: "15:30" });
  });
});

describe("shiftLocalDate", () => {
  it("does calendar arithmetic across month and year ends", () => {
    expect(shiftLocalDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("localDayBounds", () => {
  it("spans local midnight to local midnight", () => {
    const now = new Date("2026-09-16T20:00:00Z");
    expect(localDayBounds(now, TZ)).toEqual({
      today: "2026-09-16",
      start: "2026-09-16T04:00:00.000Z",
      end: "2026-09-17T04:00:00.000Z",
    });
  });
});

describe("formatDue", () => {
  const now = new Date("2026-09-16T18:00:00Z"); // Wed Sep 16, 2:00 PM Detroit

  it("shows only the time for today", () => {
    expect(formatDue("2026-09-16T19:00:00Z", TZ, now)).toBe("Today 3:00 PM");
  });

  it("drops the default 9:00 AM time on other days", () => {
    expect(formatDue("2026-09-18T13:00:00Z", TZ, now)).toBe("Fri, Sep 18");
  });

  it("keeps an explicit time on other days", () => {
    expect(formatDue("2026-09-18T19:00:00Z", TZ, now)).toBe("Fri, Sep 18 3:00 PM");
  });
});

describe("nextMondayLocal", () => {
  it("finds the coming Monday from midweek", () => {
    expect(nextMondayLocal(new Date("2026-09-16T18:00:00Z"), TZ)).toBe("2026-09-21");
  });

  it("skips to the following week when today is Monday", () => {
    expect(nextMondayLocal(new Date("2026-09-14T18:00:00Z"), TZ)).toBe("2026-09-21");
  });
});
