import { describe, expect, it } from "vitest";
import {
  type CecoInitiative,
  groupInitiatives,
  nextStepOf,
  progressOf,
  statusStyle,
  targetDateNote,
  unfinishedUpstream,
} from "./initiatives";

const step = (id: string, title: string, done: boolean) => ({
  id,
  position: Number(id.slice(1)),
  title,
  detail: null,
  done,
  done_at: done ? "2026-09-10T00:00:00Z" : null,
});

const initiative = (over: Partial<CecoInitiative> & { id: string }): CecoInitiative => ({
  title: over.id,
  summary: null,
  status: "active",
  priority: "medium",
  target_date: null,
  notes: null,
  owner_name: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
  sort_order: 100,
  steps: [],
  updates: [],
  feeds_into: [],
  waiting_on: [],
  ...over,
});

describe("progressOf", () => {
  it("counts the steps that are done", () => {
    const it1 = initiative({
      id: "a",
      steps: [step("s1", "one", true), step("s2", "two", true), step("s3", "three", false)],
    });
    expect(progressOf(it1)).toEqual({ done: 2, total: 3, pct: 67 });
  });

  it("reads an empty plan as 0%, not a finished one", () => {
    expect(progressOf(initiative({ id: "a" }))).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe("nextStepOf", () => {
  it("is the first step not checked off", () => {
    const it1 = initiative({ id: "a", steps: [step("s1", "one", true), step("s2", "two", false)] });
    expect(nextStepOf(it1)?.title).toBe("two");
  });

  it("is nothing once every step is done", () => {
    expect(nextStepOf(initiative({ id: "a", steps: [step("s1", "one", true)] }))).toBeNull();
  });
});

describe("groupInitiatives", () => {
  it("splits the board and keeps CECO's order inside each group", () => {
    const groups = groupInitiatives([
      initiative({ id: "a", status: "active" }),
      initiative({ id: "b", status: "done" }),
      initiative({ id: "c", status: "blocked" }),
      initiative({ id: "d", status: "active" }),
      initiative({ id: "e", status: "hold" }),
      initiative({ id: "f", status: "idea" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["active", "attention", "idea", "done"]);
    expect(groups[0].initiatives.map((i) => i.id)).toEqual(["a", "d"]);
    expect(groups[1].initiatives.map((i) => i.id)).toEqual(["c", "e"]);
  });

  it("leaves out groups with nothing in them", () => {
    const groups = groupInitiatives([initiative({ id: "a", status: "active" })]);
    expect(groups.map((g) => g.key)).toEqual(["active"]);
  });

  it("shows a status this app has never met rather than dropping it", () => {
    const groups = groupInitiatives([initiative({ id: "a", status: "parked" })]);
    expect(groups.map((g) => g.key)).toEqual(["other"]);
    expect(statusStyle("parked").label).toBe("parked");
  });
});

describe("unfinishedUpstream", () => {
  it("names only the upstream work that is still open, and ignores ids off the board", () => {
    const one = initiative({ id: "one", status: "done" });
    const two = initiative({ id: "two", status: "blocked" });
    const target = initiative({ id: "three", waiting_on: ["one", "two", "gone"] });
    const byId = new Map([one, two, target].map((i) => [i.id, i]));
    expect(unfinishedUpstream(target, byId).map((i) => i.id)).toEqual(["two"]);
  });
});

describe("targetDateNote", () => {
  const now = new Date(2026, 8, 17); // 2026-09-17, local

  it("counts the days left", () => {
    expect(targetDateNote("2026-09-21", "active", now)).toEqual({ text: "Sep 21, 2026 · in 4 days", late: false });
  });

  it("reads a date in the past as late", () => {
    expect(targetDateNote("2026-09-16", "active", now)).toEqual({ text: "Sep 16, 2026 · 1 day late", late: true });
  });

  it("calls today today, all day", () => {
    const evening = new Date(2026, 8, 17, 23, 30);
    expect(targetDateNote("2026-09-17", "active", evening)).toEqual({ text: "Sep 17, 2026 · today", late: false });
  });

  it("leaves a finished initiative's date as history, not a deadline", () => {
    expect(targetDateNote("2026-09-01", "done", now)).toEqual({ text: "Sep 1, 2026", late: false });
  });

  it("reads the date as local, so it never shows the day before", () => {
    expect(targetDateNote("2026-01-01", "idea", new Date(2026, 0, 1))?.text).toMatch(/^Jan 1, 2026/);
  });

  it("is nothing when there is no date", () => {
    expect(targetDateNote(null, "active", now)).toBeNull();
  });
});
