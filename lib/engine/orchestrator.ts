// PRD §6.2 — Decision engine orchestrator.
// Chains Stages 1-5; assembles the DecisionOutput contract.
//
// V2 peer: runRecommendation() — pain-to-AI recommendation engine.
// Chains: pain-path classify (E2) → use-case retrieval (E2/L2) →
//         candidate gen → scoring → Stage 8 promotion.
// V1 runDecision() is untouched.

import "server-only";
import type { DecisionInput, DecisionOutput } from "@/shared/schema";
import { loadTemplate } from "@/lib/engine/templates";
import { runStage1Values } from "@/lib/engine/stage1-values";
import { runStage1bAhp } from "@/lib/engine/stage1b-ahp";
import { runStage2Constraints } from "@/lib/engine/stage2-constraints";
import { runStage3Weights } from "@/lib/engine/stage3-weights";
import { runStage4Outranking } from "@/lib/engine/stage4-outranking";
import { runStage5Ranking } from "@/lib/engine/stage5-ranking";
import { runStage6Feasibility } from "@/lib/engine/stage6-feasibility";
import { runStage7Scaffold } from "@/lib/engine/stage7-scaffold";
import type { TemplateId, AiTaskRecommendation } from "@/shared/schema";
import type { RecommendationInput } from "@/lib/engine/types";
import { classifyPromotion } from "@/lib/engine/stage8-promotion";
import { classifyPainPath } from "@/lib/engine/pain-path/classifier";
import { generateCandidateTasks } from "@/lib/engine/pain-path/candidates";
import { scoreCandidates } from "@/lib/engine/pain-path/scoring";
import { callStage } from "@/lib/groq";

export interface RunDecisionResult {
  output: Omit<DecisionOutput, "decisionId" | "decidedAt">;
  // Token counts reported to the audit log + rate limiter.
  // F-08 adds Stage 6 (feasibility classifier) — also LLM-driven.
  llmCalls: Array<{ stage: 1 | 5 | 6; tokensIn: number; tokensOut: number }>;
}

