// Unit tests for FIX-1: BM25 OR-quorum fallback.
//
// Covers two things without touching the live DB:
//   1. buildOrQuorum sanitization + join behavior
//   2. bm25Search falls back to OR-quorum when AND-quorum returns 0 rows

import { describe, it, expect, vi } from "vitest";
import { bm25Search, buildOrQuorum } from "@/lib/ai-knowledge/search/bm25-leg";

describe("buildOrQuorum", () => {
  it("joins multi-word lowercase tokens with ` | `", () => {
    expect(buildOrQuorum("small medical practices")).toBe(
      "small | medical | practices",
    );
  });

  it("lowercases and strips punctuation", () => {
    expect(buildOrQuorum("Claude's Opus-4.7 release!")).toBe(
      "claudes | opus47 | release",
    );
  });

  it("drops tokens shorter than 2 chars", () => {
    expect(buildOrQuorum("a b cc ddd")).toBe("cc | ddd");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(buildOrQuorum("   ")).toBe("");
  });

  it("handles single-token input", () => {
    expect(buildOrQuorum("Claude")).toBe("claude");
  });
});

describe("bm25Search OR-quorum fallback", () => {
  function makeTx(
    responses: Array<{ rows: Array<{ doc_id: string; rank: number }> }>,
  ) {
    const execute = vi.fn();
    for (const r of responses) execute.mockResolvedValueOnce(r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { tx: { execute } as any, execute };
  }

  it("returns AND-quorum hits when present (no fallback call)", async () => {
    const { tx, execute } = makeTx([
      { rows: [{ doc_id: "a", rank: 0.9 }, { doc_id: "b", rank: 0.5 }] },
    ]);
    const hits = await bm25Search(tx, "claude opus");
    expect(hits).toEqual([
      { doc_id: "a", rank: 0.9 },
      { doc_id: "b", rank: 0.5 },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("falls back to OR-quorum when AND-quorum yields zero rows", async () => {
    const { tx, execute } = makeTx([
      { rows: [] },
      { rows: [{ doc_id: "c", rank: 0.4 }] },
    ]);
    const hits = await bm25Search(
      tx,
      "how do small medical practices use AI to reduce billing time",
    );
    expect(hits).toEqual([{ doc_id: "c", rank: 0.4 }]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("returns empty when both passes yield zero rows", async () => {
    const { tx } = makeTx([{ rows: [] }, { rows: [] }]);
    const hits = await bm25Search(tx, "xyzzy plugh");
    expect(hits).toEqual([]);
  });

  it("returns empty without DB call when query is whitespace", async () => {
    const { tx, execute } = makeTx([]);
    const hits = await bm25Search(tx, "   ");
    expect(hits).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("skips fallback when OR-quorum sanitizes to empty", async () => {
    // After AND returns 0 and the trimmed-but-junk-only input sanitizes
    // to an empty string, the second DB call must NOT happen.
    const { tx, execute } = makeTx([{ rows: [] }]);
    const hits = await bm25Search(tx, "! ? @");
    expect(hits).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
