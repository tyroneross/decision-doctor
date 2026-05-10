// T-14 (F-11) — PEDE Stage-0 classifier routing.
//
// What this asserts:
//   1. Classifier emits valid (epistemicType, structuralType, modifiers)
//      against 12 fixtures (3 each: SED, VDD, EDD, TCLD).
//   2. Same input → same classification across 5 repeats (determinism contract
//      at temperature: 0).
//   3. Type-2 (diagnostic) and Type-3 (predictive) inputs trigger
//      decline-and-reframe (shouldDeclineAndReframe = true).
//   4. Type-4/VDD inputs flagged via isVdd() so the downstream pipeline can
//      strip recommendation.confidence.
//   5. reframeMessageFor() returns non-empty reply + chips for every
//      decline-and-reframe epistemic type.
//
// Mocking: callStage is mocked with a hand-curated classification per fixture
// so the test runs deterministically without a live Groq endpoint. The
// determinism contract is what we assert — the LLM's actual accuracy on
// these fixtures is a separate live test.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/groq", () => ({
  callStage: vi.fn(),
  GROQ_MODEL: "test-mock-model",
  groq: {},
}));

import { callStage } from "@/lib/groq";
import {
  runStage0Classifier,
  shouldDeclineAndReframe,
  isVdd,
  reframeMessageFor,
} from "@/lib/engine/stage0-classifier";
import {
  DecisionTypeSchema,
  EpistemicTypeSchema,
  StructuralTypeSchema,
} from "@/shared/schema";

interface Fixture {
  input: string;
  expectedEpistemic: "decision_analysis" | "diagnostic" | "predictive" | "optimization" | "descriptive" | "sequential";
  expectedStructural: "SED" | "VDD" | "EDD" | "TCLD" | "GDD";
  expectedModifiers?: Array<"HC" | "SP" | "GD" | "MS" | "UD" | "NF">;
}

// 12 fixtures — 3 each for SED, VDD, EDD, TCLD. Plus 3 extra for the
// out-of-scope reframe path (Type-2 diagnostic, Type-3 predictive, Type-5
// optimization) to exercise the decline-and-reframe routing.
const FIXTURES: Fixture[] = [
  // ── 3 × SED (Structured Enumerable Decisions) ────────────────────────
  {
    input: "Should I hire a part-time virtual assistant, hold steady, or cap intakes?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "SED",
  },
  {
    input: "Should I raise my rates 8% on July 1 or wait until next year?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "SED",
  },
  {
    input: "Should I build a waitlist or add evening hours to my schedule?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "SED",
  },
  // ── 3 × VDD (Values-Dominant Decisions) ──────────────────────────────
  {
    input: "Should I sell my practice or keep it for another five years?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "VDD",
    expectedModifiers: ["HC"],
  },
  {
    input: "Should I stop taking insurance and switch to a cash-pay model?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "VDD",
    expectedModifiers: ["HC"],
  },
  {
    input: "Should I shift my practice from adult patients to kids?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "VDD",
    expectedModifiers: ["HC"],
  },
  // ── 3 × EDD (Exploratory Discovery Decisions) ────────────────────────
  {
    input: "Where should I start using AI in my practice?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "EDD",
  },
  {
    input: "What kind of CME path would best fit my career arc?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "EDD",
  },
  {
    input: "I want to modernize my practice but I'm not sure what to change first.",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "EDD",
  },
  // ── 3 × TCLD (Time-Critical / Low-Data) ──────────────────────────────
  {
    input: "I have an urgent referral that just came in — should I take it today?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "TCLD",
  },
  {
    input: "A patient just no-showed and I have a 30-min window — should I work in a same-day or do paperwork?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "TCLD",
  },
  {
    input: "Quick — should I call this patient back tonight or wait until morning?",
    expectedEpistemic: "decision_analysis",
    expectedStructural: "TCLD",
  },
];

// Out-of-scope fixtures for the reframe path.
const OUT_OF_SCOPE_FIXTURES: Array<{
  input: string;
  expectedEpistemic: "diagnostic" | "predictive" | "optimization";
}> = [
  // Type 2 — diagnostic
  {
    input: "Why did my no-show rate jump in March?",
    expectedEpistemic: "diagnostic",
  },
  // Type 3 — predictive
  {
    input: "What will Q3 revenue look like if I don't change anything?",
    expectedEpistemic: "predictive",
  },
  // Type 5 — optimization
  {
    input: "What's the optimal price across all three of my service tiers?",
    expectedEpistemic: "optimization",
  },
];

function mockClassifierFor(fixture: Fixture | { expectedEpistemic: string; expectedStructural?: string; expectedModifiers?: string[] }) {
  const epi = fixture.expectedEpistemic;
  const struct = "expectedStructural" in fixture && fixture.expectedStructural
    ? fixture.expectedStructural
    : "SED"; // safe default for out-of-scope cases
  const mods = ("expectedModifiers" in fixture && fixture.expectedModifiers) || [];
  return {
    answer: JSON.stringify({
      epistemicType: epi,
      structuralType: struct,
      modifiers: mods,
      rationale: `Mock classification for "${epi}/${struct}".`,
    }),
    reasoning: null,
    tokensIn: 50,
    tokensOut: 25,
  };
}

