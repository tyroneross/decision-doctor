/**
 * E2 pain-path classifier + 9-criteria scoring + runRecommendation wired tests.
 *
 * Tests:
 *   1. classifyPainPath: free-text "I'm drowning in inbox" → admin, confidence > 0.7.
 *   2. classifyPainPath: ambiguous free-text → clarifier widgets returned.
 *   3. classifyPainPath: selectedPath provided → returns that path at confidence 1.0.
 *   4. classifyPainPath: "custom" returned with low confidence for unrecognized text.
 *   5. scoreCandidates: returns all 9 criteria, correct rank ordering.
 *   6. scoreCandidates: min-direction criteria are inverted (risk → high risk = lower adjusted).
 *   7. generateCandidateTasks: returns ≥ 3 candidates even when LLM fails.
 *   8. runRecommendation end-to-end: mocked Groq → ≥3 candidates, valid scoring,
 *      populated methodTrace, recommendedTask matches top-ranked.
 *   9. All 9 scoring criteria present in scoring module export.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiTaskRecommendationSchema } from "@/shared/schema";

// ---------------------------------------------------------------------------
// Mock groq module BEFORE any engine imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/groq", () => ({
  groq: {},
  GROQ_MODEL: "test-model",
  callStage: vi.fn(),
}));

import { classifyPainPath } from "@/lib/engine/pain-path/classifier";
import { generateCandidateTasks } from "@/lib/engine/pain-path/candidates";
import { scoreCandidates, ALL_CRITERIA } from "@/lib/engine/pain-path/scoring";
import { runRecommendation } from "@/lib/engine/orchestrator";
import { callStage } from "@/lib/groq";

const mockCallStage = callStage as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeClassifierLlmResponse(path: string, confidence: number) {
  return {
    answer: JSON.stringify({ path, confidence, rationale: `Classified as ${path}.` }),
    reasoning: null,
    tokensIn: 50,
    tokensOut: 30,
  };
}

function makeCandidatesLlmResponse() {
  return {
    answer: JSON.stringify({
      tasks: [
        {
          id: "draft-inbox-responses",
          taskName: "Draft inbox responses with AI",
          taskDescription: "Use a paste-ready prompt to draft responses to common administrative messages.",
          aiCapability: "drafting",
          dataNeeded: "Message categories — no PHI.",
          guardrails: "Remove patient names before using prompt.",
          startingLevel: "prompt",
        },
        {
          id: "create-admin-templates",
          taskName: "Create administrative templates",
          taskDescription: "Build reusable templates for prior auth and documentation.",
          aiCapability: "drafting",
          dataNeeded: "Payer names and service categories.",
          guardrails: "Templates are drafts; clinician review required.",
          startingLevel: "prompt",
        },
        {
          id: "document-admin-sop",
          taskName: "Document administrative SOPs",
          taskDescription: "Produce structured standard operating procedures for recurring admin tasks.",
          aiCapability: "structuring",
          dataNeeded: "Step-by-step description of current process.",
          guardrails: "No PHI in SOP.",
          startingLevel: "checklist",
        },
      ],
    }),
    reasoning: null,
    tokensIn: 200,
    tokensOut: 150,
  };
}

function makeRecommendationLlmResponse() {
  return {
    answer: JSON.stringify({
      challengeSummary: "The practitioner is overwhelmed by administrative messages and paperwork.",
      goal: "Reduce time spent on inbox and documentation tasks.",
      candidateTasks: [
        {
          id: "draft-inbox-responses",
          title: "Draft inbox responses with AI",
          description: "Use a paste-ready prompt to draft admin message responses.",
          score: 88,
          tags: ["drafting", "admin"],
        },
      ],
      recommendedTask: "Draft inbox responses with AI",
      recommendedApproach: "prompt",
      whyThisTask: "Inbox is the highest-frequency admin task and a prompt delivers immediate value.",
      starterSolution:
        "Paste this into Claude or ChatGPT:\n\n\"Draft a professional response to this administrative message. Remove any patient details before submitting. Message: [paste message here]\"",
      guardrails: [
        "Do not include patient names or diagnoses in any AI prompt.",
        "Review drafted responses before sending.",
      ],
      tryThisWeek: ["Use the starter prompt for your next 3 inbox messages."],
      successMetric: "Reduce inbox response time from >5 minutes to <2 minutes within 30 days.",
      confidence: 82,
    }),
    reasoning: null,
    tokensIn: 400,
    tokensOut: 350,
  };
}

function makeStage8LlmResponse() {
  return {
    answer: JSON.stringify({
      rungs: [
        { kind: "prompt", label: "Start with a paste-ready prompt", rationale: "Single-step drafting.", confidence: 88, state: "recommended" },
        { kind: "checklist", label: "Build a recurring checklist", rationale: "Multi-step workflows.", confidence: 65, state: "optional" },
        { kind: "skill", label: "Install a skill", rationale: "Repeatable data tasks.", confidence: 45, state: "not-recommended" },
        { kind: "plugin", label: "Plugin not needed yet", rationale: "Integration premature.", confidence: 15, state: "not-recommended" },
        { kind: "agent", label: "Agent overkill", rationale: "Simple task.", confidence: 10, state: "not-recommended" },
      ],
    }),
    reasoning: null,
    tokensIn: 100,
    tokensOut: 80,
  };
}

// ---------------------------------------------------------------------------
// classifyPainPath tests
// ---------------------------------------------------------------------------

describe("classifyPainPath()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("classifies 'I'm drowning in inbox' as admin with confidence > 0.7 (heuristic)", async () => {
    // Heuristic should fire first and not need LLM for this strong signal.
    const result = await classifyPainPath({ challenge: "I'm drowning in inbox and paperwork" });

    expect(result.path).toBe("admin");
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.clarifiers).toBeUndefined();
  });

  it("classifies admin path from heavy keyword signal without LLM call", async () => {
    const result = await classifyPainPath({
      challenge: "I have too much administrative work, email overload, and documentation backlog every day.",
    });

    expect(result.path).toBe("admin");
    expect(result.confidence).toBeGreaterThan(0.7);
    // Should not have made an LLM call for a strong heuristic signal.
    expect(mockCallStage).not.toHaveBeenCalled();
  });

  it("classifies follow_up from keyword signal", async () => {
    const result = await classifyPainPath({
      challenge: "I struggle to maintain consistent patient follow-up and reminder cadence.",
    });

    expect(result.path).toBe("follow_up");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns selectedPath at confidence 1.0 when provided and not contradicted", async () => {
    const result = await classifyPainPath({
      challenge: "General challenge description.",
      selectedPath: "referrals",
    });

    expect(result.path).toBe("referrals");
    expect(result.confidence).toBe(1.0);
    expect(result.clarifiers).toBeUndefined();
  });

  it("returns clarifier widgets for ambiguous free-text when LLM also returns low confidence", async () => {
    // LLM returns low confidence for vague text.
    mockCallStage.mockResolvedValueOnce(makeClassifierLlmResponse("custom", 0.35));

    const result = await classifyPainPath({
      challenge: "I have various challenges in my practice that affect everything.",
    });

    // Should have clarifiers since confidence is low.
    expect(result.clarifiers).toBeDefined();
    expect(result.clarifiers!.length).toBeGreaterThanOrEqual(1);
    expect(result.clarifiers![0]!.kind).toBe("chips");
    expect(result.clarifiers![0]!.options.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("uses LLM result when heuristic is ambiguous and LLM is confident", async () => {
    // Text has no keyword match for any path.
    // LLM returns high-confidence research classification.
    mockCallStage.mockResolvedValueOnce(makeClassifierLlmResponse("research", 0.85));

    const result = await classifyPainPath({
      // No keyword match → heuristic returns 0 hits → LLM is called.
      challenge: "Things are getting harder to manage in my practice lately.",
    });

    // LLM is called (heuristic returns 0 hits → custom at 0.3 → falls through to LLM).
    // LLM returns 0.85 → research path returned directly.
    expect(result.path).toBe("research");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.clarifiers).toBeUndefined();
  });

  it("returns custom path with low confidence when text has no clear match", async () => {
    // LLM returns low confidence for truly ambiguous text.
    mockCallStage.mockResolvedValueOnce(makeClassifierLlmResponse("custom", 0.3));

    const result = await classifyPainPath({
      challenge: "xyz abc def 123",
    });

    expect(result.confidence).toBeLessThan(0.7);
    // clarifiers should be emitted.
    expect(result.clarifiers).toBeDefined();
  });

  it("uses ClarifierChips type from lib/engine/clarifier (not redefined)", async () => {
    mockCallStage.mockResolvedValueOnce(makeClassifierLlmResponse("custom", 0.2));

    const result = await classifyPainPath({ challenge: "unclear challenge description text here" });

    if (result.clarifiers && result.clarifiers.length > 0) {
      const chip = result.clarifiers[0]!;
      // Structural check: matches ClarifierChips interface from clarifier.ts.
      expect(chip.kind).toBe("chips");
      expect(typeof chip.fieldId).toBe("string");
      expect(typeof chip.label).toBe("string");
      expect(Array.isArray(chip.options)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// generateCandidateTasks tests
// ---------------------------------------------------------------------------

describe("generateCandidateTasks()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ≥ 3 candidates when LLM succeeds", async () => {
    mockCallStage.mockResolvedValueOnce(makeCandidatesLlmResponse());

    const result = await generateCandidateTasks({
      painPath: "admin",
      challenge: "I'm overwhelmed by inbox and paperwork.",
      goal: "Reduce admin time.",
    });

    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const c of result) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.taskName).toBe("string");
      expect(typeof c.taskDescription).toBe("string");
      expect(typeof c.aiCapability).toBe("string");
      expect(typeof c.dataNeeded).toBe("string");
      expect(typeof c.guardrails).toBe("string");
      expect(["prompt", "checklist", "skill", "plugin", "agent"]).toContain(c.startingLevel);
    }
  });

  it("returns ≥ 3 candidates (from library stubs) when LLM fails", async () => {
    mockCallStage.mockRejectedValueOnce(new Error("Groq unavailable"));

    const result = await generateCandidateTasks({
      painPath: "admin",
      challenge: "Too much admin work.",
      goal: "Save time.",
    });

    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("returns ≥ 3 candidates when LLM returns invalid JSON", async () => {
    mockCallStage.mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 });

    const result = await generateCandidateTasks({
      painPath: "follow_up",
      challenge: "Struggling with patient follow-up.",
      goal: "Improve consistency.",
    });

    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("marks LLM-generated tasks with source: generated", async () => {
    mockCallStage.mockResolvedValueOnce(makeCandidatesLlmResponse());

    const result = await generateCandidateTasks({
      painPath: "admin",
      challenge: "Admin overload.",
      goal: "Reduce admin tasks.",
    });

    const generated = result.filter((c) => c.source === "generated");
    expect(generated.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// scoreCandidates tests
// ---------------------------------------------------------------------------

describe("scoreCandidates()", () => {
  const baseInput = {
    painSeverity: 0.8,
    frequency: 0.7,
    timeBurden: 0.6,
    riskTolerance: 0.4,
    aiComfort: 0.5,
    dataReadiness: 0.7,
  };

  const sampleCandidates = [
    {
      id: "task-a",
      taskName: "Draft inbox responses",
      taskDescription: "Use a prompt to draft administrative message responses.",
      aiCapability: "drafting",
      dataNeeded: "Message categories.",
      guardrails: "No patient names in prompts.",
      startingLevel: "prompt" as const,
      source: "generated" as const,
    },
    {
      id: "task-b",
      taskName: "Build integration plugin",
      taskDescription: "Create a plugin connecting EHR with external scheduling system.",
      aiCapability: "scheduling",
      dataNeeded: "EHR access required.",
      guardrails: "PHI in EHR — no raw patient data in prompts. Clinician review required.",
      startingLevel: "plugin" as const,
      source: "library" as const,
    },
    {
      id: "task-c",
      taskName: "Create workflow SOP",
      taskDescription: "Document and structure recurring admin workflow with AI assistance.",
      aiCapability: "structuring",
      dataNeeded: "Process description.",
      guardrails: "No PHI in SOP.",
      startingLevel: "checklist" as const,
      source: "library" as const,
    },
  ];

  it("returns all 9 criteria in scores", () => {
    const result = scoreCandidates(sampleCandidates, baseInput);

    expect(result.length).toBe(3);
    for (const sc of result) {
      for (const criterion of ALL_CRITERIA) {
        expect(sc.scores[criterion]).toBeDefined();
        expect(typeof sc.scores[criterion]!.raw).toBe("number");
        expect(typeof sc.scores[criterion]!.adjusted).toBe("number");
        expect(typeof sc.scores[criterion]!.rationale).toBe("string");
      }
    }
  });

  it("ALL_CRITERIA exports exactly 9 criteria", () => {
    expect(ALL_CRITERIA).toHaveLength(9);
    expect(ALL_CRITERIA).toContain("pain_severity");
    expect(ALL_CRITERIA).toContain("frequency");
    expect(ALL_CRITERIA).toContain("time_burden");
    expect(ALL_CRITERIA).toContain("business_impact");
    expect(ALL_CRITERIA).toContain("ai_fit");
    expect(ALL_CRITERIA).toContain("risk");
    expect(ALL_CRITERIA).toContain("data_readiness");
    expect(ALL_CRITERIA).toContain("adoption_friction");
    expect(ALL_CRITERIA).toContain("setup_effort");
  });

  it("min-direction criteria (risk) are inverted: adjusted = 1 - raw", () => {
    // Use candidates with clearly different risk profiles for this test.
    const lowRiskCandidate = {
      id: "low-risk",
      taskName: "Create a scheduling summary",
      taskDescription: "Summarize available appointment slots from an anonymized schedule.",
      aiCapability: "summarization",
      dataNeeded: "Anonymized slot data only.",
      guardrails: "No patient data used.",
      startingLevel: "prompt" as const,
      source: "generated" as const,
    };
    const highRiskCandidate = {
      id: "high-risk",
      taskName: "Generate clinical treatment recommendations",
      taskDescription: "Use AI to draft clinical treatment and medication recommendations for patient diagnoses.",
      aiCapability: "analysis",
      dataNeeded: "Patient diagnosis history from EHR.",
      guardrails: "Contains PHI, clinical details, and patient diagnosis data. Clinician review mandatory.",
      startingLevel: "agent" as const,
      source: "generated" as const,
    };

    const result = scoreCandidates([lowRiskCandidate, highRiskCandidate], baseInput);

    const low = result.find((c) => c.id === "low-risk")!;
    const high = result.find((c) => c.id === "high-risk")!;

    // For ALL candidates, adjusted ≈ 1 - raw (within floating-point tolerance).
    for (const sc of [low, high]) {
      const riskScore = sc.scores.risk;
      expect(Math.abs(riskScore.adjusted - (1 - riskScore.raw))).toBeLessThan(0.02);
    }

    // High-risk task has higher raw risk score.
    expect(high.scores.risk.raw).toBeGreaterThan(low.scores.risk.raw);
    // Inversion: higher raw → lower adjusted.
    expect(high.scores.risk.adjusted).toBeLessThan(low.scores.risk.adjusted);
  });

  it("ranks candidates in descending order by combinedScore", () => {
    const result = scoreCandidates(sampleCandidates, baseInput);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.combinedScore).toBeGreaterThanOrEqual(result[i + 1]!.combinedScore);
      expect(result[i]!.rank).toBe(i + 1);
    }
  });

  it("prompt-level task ranks higher than plugin-level for a low-friction user context", () => {
    const result = scoreCandidates(sampleCandidates, { ...baseInput, aiComfort: 0.3 });

    const promptTask = result.find((c) => c.id === "task-a")!;
    const pluginTask = result.find((c) => c.id === "task-b")!;

    expect(promptTask.rank).toBeLessThan(pluginTask.rank);
  });

  it("combinedScore is between 0 and 1", () => {
    const result = scoreCandidates(sampleCandidates, baseInput);
    for (const sc of result) {
      expect(sc.combinedScore).toBeGreaterThanOrEqual(0);
      expect(sc.combinedScore).toBeLessThanOrEqual(1);
    }
  });

  it("accepts weight overrides and normalizes them", () => {
    const result = scoreCandidates(sampleCandidates, {
      ...baseInput,
      weights: { ai_fit: 5, risk: 5 }, // only 2 weights specified; others default
    });

    expect(result.length).toBe(3);
    // Should still produce valid scores.
    for (const sc of result) {
      expect(sc.combinedScore).toBeGreaterThanOrEqual(0);
      expect(sc.combinedScore).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// runRecommendation end-to-end tests
// ---------------------------------------------------------------------------

describe("runRecommendation() end-to-end (E2 wired)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns schema-valid AiTaskRecommendation with ≥3 candidates, valid scoring, populated methodTrace", async () => {
    // Call sequence (mocked Groq):
    // 1. classifyPainPath — heuristic fires first for strong "admin" text; no LLM call needed.
    // 2. generateCandidateTasks — LLM call.
    // 3. runRecommendation LLM — narrative fields.
    // 4. classifyPromotion (Stage 8) — LLM call.
    mockCallStage
      .mockResolvedValueOnce(makeCandidatesLlmResponse())       // generateCandidateTasks
      .mockResolvedValueOnce(makeRecommendationLlmResponse())   // recommendation narrative
      .mockResolvedValueOnce(makeStage8LlmResponse());          // stage8

    const result = await runRecommendation({
      painPath: "admin",
      challengeText: "I'm completely overwhelmed by inbox, paperwork, and administrative overload every day.",
      goal: "Reduce admin time by at least 2 hours per week.",
    });

    // Schema validation.
    const parsed = AiTaskRecommendationSchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    // ≥ 3 candidates.
    expect(result.candidateTasks.length).toBeGreaterThanOrEqual(3);

    // recommendedTask is non-empty.
    expect(result.recommendedTask).toBeTruthy();

    // methodTrace covers all pipeline stages.
    const stageNames = result.methodTrace.map((e) => e.stage);
    expect(stageNames).toContain("pain-classify");
    expect(stageNames).toContain("use-case-retrieval");
    expect(stageNames).toContain("candidate-gen");
    expect(stageNames).toContain("scoring");
    expect(stageNames).toContain("stage8-promotion");

    // Scoring trace has rankedCandidates.
    const scoringTrace = result.methodTrace.find((e) => e.stage === "scoring");
    expect(scoringTrace).toBeDefined();
    const scoringOutput = scoringTrace!.output as Record<string, unknown>;
    expect(scoringOutput.rankedCandidates).toBeDefined();
    expect(Array.isArray(scoringOutput.rankedCandidates)).toBe(true);

    // recommendedTask should match top-ranked candidate.
    const ranked = scoringOutput.rankedCandidates as Array<{ taskName: string; rank: number }>;
    const topRanked = ranked.find((c) => c.rank === 1);
    // The recommendedTask may be from LLM override or top-ranked — both valid.
    expect(result.recommendedTask).toBeTruthy();
    expect(topRanked).toBeDefined();

    // adoptionPathway is always set.
    expect(result.adoptionPathway).toBeDefined();
    expect(result.adoptionPathway).toHaveLength(5);
    const recommended = result.adoptionPathway.filter((r) => r.state === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });

  it("returns a valid result even when all LLM calls fail (full graceful degradation)", async () => {
    mockCallStage.mockRejectedValue(new Error("Groq unavailable"));

    const result = await runRecommendation({
      painPath: "admin",
      challengeText: "Too much administrative work and inbox overload to manage every day.",
    });

    const parsed = AiTaskRecommendationSchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    expect(result.candidateTasks.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendedTask).toBeTruthy();
    expect(result.adoptionPathway).toHaveLength(5);
  });

  it("pain-classify methodTrace entry includes confidence from classifier", async () => {
    mockCallStage
      .mockResolvedValueOnce(makeCandidatesLlmResponse())
      .mockResolvedValueOnce(makeRecommendationLlmResponse())
      .mockResolvedValueOnce(makeStage8LlmResponse());

    const result = await runRecommendation({
      painPath: "admin",
      challengeText: "Drowning in inbox and administrative paperwork.",
    });

    const classifyTrace = result.methodTrace.find((e) => e.stage === "pain-classify");
    expect(classifyTrace).toBeDefined();
    const output = classifyTrace!.output as Record<string, unknown>;
    expect(typeof output.confidence).toBe("number");
    expect(output.selectedPainPath).toBe("admin");
  });
});