export async function runDecision(
  input: DecisionInput,
): Promise<RunDecisionResult> {
  const template = loadTemplate(input.templateId as TemplateId);
  // Token telemetry — populated by callStage()-using stages.
  const llmCalls: RunDecisionResult["llmCalls"] = [];

  // STAGE 1 / 1B (F-10): weight elicitation. Branch on input.weightSource.
  // Default ("llm" or omitted) uses Stage 1's LLM-driven path.
  // "ahp" uses user-supplied pairwise comparisons (Stage 1B). Both produce
  // a normalized weight map for Stage 3.
  const useAhp =
    input.weightSource === "ahp" &&
    !!input.ahpComparisons &&
    Object.keys(input.ahpComparisons).length > 0;

  let stage1Weights: Record<string, number>;
  let stage1Values: string[];
  let stage1Rationale: string;
  let stage1Reasoning: string | null;
  let weightSource: "llm" | "ahp" = "llm";
  let ahpResult: ReturnType<typeof runStage1bAhp> | null = null;

  if (useAhp) {
    // F-10: Stage 1B — deterministic eigenvector solve, no LLM call.
    const criterionIds = template.criteria.map((c) => c.id);
    ahpResult = runStage1bAhp({
      criterionIds,
      comparisons: input.ahpComparisons!,
    });
    stage1Weights = ahpResult.weights;
    stage1Values = []; // AHP doesn't extract values — user owns the weights directly.
    stage1Rationale = ahpResult.consistent
      ? `You set the weights yourself via pairwise comparison (Consistency Ratio ${(
          ahpResult.CR * 100
        ).toFixed(1)}%, within Saaty's 10% threshold).`
      : `You set the weights yourself; your comparisons show some inconsistency (CR ${(
          ahpResult.CR * 100
        ).toFixed(1)}%, above Saaty's 10% threshold). The math still proceeded but consider revising the flagged pair.`;
    stage1Reasoning = null;
    weightSource = "ahp";
  } else {
    const stage1 = await runStage1Values(input, template);
    llmCalls.push({
      stage: 1,
      tokensIn: stage1.tokensIn,
      tokensOut: stage1.tokensOut,
    });
    stage1Weights = stage1.adjustedWeights;
    stage1Values = stage1.values;
    stage1Rationale = stage1.rationale;
    stage1Reasoning = stage1.reasoning;
  }

  // STAGE 2: deterministic veto filtering.
  const stage2 = runStage2Constraints(template, input.fields as Record<string, unknown>);

  // STAGE 3: deterministic weight finalization.
  const stage3 = runStage3Weights(template, stage1Weights);

  // STAGE 4: ELECTRE-style outranking on stage2's surviving candidates.
  const stage4 = runStage4Outranking(stage2.filtered, stage3.weights);

  // STAGE 5: TOPSIS ranking + minimax-regret robust + LLM rationale + workloadReducers.
  const stage5 = await runStage5Ranking(
    template,
    stage4.dominant,
    stage3.weights,
    input,
    stage1Values,
  );
  llmCalls.push({
    stage: 5,
    tokensIn: stage5.tokensIn,
    tokensOut: stage5.tokensOut,
  });

  // STAGE 6 (F-08): AI-feasibility classification. LLM emits categorical
  // tiers + signals + rationale only; TS computes all numbers. Reducers are
  // then re-sorted by combinedScore descending so the highest-impact /
  // highest-feasibility reducer is first in the rendered list.
  const stage6 = await runStage6Feasibility(stage5.workloadReducers);
  llmCalls.push({
    stage: 6,
    tokensIn: stage6.tokensIn,
    tokensOut: stage6.tokensOut,
  });
  const rankedReducers = [...stage6.reducers].sort((a, b) => {
    const aScore = a.combinedScore ?? 0;
    const bScore = b.combinedScore ?? 0;
    return bScore - aScore;
  });

  // STAGE 7 (F-09): scaffold generation for reducers classified "skill" or
  // "plugin". Deterministic, no LLM call. Only fires when ≥1 reducer is in
  // the eligible tier — else the stage is a no-op that returns reducers
  // unchanged.
  const eligibleForScaffold = rankedReducers.some(
    (r) => r.aiFeasibility === "skill" || r.aiFeasibility === "plugin",
  );
  const stage7 = eligibleForScaffold
    ? runStage7Scaffold(rankedReducers)
    : { reducers: rankedReducers, generatedCount: 0 };

  // Assemble output. Alternatives = (Stage2 vetoes ∪ Stage4 outranked), excluding the top.
  const alternatives: DecisionOutput["alternatives"] = [];
  for (const e of stage2.eliminated) {
    const cand = template.candidates.find((c) => c.id === e.candidateId);
    if (!cand) continue;
    alternatives.push({
      option: cand.label,
      eliminatedAtStage: 2,
      reason: e.reason,
    });
  }
  for (const e of stage4.eliminated) {
    const cand = template.candidates.find((c) => c.id === e.candidateId);
    if (!cand) continue;
    alternatives.push({
      option: cand.label,
      eliminatedAtStage: 4,
      reason: e.reason,
    });
  }
  // T-03 requires ≥2 alternatives. If fewer, surface the runner-ups from
  // Stage 5's ranking (still informative, just not "eliminated").
  if (alternatives.length < 2) {
    for (const r of stage5.ranked.slice(1)) {
      if (alternatives.length >= 2) break;
      alternatives.push({
        option: r.candidate.label,
        eliminatedAtStage: 4,
        reason: `Lower TOPSIS closeness (${r.closeness.toFixed(2)}) than the recommendation.`,
      });
    }
  }

  const output: RunDecisionResult["output"] = {
    recommendation: {
      option: stage5.topCandidate.label,
      confidence: stage5.confidence,
      rationale: stage5.rationale,
    },
    alternatives,
    robustAlternative: {
      option: stage5.robustCandidate.label,
      why: stage5.robustWhy,
    },
    methodTrace: [
      // F-10: surface either Stage 1 (LLM) or Stage 1B (AHP) — never both —
      // so the methodTrace shows the actual elicitation path the user took.
      ...(useAhp && ahpResult
        ? ([
            {
              stage: "1B" as const,
              name: "ahp-weights" as const,
              output: {
                weights: ahpResult.weights,
                lambdaMax: Number(ahpResult.lambdaMax.toFixed(6)),
                CI: Number(ahpResult.CI.toFixed(6)),
                CR: Number(ahpResult.CR.toFixed(6)),
                consistent: ahpResult.consistent,
                worstPair: ahpResult.worstPair,
                rationale: stage1Rationale,
              },
            },
          ] as const)
        : ([
            {
              stage: 1 as const,
              name: "values" as const,
              output: {
                values: stage1Values,
                adjustedWeights: stage1Weights,
                rationale: stage1Rationale,
                reasoning: stage1Reasoning,
              },
            },
          ] as const)),
      {
        stage: 2,
        name: "constraints",
        output: {
          triggeredConstraints: stage2.triggeredConstraints,
          eliminated: stage2.eliminated,
          remaining: stage2.filtered.map((c) => c.id),
        },
      },
      {
        stage: 3,
        name: "weights",
        output: {
          weights: stage3.weights,
          notes: stage3.notes,
        },
      },
      {
        stage: 4,
        name: "outranking",
        output: {
          dominant: stage4.dominant.map((c) => c.id),
          eliminated: stage4.eliminated,
          // Truncate pairwise matrix in trace to save UI weight; full matrix is
          // computable if needed.
          pairwise: stage4.pairwise.slice(0, 24),
        },
      },
      {
        stage: 5,
        name: "ranking",
        output: {
          ranked: stage5.ranked.map((r) => ({
            id: r.candidate.id,
            label: r.candidate.label,
            closeness: Number(r.closeness.toFixed(4)),
          })),
          confidence: stage5.confidence,
          robustCandidateId: stage5.robustCandidate.id,
          reasoning: stage5.reasoning,
        },
      },
      {
        stage: 6,
        name: "feasibility",
        output: {
          // Per F-08: emit the categorical classification + scores so the
          // UI can render the chip + ranked-drains panel from methodTrace.
          classifications: rankedReducers.map((r) => ({
            title: r.title,
            aiFeasibility: r.aiFeasibility ?? null,
            feasibilityScore: r.feasibilityScore ?? null,
            impactScore: r.impactScore ?? null,
            combinedScore: r.combinedScore ?? null,
          })),
          reasoning: stage6.reasoning,
        },
      },
      {
        stage: 7,
        name: "scaffold",
        output: {
          generatedCount: stage7.generatedCount,
          eligibleReducers: stage7.reducers
            .filter((r) => r.scaffold)
            .map((r) => ({ title: r.title, fileCount: r.scaffold!.files.length })),
        },
      },
    ],
    workloadReducers: stage7.reducers,
    destinations: [
      {
        type: "user_ui",
        delivered: true,
        deliveredAt: new Date(),
      },
    ],
    weightSource,
  };

  return { output, llmCalls };
}

