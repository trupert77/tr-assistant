import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

const TZ = "America/Detroit";
const now = new Date("2026-09-16T18:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("formatRelative", () => {
  it("steps through the relative buckets", () => {
    expect(formatRelative(ago(10_000), TZ, now)).toBe("just now");
    expect(formatRelative(ago(5 * 60_000), TZ, now)).toBe("5m ago");
    expect(formatRelative(ago(3 * 3_600_000), TZ, now)).toBe("3h ago");
    expect(formatRelative(ago(30 * 3_600_000), TZ, now)).toBe("yesterday");
  });

  it("falls back to a short date, adding the year only when it differs", () => {
    expect(formatRelative("2026-09-10T12:00:00Z", TZ, now)).toBe("Sep 10");
    expect(formatRelative("2025-12-20T12:00:00Z", TZ, now)).toBe("Dec 20, 2025");
  });
});
