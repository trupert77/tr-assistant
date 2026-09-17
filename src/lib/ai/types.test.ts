import { describe, expect, it } from "vitest";
import { answerSchema, classificationSchema, parseStoredResult } from "./types";

const valid = {
  kind: "followup",
  title: "Matt · skid steer quote",
  body: null,
  priority: "normal",
  due_date: "2026-09-18",
  due_time: null,
  recurrence: null,
  workspace_slug: "sales",
  project_name: null,
  category: "sales",
  tags: ["quote"],
  people: [{ name: "Matt", role: "waiting_on" }],
  ceco_pages: [] as string[],
  confidence: 0.82,
  reasoning: "Waiting on someone else, with a day named.",
};

describe("classificationSchema", () => {
  it("accepts a well-formed classification", () => {
    expect(classificationSchema.parse(valid)).toEqual(valid);
  });

  it("rejects confidence outside 0..1", () => {
    expect(classificationSchema.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
  });

  it("rejects an unknown kind, role, or recurrence", () => {
    expect(classificationSchema.safeParse({ ...valid, kind: "event" }).success).toBe(false);
    expect(
      classificationSchema.safeParse({ ...valid, people: [{ name: "Matt", role: "cc" }] })
        .success,
    ).toBe(false);
    expect(classificationSchema.safeParse({ ...valid, recurrence: "hourly" }).success).toBe(false);
  });

  it("requires every field to be present, even when null", () => {
    const missing: Partial<typeof valid> = { ...valid };
    delete missing.body;
    expect(classificationSchema.safeParse(missing).success).toBe(false);
  });
});

describe("parseStoredResult", () => {
  it("reads a multi-item result", () => {
    const second = { ...valid, kind: "task", title: "Order toner" };
    expect(parseStoredResult({ items: [valid, second] })).toEqual([valid, second]);
  });

  it("reads a row filed before captures could split or repeat", () => {
    const legacy: Partial<typeof valid> = { ...valid };
    delete legacy.recurrence;
    delete legacy.ceco_pages;
    expect(parseStoredResult(legacy)).toEqual([valid]);
  });

  it("reads a multi-item row filed before the CECO connection", () => {
    const older: Partial<typeof valid> = { ...valid };
    delete older.ceco_pages;
    expect(parseStoredResult({ items: [older] })).toEqual([valid]);
  });

  it("returns nothing for junk", () => {
    expect(parseStoredResult(null)).toEqual([]);
    expect(parseStoredResult({ items: "no" })).toEqual([]);
  });
});

describe("answerSchema", () => {
  it("requires the actions list, even when empty", () => {
    expect(answerSchema.safeParse({ answer: "Nothing due.", cited_item_ids: [] }).success).toBe(false);
    expect(
      answerSchema.safeParse({ answer: "Nothing due.", cited_item_ids: [], actions: [] }).success,
    ).toBe(true);
  });
});
