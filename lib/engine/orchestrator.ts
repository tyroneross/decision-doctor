// PRD §6.2 — Decision engine orchestrator.
// Chains Stages 1-5; assembles the DecisionOutput contract.

import "server-only";
import type { DecisionInput, DecisionOutput } from "@/shared/schema";
import { loadTemplate } from "@/lib/engine/templates";
import { runStage1Values } from "@/lib/engine/stage1-values";
import { runStage2Constraints } from "@/lib/engine/stage2-constraints";
import { runStage3Weights } from "@/lib/engine/stage3-weights";
import { runStage4Outranking } from "@/lib/engine/stage4-outranking";
import { runStage5Ranking } from "@/lib/engine/stage5-ranking";
import { runStage6Feasibility } from "@/lib/engine/stage6-feasibility";
import type { TemplateId } from "@/shared/schema";

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

  // STAGE 1: LLM extracts values, suggests weight adjustments.
  const stage1 = await runStage1Values(input, template);
  llmCalls.push({
    stage: 1,
    tokensIn: stage1.tokensIn,
    tokensOut: stage1.tokensOut,
  });

  // STAGE 2: deterministic veto filtering.
  const stage2 = runStage2Constraints(template, input.fields as Record<string, unknown>);

  // STAGE 3: deterministic weight finalization.
  const stage3 = runStage3Weights(template, stage1.adjustedWeights);

  // STAGE 4: ELECTRE-style outranking on stage2's surviving candidates.
  const stage4 = runStage4Outranking(stage2.filtered, stage3.weights);

  // STAGE 5: TOPSIS ranking + minimax-regret robust + LLM rationale + workloadReducers.
  const stage5 = await runStage5Ranking(
    template,
    stage4.dominant,
    stage3.weights,
    input,
    stage1.values,
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
      {
        stage: 1,
        name: "values",
        output: {
          values: stage1.values,
          adjustedWeights: stage1.adjustedWeights,
          rationale: stage1.rationale,
          reasoning: stage1.reasoning,
        },
      },
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
    ],
    workloadReducers: rankedReducers,
    destinations: [
      {
        type: "user_ui",
        delivered: true,
        deliveredAt: new Date(),
      },
    ],
  };

  return { output, llmCalls };
}