describe("F-11 / T-14 — PEDE Stage-0 classifier", () => {
  beforeEach(() => {
    vi.mocked(callStage).mockReset();
  });

  it("classifies all 12 SED/VDD/EDD/TCLD fixtures into valid (epistemic, structural) tuples", async () => {
    for (const f of FIXTURES) {
      vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
      const result = await runStage0Classifier(f.input);
      expect(EpistemicTypeSchema.safeParse(result.classification.epistemicType).success).toBe(true);
      expect(StructuralTypeSchema.safeParse(result.classification.structuralType).success).toBe(true);
      expect(result.classification.epistemicType).toBe(f.expectedEpistemic);
      expect(result.classification.structuralType).toBe(f.expectedStructural);
    }
  });

  it("output validates against canonical DecisionTypeSchema", async () => {
    vi.mocked(callStage).mockResolvedValue(mockClassifierFor(FIXTURES[0]!));
    const result = await runStage0Classifier(FIXTURES[0]!.input);
    expect(DecisionTypeSchema.safeParse(result.classification).success).toBe(true);
  });

  it("same input → same classification across 5 repeats (T-14 determinism)", async () => {
    const f = FIXTURES[3]!; // a VDD fixture
    const fingerprint = (r: Awaited<ReturnType<typeof runStage0Classifier>>) =>
      `${r.classification.epistemicType}|${r.classification.structuralType}|${[...r.classification.modifiers].sort().join(",")}`;

    const runs: string[] = [];
    for (let i = 0; i < 5; i++) {
      vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
      const r = await runStage0Classifier(f.input);
      runs.push(fingerprint(r));
    }
    const fp0 = runs[0]!;
    for (const fp of runs.slice(1)) {
      expect(fp).toBe(fp0);
    }
  });

  it("Type-2 (diagnostic) input triggers decline-and-reframe", async () => {
    const f = OUT_OF_SCOPE_FIXTURES[0]!;
    vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
    const result = await runStage0Classifier(f.input);
    expect(result.classification.epistemicType).toBe("diagnostic");
    expect(shouldDeclineAndReframe(result.classification)).toBe(true);
  });

  it("Type-3 (predictive) input triggers decline-and-reframe", async () => {
    const f = OUT_OF_SCOPE_FIXTURES[1]!;
    vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
    const result = await runStage0Classifier(f.input);
    expect(result.classification.epistemicType).toBe("predictive");
    expect(shouldDeclineAndReframe(result.classification)).toBe(true);
  });

  it("Type-5 (optimization) input triggers decline-and-reframe", async () => {
    const f = OUT_OF_SCOPE_FIXTURES[2]!;
    vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
    const result = await runStage0Classifier(f.input);
    expect(result.classification.epistemicType).toBe("optimization");
    expect(shouldDeclineAndReframe(result.classification)).toBe(true);
  });

  it("VDD inputs are flagged via isVdd() (no-rank-output contract)", async () => {
    const vddFixtures = FIXTURES.filter((f) => f.expectedStructural === "VDD");
    for (const f of vddFixtures) {
      vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
      const result = await runStage0Classifier(f.input);
      expect(isVdd(result.classification)).toBe(true);
    }
  });

  it("Type-4/SED inputs are NOT flagged for reframe or VDD strip", async () => {
    const sedFixtures = FIXTURES.filter((f) => f.expectedStructural === "SED");
    for (const f of sedFixtures) {
      vi.mocked(callStage).mockResolvedValueOnce(mockClassifierFor(f));
      const result = await runStage0Classifier(f.input);
      expect(shouldDeclineAndReframe(result.classification)).toBe(false);
      expect(isVdd(result.classification)).toBe(false);
    }
  });

  it("empty input returns a SED default without calling the LLM", async () => {
    const result = await runStage0Classifier("");
    expect(vi.mocked(callStage)).not.toHaveBeenCalled();
    expect(result.classification.epistemicType).toBe("decision_analysis");
    expect(result.classification.structuralType).toBe("SED");
  });

  it("unparseable LLM output falls back to SED default", async () => {
    vi.mocked(callStage).mockResolvedValueOnce({
      answer: "not json",
      reasoning: null,
      tokensIn: 10,
      tokensOut: 5,
    });
    const result = await runStage0Classifier("Should I do X?");
    expect(result.classification.epistemicType).toBe("decision_analysis");
    expect(result.classification.structuralType).toBe("SED");
    expect(shouldDeclineAndReframe(result.classification)).toBe(false);
  });

  it("reframeMessageFor() returns non-empty reply + chips for every reframe epistemic", () => {
    for (const epi of ["diagnostic", "predictive", "optimization", "descriptive", "sequential"] as const) {
      const m = reframeMessageFor({
        epistemicType: epi,
        structuralType: "SED",
        modifiers: [],
        rationale: "test",
      });
      expect(m.reply.length).toBeGreaterThan(20);
      expect(m.chips.length).toBeGreaterThanOrEqual(2);
      for (const chip of m.chips) {
        expect(chip.length).toBeGreaterThan(0);
      }
    }
  });
});
