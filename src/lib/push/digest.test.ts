import { describe, expect, it } from "vitest";
import type { ItemRow } from "@/lib/db/types";
import { buildDigest, daysSince } from "./digest";

const tz = "America/Detroit";
const now = new Date("2026-09-18T11:30:00Z"); // Friday 7:30 in Detroit

function item(title: string, overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: title,
    user_id: "u",
    kind: "task",
    title,
    body: null,
    source_text: null,
    status: "open",
    priority: null,
    due_at: null,
    workspace_id: null,
    project_id: null,
    organization_id: null,
    category: null,
    tags: [],
    inbox_item_id: null,
    completed_at: null,
    recurrence: null,
    recurred_from: null,
    reminded_at: null,
    attachment_path: null,
    content_hash: "",
    created_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

const empty = { overdue: [], today: [], staleWaiting: [], events: [], reviewDay: false, timeZone: tz, now };

describe("buildDigest", () => {
  it("says nothing when there is nothing to say", () => {
    expect(buildDigest(empty)).toBeNull();
  });

  it("leads with counts, then the calendar, the first items, and the stalest follow-up", () => {
    const digest = buildDigest({
      ...empty,
      overdue: [item("Renew cert")],
      today: [item("Order toner"), item("Call Gary")],
      staleWaiting: [{ item: item("SQL access", { kind: "followup", status: "waiting" }), person: "Matt" }],
      events: [
        { title: "Standup", start: "2026-09-18T13:00:00Z", end: "2026-09-18T13:15:00Z", allDay: false, location: null },
      ],
    });
    expect(digest?.body.split("\n")).toEqual([
      "2 due today, 1 overdue, 1 stale follow-up.",
      "Calendar: 9am Standup",
      "First: Renew cert · Order toner · Call Gary",
      "Waiting 7d: Matt: SQL access",
    ]);
    expect(digest?.url).toBe("/");
  });

  it("points at the review on a quiet Friday", () => {
    const digest = buildDigest({ ...empty, reviewDay: true });
    expect(digest?.body).toContain("weekly review");
    expect(digest?.url).toBe("/review");
  });
});

describe("daysSince", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysSince("2026-09-10T12:00:00Z", now)).toBe(7);
    expect(daysSince("2026-09-19T12:00:00Z", now)).toBe(0);
  });
});