// ---------------------------------------------------------------------------
// V2 — runRecommendation()
//
// Peer to runDecision(); implements the pain-to-AI recommendation pipeline.
// V1 runDecision() is intentionally left untouched.
//
// Pipeline stages:
//   1. pain-path classify (stub — E2 lands later)
//   2. use-case retrieval (stub — E2/L2 land later)
//   3. candidate generation (LLM-driven; minimal for P0)
//   4. scoring (deterministic heuristic for P0; E2 adds 9-criteria scorer)
//   5. starter solution + guardrails generation (LLM)
//   6. Stage 8 promotion classifier (this chunk)
// ---------------------------------------------------------------------------

// S1: Citation token emission instruction block.
// Appended to narrative-stage LLM prompts so the model emits [[doc:<uuid>]]
// tokens that the CitationChip component (components/chat/CitationChip.tsx)
// renders as clickable citation chips.
const CITATION_INSTRUCTION_BLOCK = `
## Citation tokens
When your response references a fact that came from a retrieved source, emit the token [[doc:<uuid>]] immediately after the cited fact. The UI renders these as citation chips. Rules:
- Only emit [[doc:<uuid>]] if the source appears in the Retrieved Sources list provided in the user context below.
- Use the exact UUID from that list. No truncation or invention.
- One token per factual claim per source.
- If no retrieved source supports a fact, do not emit a token. State explicitly that you lack a grounded source rather than guessing.
- Citation tokens COMPOSE with origin tags from the "Label every number" rule. A sourced number gets both.

Sourced number example: "AI scheduling tools have cut no-show rates by ~30% (from source) in primary-care studies[[doc:a1b2c3d4-e5f6-7890-abcd-ef1234567890]]."
Unsourced number example: "Practitioners typically save 2–4 hours/week (estimated) once intake is automated."
`;

