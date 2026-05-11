/**
 * Stage 8 promotion classifier + runRecommendation() smoke tests.
 *
 * Tests:
 *   1. classifyPromotion() returns schema-valid AdoptionPathway with at least
 *      1 "recommended" rung on a drafting task (mocked Groq).
 *   2. classifyPromotion() heuristic fallback returns a "recommended" rung
 *      when LLM is forced to fail.
 *   3. runRecommendation() returns schema-valid AiTaskRecommendation end-to-end
 *      (both Groq calls mocked).
 *   4. Stage 8 seed payloads are typed server-side (no client construction needed).
 *
 * Groq is mocked via vi.mock — no live API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdoptionPathwaySchema, AiTaskRecommendationSchema } from "@/shared/schema";

// ---------------------------------------------------------------------------
// Mock groq module BEFORE any engine imports so the mock is in place when
// stage8-promotion.ts and orchestrator.ts load.
// ---------------------------------------------------------------------------

vi.mock("@/lib/groq", () => ({
  groq: {},
  GROQ_MODEL: "test-model",
  callStage: vi.fn(),
}));

import { classifyPromotion } from "@/lib/engine/stage8-promotion";
import { runRecommendation } from "@/lib/engine/orchestrator";
import { callStage } from "@/lib/groq";

const mockCallStage = callStage as ReturnType<typeof vi.fn>;

// Valid Stage 8 LLM response fixture.
function makeStage8LlmResponse(overrides: Partial<Record<string, unknown>> = {}) {
  const rungs = [
    {
      kind: "prompt",
      label: "Start with a paste-ready drafting prompt",
      rationale: "Single-step drafting tasks are best served by a paste-ready prompt.",
      confidence: 88,
      state: "recommended",
    },
    {
      kind: "checklist",
      label: "Build a follow-up checklist",
      rationale: "A checklist ensures consistency across recurring follow-up batches.",
      confidence: 70,
      state: "optional",
    },
    {
      kind: "skill",
      label: "Install a batch-email skill",
      rationale: "A skill adds value if you send follow-ups more than 3x per week.",
      confidence: 55,
      state: "optional",
    },
    {
      kind: "plugin",
      label: "Plugin not needed yet",
      rationale: "Integration with external systems is premature at this stage.",
      confidence: 20,
      state: "not-recommended",
    },
    {
      kind: "agent",
      label: "Agent overkill for this task",
      rationale: "Email drafting is a single-step task — an agent would over-engineer.",
      confidence: 10,
      state: "not-recommended",
    },
  ];
  return { answer: JSON.stringify({ rungs, ...overrides }), reasoning: null, tokensIn: 100, tokensOut: 80 };
}

// Valid recommendation LLM response fixture.
function makeRecommendationLlmResponse() {
  return {
    answer: JSON.stringify({
      challengeSummary:
        "The practitioner spends significant time drafting follow-up emails after each appointment.",
      goal: "Reduce time spent on follow-up emails by using AI drafting assistance.",
      candidateTasks: [
        {
          id: "draft-patient-follow-up-emails",
          title: "Draft patient follow-up emails",
          description:
            "Use a paste-ready AI prompt to draft personalized follow-up emails after appointments.",
          score: 90,
          tags: ["email", "drafting", "follow_up"],
        },
        {
          id: "create-follow-up-template-library",
          title: "Create a follow-up template library",
          description:
            "Build a library of reusable email templates for common follow-up scenarios.",
          score: 72,
          tags: ["template", "follow_up"],
        },
      ],
      recommendedTask: "Draft patient follow-up emails",
      recommendedApproach: "prompt",
      whyThisTask:
        "Email drafting is the highest-frequency follow-up task and a paste-ready prompt immediately reduces time spent per email without requiring any new tools.",
      starterSolution:
        "Paste this into Claude or ChatGPT:\n\n\"Draft a brief, warm follow-up email for a patient I saw today for [visit reason]. Include a reminder about [next step]. Keep it under 80 words, professional but personable. Do not include any patient identifiers.\"",
      guardrails: [
        "Do not include patient names, diagnoses, or MRN numbers in any AI prompt.",
        "Review AI-generated emails before sending — clinician review required for clinical content.",
      ],
      tryThisWeek: [
        "Use the starter prompt for your next 3 follow-up emails.",
        "Note how long each email takes compared to writing from scratch.",
      ],
      successMetric:
        "Reduce average follow-up email drafting time from >5 minutes to <2 minutes within 30 days.",
      confidence: 82,
    }),
    reasoning: null,
    tokensIn: 400,
    tokensOut: 350,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifyPromotion()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a schema-valid AdoptionPathway with at least 1 recommended rung (LLM path)", async () => {
    mockCallStage.mockResolvedValueOnce(makeStage8LlmResponse());

    const result = await classifyPromotion({
      task: "Draft patient follow-up emails",
      taskDescription: "Use AI to draft personalized follow-up emails after appointments.",
      painPath: "follow_up",
      scoring: { confidence: 82, rationale: "High-frequency single-step drafting task." },
    });

    // Must parse against the Zod schema.
    const parsed = AdoptionPathwaySchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    // Must have exactly 5 rungs.
    expect(result).toHaveLength(5);

    // At least 1 recommended.
    const recommended = result.filter((r) => r.state === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);

    // Rung order: prompt, checklist, skill, plugin, agent.
    const kinds = result.map((r) => r.kind);
    expect(kinds).toEqual(["prompt", "checklist", "skill", "plugin", "agent"]);

    // Seeds present and server-typed.
    for (const rung of result) {
      expect(rung.builderHandoff.seed).toBeDefined();
      expect(rung.builderHandoff.seed.builderKind).toBe(rung.kind === "checklist" ? "checklist" : rung.kind);
    }
  });

  it("falls back to heuristics and still returns recommended rung when LLM fails", async () => {
    mockCallStage.mockRejectedValueOnce(new Error("Groq unavailable"));

    const result = await classifyPromotion({
      task: "Draft patient follow-up emails",
      painPath: "follow_up",
      scoring: { confidence: 75, rationale: "Drafting task." },
    });

    const parsed = AdoptionPathwaySchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    const recommended = result.filter((r) => r.state === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });

  it("heuristic returns prompt as recommended for a drafting task", async () => {
    // Force heuristic path: LLM returns invalid JSON.
    mockCallStage.mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 });

    const result = await classifyPromotion({
      task: "Draft patient follow-up emails",
      painPath: "follow_up",
      scoring: { confidence: 80, rationale: "Drafting task." },
    });

    const promptRung = result.find((r) => r.kind === "prompt");
    expect(promptRung).toBeDefined();
    expect(promptRung!.state).toBe("recommended");
  });

  it("heuristic returns checklist as recommended for a workflow task", async () => {
    mockCallStage.mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 });

    const result = await classifyPromotion({
      task: "Run a weekly patient outreach workflow",
      taskDescription: "Multi-step recurring procedure for patient outreach.",
      painPath: "admin",
      scoring: { confidence: 70, rationale: "Multi-step recurring workflow." },
    });

    const checklistRung = result.find((r) => r.kind === "checklist");
    expect(checklistRung).toBeDefined();
    expect(checklistRung!.state).toBe("recommended");
  });

  it("heuristic downgrades complex rungs when confidence is low", async () => {
    mockCallStage.mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 });

    const result = await classifyPromotion({
      task: "Draft follow-up emails",
      painPath: "follow_up",
      scoring: { confidence: 30, rationale: "Low confidence due to ambiguous intake." },
    });

    const pluginRung = result.find((r) => r.kind === "plugin");
    const agentRung = result.find((r) => r.kind === "agent");
    expect(pluginRung!.state).toBe("not-recommended");
    expect(agentRung!.state).toBe("not-recommended");

    // Must still have at least 1 recommended.
    const recommended = result.filter((r) => r.state === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runRecommendation()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a schema-valid AiTaskRecommendation on a hand-crafted input", async () => {
    // First callStage = recommendation LLM call; second = Stage 8 LLM call.
    mockCallStage
      .mockResolvedValueOnce(makeRecommendationLlmResponse())
      .mockResolvedValueOnce(makeStage8LlmResponse());

    const result = await runRecommendation({
      painPath: "follow_up",
      challengeText:
        "I spend 30-45 minutes after every session drafting follow-up emails. I see 20 patients a week.",
      goal: "Reduce time spent on follow-up emails to under 5 minutes per patient.",
    });

    const parsed = AiTaskRecommendationSchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    // Core fields present.
    expect(result.selectedPainPath).toBe("follow_up");
    expect(result.candidateTasks.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendedTask).toBeTruthy();
    expect(result.starterSolution).toBeTruthy();
    expect(result.guardrails.length).toBeGreaterThanOrEqual(1);
    expect(result.tryThisWeek.length).toBeGreaterThanOrEqual(1);
    expect(result.successMetric).toBeTruthy();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);

    // adoptionPathway is always set, never null.
    expect(result.adoptionPathway).toBeDefined();
    expect(result.adoptionPathway).toHaveLength(5);

    // methodTrace covers all pipeline stages.
    const stageNames = result.methodTrace.map((e) => e.stage);
    expect(stageNames).toContain("pain-classify");
    expect(stageNames).toContain("use-case-retrieval");
    expect(stageNames).toContain("candidate-gen");
    expect(stageNames).toContain("scoring");
    expect(stageNames).toContain("stage8-promotion");
  });

  it("gracefully degrades when the recommendation LLM call returns invalid JSON", async () => {
    // Recommendation call returns garbage; Stage 8 also fails.
    mockCallStage
      .mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 })
      .mockResolvedValueOnce({ answer: "not-json", reasoning: null, tokensIn: 0, tokensOut: 0 });

    const result = await runRecommendation({
      painPath: "admin",
      challengeText: "I spend too much time on administrative tasks every week.",
    });

    // Even on full degradation, output must still be schema-valid.
    const parsed = AiTaskRecommendationSchema.safeParse(result);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

    // adoptionPathway must still contain at least 1 recommended rung.
    const recommended = result.adoptionPathway.filter((r) => r.state === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });

  it("exports both runDecision and runRecommendation from orchestrator", async () => {
    const orchestrator = await import("@/lib/engine/orchestrator");
    expect(typeof orchestrator.runDecision).toBe("function");
    expect(typeof orchestrator.runRecommendation).toBe("function");
  });
});

describe("AdoptionPathwaySchema export", () => {
  it("is exported from shared/schema.ts", () => {
    expect(AdoptionPathwaySchema).toBeDefined();
    expect(typeof AdoptionPathwaySchema.parse).toBe("function");
  });
});

describe("AiTaskRecommendationSchema export", () => {
  it("is exported from shared/schema.ts", () => {
    expect(AiTaskRecommendationSchema).toBeDefined();
    expect(typeof AiTaskRecommendationSchema.parse).toBe("function");
  });
});
