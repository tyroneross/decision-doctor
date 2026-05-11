// F-6 unit tests — RRF fusion is a pure function; tests run in isolation.
import { describe, it, expect } from "vitest";
import { rrfFuse } from "@/lib/ai-knowledge/search/rrf-fusion";

describe("rrfFuse", () => {
  it("returns [] for no legs", () => {
    expect(rrfFuse({})).toEqual([]);
  });

  it("returns [] when every leg is empty", () => {
    expect(rrfFuse({ a: [], b: [] })).toEqual([]);
  });

  it("ranks by sum of 1/(k+pos+1) across legs", () => {
    const result = rrfFuse(
      {
        lex: [
          { doc_id: "A", rank: 0.9 },
          { doc_id: "B", rank: 0.5 },
        ],
        vec: [
          { doc_id: "B", rank: 0.1 },
          { doc_id: "C", rank: 0.2 },
        ],
      },
      60,
    );
    // A: 1/61 = 0.01639
    // B: 1/62 (lex pos2) + 1/61 (vec pos1) = 0.01613 + 0.01639 = 0.03252
    // C: 1/62 = 0.01613
    expect(result[0]!.doc_id).toBe("B");
    expect(result[1]!.doc_id).toBe("A");
    expect(result[2]!.doc_id).toBe("C");
    expect(result[0]!.legs.sort()).toEqual(["lex", "vec"]);
  });

  it("k controls the rank smoothing", () => {
    const small = rrfFuse({ a: [{ doc_id: "X", rank: 1 }] }, 1);
    const big = rrfFuse({ a: [{ doc_id: "X", rank: 1 }] }, 100);
    // k=1 → 1/(1+1) = 0.5; k=100 → 1/(100+1) ≈ 0.0099
    expect(small[0]!.score).toBeCloseTo(0.5, 6);
    expect(big[0]!.score).toBeCloseTo(1 / 101, 6);
  });

  it("preserves leg attribution", () => {
    const r = rrfFuse({
      lex: [{ doc_id: "X", rank: 1 }],
      vec: [{ doc_id: "X", rank: 1 }],
      kg: [{ doc_id: "X", rank: 1 }],
    });
    expect(r[0]!.legs.sort()).toEqual(["kg", "lex", "vec"]);
  });
});