const RECOMMENDATION_SYSTEM_PROMPT = `You are the recommendation engine for Aida, an AI assistant helping solo healthcare practitioners spend less time on admin and more time on patients.

Given a pain path and challenge description, produce a concrete AI task recommendation.

## Core principles

**Truthfulness comes first.** When you don't have a grounded source for a claim, say so or omit the claim. Never invent statistics, study citations, vendor names, or pricing. It is better to write "this typically helps, though I don't have a specific number for your setting" than to fabricate a precise figure.

**Label every number.** Every number that appears in user-facing prose (challengeSummary, whyThisTask, starterSolution, guardrails items, tryThisWeek items, successMetric) must carry an inline origin tag:
  - (your reported value) — directly from the practitioner's input
  - (calculated from your inputs) — derived from their numbers
  - (estimated) — best guess, no grounded source
  - (industry typical) — common range you're recalling without a specific source
  - (from source) — pulled from a retrieved source; pair with the [[doc:<uuid>]] citation token

No naked numbers. This applies to dollars, hours, percentages, counts, frequencies, durations, and ranges. Numbers inside structured/numeric JSON fields (score, confidence) do NOT need tags — only numbers embedded in prose.

**Professional, plain voice.** Specific over vague. No "you must" or "you should always" — practitioners decide. No marketing voice, no hype words, no rhetorical flourishes. American English. The recommendation is for someone with limited time who needs to know what to do and why.

## Output (JSON object only. No prose, no fences):
{
  "challengeSummary": "<1-2 sentences. Plain-language restatement of the challenge. Origin-tag any numbers.>",
  "goal": "<1 sentence. What improvement the practitioner wants.>",
  "candidateTasks": [
    {
      "id": "<slug, lowercase-hyphenated>",
      "title": "<≤80 char task title>",
      "description": "<1 sentence what this task involves>",
      "score": <0-100 relevance>,
      "tags": ["<tag>"]
    }
  ],
  "recommendedTask": "<title of the best candidate task>",
  "recommendedApproach": "prompt" | "checklist" | "sop" | "skill" | "plugin" | "agent" | "human_only" | "existing_tool",
  "whyThisTask": "<2-3 sentences. Why this task over the others, connected to the challenge. Origin-tag any numbers.>",
  "starterSolution": "<paste-ready solution: a prompt to use in ChatGPT/Claude, or step-by-step instructions. ≤500 words. Origin-tag any numbers.>",
  "guardrails": ["<safety or quality guardrail, ≤5 items. Origin-tag any numbers.>"],
  "tryThisWeek": ["<concrete action the practitioner can take this week, ≤3 items. Origin-tag any numbers.>"],
  "successMetric": "<one measurable outcome to track. Numbers in this field MUST carry an origin tag, e.g. 'Reduce charting time by 30 min/day (estimated baseline; track actuals weekly).'>",
  "confidence": <0-100 integer>
}

## Rules
- candidateTasks: 2-4 tasks. First = recommended. Others = alternatives considered.
- recommendedApproach: match the starter solution type.
- guardrails: healthcare-specific safety notes (PHI, clinical risk, patient-facing material needs clinician review).
- successMetric: practical, measurable, 60-day horizon. The metric is for the practitioner to track — the number you suggest is a starting point, not a promise.
- All content is for a solo healthcare practitioner. Never recommend action requiring staff, EHR vendor contracts, or significant capital.
- JSON only. No commentary outside JSON.`;

