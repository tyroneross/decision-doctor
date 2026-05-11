// tests/qa-grounding.test.ts — Q1: Unit tests for lib/qa/grounding.ts.
//
// Tests:
//   - shouldEmitEmptyGrounding returns true on low-score sources
//   - shouldEmitEmptyGrounding returns true when count < 2
//   - shouldEmitEmptyGrounding returns false with >=2 adequate sources
//   - formatSourcesForPrompt includes UUID + kind header
//   - formatSourcesForPrompt truncates body to budget
//   - formatSourcesForPrompt handles empty sources list

import { describe, it, expect } from "vitest";
import {
  formatSourcesForPrompt,
  shouldEmitEmptyGrounding,
  type SourceForGrounding,
} from "@/lib/qa/grounding";

const makeSource = (
  overrides: Partial<SourceForGrounding> = {},
): SourceForGrounding => ({
  uuid: "a1b2c3d4-0000-0000-0000-000000000001",
  kind: "use_case",
  title: "Test Use Case",
  body: "A short body.",
  score: 0.8,
  ...overrides,
});

// ─── shouldEmitEmptyGrounding ───────────────────────────────────────────────

describe("shouldEmitEmptyGrounding", () => {
  it("returns true when sources array is empty", () => {
    expect(shouldEmitEmptyGrounding([])).toBe(true);
  });

  it("returns true when only 1 source (count < 2)", () => {
    expect(shouldEmitEmptyGrounding([makeSource()])).toBe(true);
  });

  it("returns true when all sources have score below minScore", () => {
    const sources: SourceForGrounding[] = [
      makeSource({ score: 0.1 }),
      makeSource({ score: 0.05 }),
    ];
    expect(shouldEmitEmptyGrounding(sources, 0.3)).toBe(true);
  });

  it("returns false when >=2 sources and at least one above minScore", () => {
    const sources: SourceForGrounding[] = [
      makeSource({ score: 0.1 }),
      makeSource({ score: 0.9 }),
    ];
    expect(shouldEmitEmptyGrounding(sources, 0.3)).toBe(false);
  });

  it("returns false when >=2 sources with no scores defined", () => {
    // No scores → not all scored → condition doesn't fire.
    const sources: SourceForGrounding[] = [
      makeSource({ score: undefined }),
      makeSource({ score: undefined }),
    ];
    expect(shouldEmitEmptyGrounding(sources)).toBe(false);
  });

  it("returns false when >=2 sources all above threshold", () => {
    const sources: SourceForGrounding[] = [
      makeSource({ score: 0.5 }),
      makeSource({ score: 0.7 }),
      makeSource({ score: 0.9 }),
    ];
    expect(shouldEmitEmptyGrounding(sources, 0.3)).toBe(false);
  });

  it("uses default minScore of 0.3", () => {
    const sources: SourceForGrounding[] = [
      makeSource({ score: 0.29 }),
      makeSource({ score: 0.29 }),
    ];
    expect(shouldEmitEmptyGrounding(sources)).toBe(true);
  });
});

// ─── formatSourcesForPrompt ──────────────────────────────────────────────────

describe("formatSourcesForPrompt", () => {
  it("returns fallback string for empty sources", () => {
    const result = formatSourcesForPrompt([]);
    expect(result).toBe("(no sources retrieved)");
  });

  it("includes the UUID in the header", () => {
    const src = makeSource({ uuid: "deadbeef-0000-0000-0000-000000000001" });
    const result = formatSourcesForPrompt([src]);
    expect(result).toContain("deadbeef-0000-0000-0000-000000000001");
  });

  it("includes the kind in the header", () => {
    const src = makeSource({ kind: "prompt" });
    const result = formatSourcesForPrompt([src]);
    expect(result).toContain("kind: prompt");
  });

  it("includes the title", () => {
    const src = makeSource({ title: "My Unique Title ABC" });
    const result = formatSourcesForPrompt([src]);
    expect(result).toContain("My Unique Title ABC");
  });

  it("truncates body at 500 chars", () => {
    const longBody = "x".repeat(600);
    const src = makeSource({ body: longBody });
    const result = formatSourcesForPrompt([src]);
    // The body in the output should not contain 600 x's — truncated at 500.
    expect(result).not.toContain("x".repeat(501));
    expect(result).toContain("…");
  });

  it("does not truncate body that is exactly 500 chars", () => {
    const body500 = "y".repeat(500);
    const src = makeSource({ body: body500 });
    const result = formatSourcesForPrompt([src]);
    expect(result).not.toContain("…");
    expect(result).toContain(body500);
  });

  it("separates multiple sources with double newline", () => {
    const s1 = makeSource({
      uuid: "aaaaaaaa-0000-0000-0000-000000000001",
      title: "First",
    });
    const s2 = makeSource({
      uuid: "bbbbbbbb-0000-0000-0000-000000000002",
      title: "Second",
    });
    const result = formatSourcesForPrompt([s1, s2]);
    expect(result).toContain("\n\n");
    expect(result).toContain("First");
    expect(result).toContain("Second");
  });

  it("formats the ### Source header correctly", () => {
    const src = makeSource({
      uuid: "cccccccc-0000-0000-0000-000000000003",
      kind: "corpus",
    });
    const result = formatSourcesForPrompt([src]);
    expect(result).toMatch(
      /### Source \[cccccccc-0000-0000-0000-000000000003\] \(kind: corpus\)/,
    );
  });
});
