import {
  DecisionOutputSchema,
  type DecisionInput,
  type DecisionOutput,
} from "../../shared/schema";
import { runStage1Values } from "./stage1-values";
import { runStage2Constraints } from "./stage2-constraints";
import { runStage3Weights } from "./stage3-weights";
import { runStage4Outranking } from "./stage4-outranking";
import { runStage5Ranking } from "./stage5-ranking";
import { loadTemplate } from "./templates";

function decisionId(): string {
  return globalThis.crypto?.randomUUID() ?? "00000000-0000-4000-8000-000000000000";
}

function rationale(stage5: Awaited<ReturnType<typeof runStage5Ranking>>): string {
  const top = stage5.recommendation;
  const fallback = stage5.robustAlternative;

  return `${top.option} has the strongest weighted fit for the stated constraints and values. ${fallback.option} is the robust fallback if assumptions shift.`;
}

export async function runDecision(input: DecisionInput): Promise<DecisionOutput> {
  const template = loadTemplate(input.templateId);

  const values = await runStage1Values(input, template);
  const constraints = await runStage2Constraints(values);
  const weights = await runStage3Weights(constraints);
  const outranking = await runStage4Outranking(weights);
  const ranking = await runStage5Ranking(outranking);

  const output: DecisionOutput = {
    decisionId: decisionId(),
    decidedAt: new Date(),
    recommendation: {
      option: ranking.recommendation.option,
      confidence: ranking.confidence,
      rationale: rationale(ranking),
    },
    alternatives: ranking.alternatives.map((alternative) => ({
      option: alternative.option,
      eliminatedAtStage: alternative.eliminatedAtStage,
      reason: alternative.reason,
    })),
    robustAlternative: {
      option: ranking.robustAlternative.option,
      why: `${ranking.robustAlternative.option} has the next-best minimax profile: it preserves more upside than the eliminated options if the top assumption changes.`,
    },
    methodTrace: [
      {
        stage: 1,
        name: "values",
        output: {
          templateId: template.id,
          objectives: values.objectives,
          fieldSummary: values.fieldSummary,
        },
      },
      {
        stage: 2,
        name: "constraints",
        output: {
          checks: constraints.constraintChecks,
          eliminated: constraints.eliminated,
          survivors: constraints.filtered.map((candidate) => candidate.option),
        },
      },
      {
        stage: 3,
        name: "weights",
        output: {
          weights: weights.weights,
          adjustments: weights.adjustments,
        },
      },
      {
        stage: 4,
        name: "outranking",
        output: {
          finalists: outranking.finalists.map((candidate) => ({
            option: candidate.option,
            weightedScore: candidate.weightedScore,
            closeness: candidate.closeness,
          })),
          eliminated: outranking.eliminated,
        },
      },
      {
        stage: 5,
        name: "ranking",
        output: {
          ranked: ranking.ranked.map((candidate) => ({
            option: candidate.option,
            weightedScore: candidate.weightedScore,
            closeness: candidate.closeness,
          })),
          confidence: ranking.confidence,
          robustAlternative: ranking.robustAlternative.option,
        },
      },
    ],
    workloadReducers: template.workloadReducers(
      ranking.recommendation,
      ranking.robustAlternative,
      input,
    ),
    destinations: [
      {
        type: "user_ui",
        delivered: true,
        deliveredAt: new Date(),
      },
    ],
  };

  return DecisionOutputSchema.parse(output);
}