/**
 * V2 recommendation orchestrator peer.
 *
 * Runs the pain-to-AI recommendation pipeline and returns an AiTaskRecommendation.
 * Does NOT write to DB (caller/route handles persistence).
 */
export async function runRecommendation(
  input: RecommendationInput,
): Promise<AiTaskRecommendation> {
  const methodTrace: AiTaskRecommendation["methodTrace"] = [];

  // STAGE: pain-path classify
  const classification = await classifyPainPath({
    challenge: input.challengeText,
    selectedPath: input.painPath,
  });
  const selectedPainPath = classification.path;
  methodTrace.push({
    stage: "pain-classify",
    name: "pain-path",
    output: {
      selectedPainPath,
      confidence: classification.confidence,
      clarifierCount: classification.clarifiers?.length ?? 0,
      source: input.painPath ? "input-corroborated" : "classifier",
    },
  });

  // STAGE: use-case retrieval
  // TODO L2: replace stub with searchLibrary() + use-case retrieval from corpus
  methodTrace.push({
    stage: "use-case-retrieval",
    name: "library-retrieval",
    output: { retrieved: 0, source: "stub-pending-L2" },
  });

  // STAGE: candidate task generation
  const goal =
    typeof input.goal === "string" && input.goal.length > 0
      ? input.goal
      : `Reduce time on ${selectedPainPath.replace("_", " ")} tasks and improve practice efficiency.`;

  const candidateTasksExt = await generateCandidateTasks({
    painPath: selectedPainPath,
    challenge: input.challengeText,
    goal,
  });

  // STAGE: 9-criteria scoring
  //
  // Caller-supplied values from the E3 intake flow take precedence; any
  // missing field falls back to a stable default. dataReadiness has no
  // intake question (intentionally — the intake is 5 questions max), so it
  // always defaults server-side. Defaults mirror the prior hardcoded set
  // EXCEPT dataReadiness which moves from 0.6 → 0.5 to match the neutral
  // midpoint the other unscored fields use.
  const intakeScoring = input.scoringInput ?? {};
  const scoringInput = {
    painSeverity: intakeScoring.painSeverity ?? 0.7,
    frequency: intakeScoring.frequency ?? 0.6,
    timeBurden: intakeScoring.timeBurden ?? 0.6,
    riskTolerance: intakeScoring.riskTolerance ?? 0.4,
    aiComfort: intakeScoring.aiComfort ?? 0.5,
    dataReadiness: intakeScoring.dataReadiness ?? 0.5,
  };

  // Guarantee ≥ 1 task for scoring (generateCandidateTasks guarantees ≥ 3 from
  // library stubs, but add a final safety net for the unlikely empty case).
  const safeTasksExt =
    candidateTasksExt.length > 0
      ? candidateTasksExt
      : [{ id: slugify(`${selectedPainPath}-fallback`), taskName: `Address ${selectedPainPath.replace("_", " ")} with AI`, taskDescription: `Use AI to help with: ${input.challengeText.slice(0, 180)}`, aiCapability: "drafting", dataNeeded: "Plain-language context.", guardrails: "No PHI in prompts. Review AI output before use.", startingLevel: "prompt" as const, source: "library" as const }];

  const scored = scoreCandidates(safeTasksExt, scoringInput);
  const topScoredCandidate = scored[0]!;

  methodTrace.push({
    stage: "candidate-gen",
    name: "llm-candidates",
    output: {
      candidateCount: candidateTasksExt.length,
      source: candidateTasksExt[0]?.source ?? "generated",
    },
  });

  methodTrace.push({
    stage: "scoring",
    name: "candidate-scoring",
    output: {
      topCandidateId: topScoredCandidate.id,
      topCandidateName: topScoredCandidate.taskName,
      combinedScore: topScoredCandidate.combinedScore,
      rankedCandidates: scored.map((c) => ({
        id: c.id,
        taskName: c.taskName,
        combinedScore: Number(c.combinedScore.toFixed(4)),
        rank: c.rank,
        criterionSummary: Object.fromEntries(
          Object.entries(c.scores).map(([k, v]) => [k, { adjusted: Number(v.adjusted.toFixed(3)), rationale: v.rationale }]),
        ),
      })),
    },
  });

  // Convert CandidateTaskExt → AiTaskRecommendation candidateTasks shape.
  // The V1 candidateTasks use { id, title, description, painPath, score, tags }.
  // We adapt from the E2 extended shape, mapping topScoredCandidate's combinedScore to 0-100.
  const rawCandidates: AiTaskRecommendation["candidateTasks"] = scored.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.taskName,
    description: c.taskDescription,
    painPath: selectedPainPath,
    score: Math.round(c.combinedScore * 100),
    tags: [c.aiCapability, c.startingLevel],
  }));

  // Ensure at least 1 candidate (scored always returns ≥ 1 if input is non-empty).
  if (rawCandidates.length === 0) {
    rawCandidates.push(fallbackCandidate(selectedPainPath, input.challengeText));
  }

  // Derive recommendation fields from the top-scored candidate.
  const topCandidate = rawCandidates[0]!;
  const topExt = topScoredCandidate;

  // Use RECOMMENDATION_SYSTEM_PROMPT LLM call to get narrative fields
  // (challengeSummary, whyThisTask, starterSolution, guardrails, tryThisWeek, successMetric).
  const userPrompt = JSON.stringify({
    painPath: selectedPainPath,
    challengeText: input.challengeText,
    goal,
    recommendedTask: topExt.taskName,
    recommendedApproach: topExt.startingLevel,
    candidateTasks: rawCandidates.slice(0, 3).map((c) => ({ id: c.id, title: c.title, description: c.description })),
  });

  // S1: Build retrieved-source list from candidateTasks for citation grounding.
  // At P0, candidate tasks are engine-generated, not yet library-retrieved, so
  // the source list is minimal. When L2 wires real library retrieval into this
  // path, replace the TODO stub with actual UUID + title pairs.
  // TODO Iteration L2: replace with real library retrieval results (uuid + title).
  const retrievedSources: Array<{ uuid: string; title: string; kind: string }> = rawCandidates
    .slice(0, 3)
    .map((c) => ({
      uuid: c.id, // slug-based at P0; library UUIDs at L2+
      title: c.title,
      kind: "candidate_task",
    }));

  const retrievedSourcesBlock =
    retrievedSources.length > 0
      ? `\n\nRetrieved Sources:\n${retrievedSources.map((s) => `- [${s.uuid}] ${s.title} (${s.kind})`).join("\n")}`
      : "";

  const narrativeSystemPrompt = RECOMMENDATION_SYSTEM_PROMPT + CITATION_INSTRUCTION_BLOCK;
  const narrativeUserPrompt = userPrompt + retrievedSourcesBlock;

  let llmAnswer = "";
  try {
    const llmResult = await callStage({
      systemPrompt: narrativeSystemPrompt,
      userPrompt: narrativeUserPrompt,
      responseSchema: {},
      temperature: 0.3,
    });
    llmAnswer = llmResult.answer;
  } catch {
    // Graceful degradation: all narrative fields fall back to deterministic defaults below.
    llmAnswer = "";
  }

  const parsed = parseRecommendationJson(llmAnswer);

  const challengeSummary =
    typeof parsed?.challengeSummary === "string"
      ? parsed.challengeSummary.slice(0, 600)
      : input.challengeText.slice(0, 600);

  const finalGoal =
    typeof parsed?.goal === "string"
      ? parsed.goal.slice(0, 400)
      : goal.slice(0, 400);

  const recommendedTask =
    typeof parsed?.recommendedTask === "string"
      ? parsed.recommendedTask.slice(0, 200)
      : topCandidate.title;

  const recommendedApproach = isValidApproach(parsed?.recommendedApproach)
    ? (parsed!.recommendedApproach as AiTaskRecommendation["recommendedApproach"])
    : (topExt.startingLevel as AiTaskRecommendation["recommendedApproach"]);

  const whyThisTask =
    typeof parsed?.whyThisTask === "string"
      ? parsed.whyThisTask.slice(0, 600)
      : `${recommendedTask} was selected as the most actionable AI task for your ${selectedPainPath} challenge (score: ${topScoredCandidate.combinedScore.toFixed(2)}).`;

  const starterSolution =
    typeof parsed?.starterSolution === "string"
      ? parsed.starterSolution.slice(0, 2000)
      : `Start by using this prompt in ChatGPT or Claude:\n\n"Help me ${recommendedTask.toLowerCase()}. Context: ${input.challengeText.slice(0, 200)}"`;

  const guardrails: string[] = Array.isArray(parsed?.guardrails)
    ? (parsed.guardrails as unknown[]).filter((g) => typeof g === "string").slice(0, 6) as string[]
    : [topExt.guardrails, "Review AI-generated patient-facing content before sending."];

  const tryThisWeek: string[] = Array.isArray(parsed?.tryThisWeek)
    ? (parsed.tryThisWeek as unknown[]).filter((t) => typeof t === "string").slice(0, 5) as string[]
    : [`Try the starter solution on one real ${selectedPainPath} task this week.`];

  const successMetric =
    typeof parsed?.successMetric === "string"
      ? parsed.successMetric.slice(0, 300)
      : `Reduce time spent on ${selectedPainPath.replace("_", " ")} tasks by at least 30 minutes per week within 60 days.`;

  const confidence =
    typeof parsed?.confidence === "number"
      ? Math.min(100, Math.max(0, Math.round(parsed.confidence as number)))
      : Math.round(classification.confidence * 80 + topScoredCandidate.combinedScore * 20);

  // STAGE 8: adoption-pathway promotion classifier.
  const adoptionPathway = await classifyPromotion({
    task: recommendedTask,
    taskDescription: topExt.taskDescription,
    painPath: selectedPainPath,
    scoring: { confidence, rationale: whyThisTask },
  });

  methodTrace.push({
    stage: "stage8-promotion",
    name: "adoption-pathway",
    output: {
      rungs: adoptionPathway.map((r) => ({ kind: r.kind, state: r.state, confidence: r.confidence })),
      classifierConfidence: classification.confidence,
      topCandidateCombinedScore: topScoredCandidate.combinedScore,
    },
  });

  return {
    selectedPainPath,
    challengeSummary,
    goal: finalGoal,
    candidateTasks: rawCandidates,
    recommendedTask,
    recommendedApproach,
    whyThisTask,
    starterSolution,
    guardrails,
    tryThisWeek,
    successMetric,
    adoptionPathway,
    confidence,
    methodTrace,
  };
}

