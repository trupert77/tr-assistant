import { describe, expect, it } from "vitest";
import { deriveTitle } from "./index";

describe("deriveTitle", () => {
  it("uses the first non-empty line", () => {
    expect(deriveTitle("  Call Matt Friday\nabout the quote")).toBe("Call Matt Friday");
  });

  it("falls back to Untitled for blank input", () => {
    expect(deriveTitle("   \n  ")).toBe("Untitled");
  });

  it("keeps a line that fits the limit", () => {
    const line = "x".repeat(100);
    expect(deriveTitle(line)).toBe(line);
  });

  it("cuts long lines at a word boundary with an ellipsis", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const title = deriveTitle(words);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(101);
    expect(title.slice(0, -1)).toBe(title.slice(0, -1).trimEnd());
    expect(words.startsWith(title.slice(0, -1))).toBe(true);
  });

  it("hard-cuts a single long word rather than dropping most of it", () => {
    const title = deriveTitle("a".repeat(150));
    expect(title).toBe("a".repeat(100) + "…");
  });
});
