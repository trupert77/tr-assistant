import { describe, expect, it } from "vitest";
import { classificationSchema } from "./types";

const valid = {
  kind: "followup",
  title: "Matt · skid steer quote",
  body: null,
  priority: "normal",
  due_date: "2026-09-18",
  due_time: null,
  workspace_slug: "sales",
  project_name: null,
  category: "sales",
  tags: ["quote"],
  people: [{ name: "Matt", role: "waiting_on" }],
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

  it("rejects an unknown kind or role", () => {
    expect(classificationSchema.safeParse({ ...valid, kind: "event" }).success).toBe(false);
    expect(
      classificationSchema.safeParse({ ...valid, people: [{ name: "Matt", role: "cc" }] })
        .success,
    ).toBe(false);
  });

  it("requires every field to be present, even when null", () => {
    const missing: Partial<typeof valid> = { ...valid };
    delete missing.body;
    expect(classificationSchema.safeParse(missing).success).toBe(false);
  });
});