// ---------------------------------------------------------------------------
// Utilities for runRecommendation
// ---------------------------------------------------------------------------

function parseRecommendationJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isValidCandidateTask(t: unknown): boolean {
  if (typeof t !== "object" || t === null) return false;
  const r = t as Record<string, unknown>;
  return typeof r.title === "string" && typeof r.description === "string";
}

function normalizeCandidateTask(
  t: Record<string, unknown>,
  painPath: RecommendationInput["painPath"],
): AiTaskRecommendation["candidateTasks"][number] {
  return {
    id: typeof t.id === "string" ? t.id.slice(0, 64) : slugify(t.title as string),
    title: (t.title as string).slice(0, 200),
    description: (t.description as string).slice(0, 400),
    painPath,
    score: typeof t.score === "number" ? Math.min(100, Math.max(0, Math.round(t.score as number))) : 70,
    tags: Array.isArray(t.tags) ? (t.tags as unknown[]).filter((x) => typeof x === "string").slice(0, 10) as string[] : [],
  };
}

function fallbackCandidate(
  painPath: RecommendationInput["painPath"],
  challenge: string,
): AiTaskRecommendation["candidateTasks"][number] {
  const title = `Address ${painPath.replace("_", " ")} with AI assistance`;
  return {
    id: slugify(title),
    title,
    description: `Use an AI prompt to help with: ${challenge.slice(0, 180)}`,
    painPath,
    score: 60,
    tags: [painPath],
  };
}

const VALID_APPROACHES = new Set([
  "existing_tool", "prompt", "checklist", "sop",
  "skill", "plugin", "agent", "human_only",
]);

function isValidApproach(v: unknown): boolean {
  return typeof v === "string" && VALID_APPROACHES.has(v);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
