// PRD §6.2 — Engine orchestrator. Chains Stages 1–5 + assembles DecisionOutput.

import {
  type DecisionInput,
  type DecisionOutput,
  DecisionOutputSchema,
} from "@/shared/schema";
import { loadTemplate } from "./templates";
import { runStage1Values, type Stage1Output } from "./stage1-values";
import { runStage2Constraints, type Stage2Output } from "./stage2-constraints";
import { runStage3Weights, type Stage3Output } from "./stage3-weights";
import { runStage4Outranking, type Stage4Output } from "./stage4-outranking";
import { runStage5Ranking, type Stage5Output } from "./stage5-ranking";
import { runStages123Fused } from "./fused-stages-1-2-3";

export interface RunDecisionResult {
  output: DecisionOutput;
  metrics: {
    totalLatencyMs: number;
    perStageMs: number[];
    totalTokensIn: number;
    totalTokensOut: number;
  };
}

export async function runDecision(
  input: DecisionInput,
  opts: { decisionId: string; now?: Date } = { decisionId: "" },
): Promise<RunDecisionResult> {
  const t0 = Date.now();
  const template = loadTemplate(input.templateId);
  const fields = input.fields;

  // Per-template strict field validation (catches PHI / out-of-range).
  template.buildZodSchema().parse(fields);

  const s1 = await runStage1Values(fields, template);
  // Stages 2 and 3 both depend only on input + Stage 1 output — run in parallel.
  const [s2, s3] = await Promise.all([
    runStage2Constraints(fields, s1.output, template),
    runStage3Weights(fields, s1.output, template),
  ]);
  const s4 = await runStage4Outranking(fields, s2.output.filtered, s3.output.weights, template);
  const s5 = await runStage5Ranking(fields, s4.output.scored, s3.output.weights, template);
  // The fused-stages helper is exported for tests / future rollout but not used
  // here — keeping the discrete stage flow yields better latency in our local
  // measurements (one fewer mega-prompt; Groq's TTFT is the dominant cost).
  void runStages123Fused;

  const decisionId = opts.decisionId || crypto.randomUUID();
  const now = opts.now ?? new Date();

  const recommended = s5.output.ranked[0];
  if (!recommended) {
    throw new Error("Engine produced no ranked option.");
  }

  // Assemble alternatives — Stage 2 eliminations + Stage 4 eliminations + the runners-up.
  const alternativesArr: { option: string; eliminatedAtStage: 2 | 4; reason: string }[] = [];
  for (const e of s2.output.eliminated) {
    alternativesArr.push({ option: e.option, eliminatedAtStage: 2, reason: e.reason });
  }
  for (const e of s4.output.eliminated) {
    alternativesArr.push({ option: e.option, eliminatedAtStage: 4, reason: e.reason });
  }
  // Always include runner-up as a non-eliminated alternative if we have <2.
  // Reason text stays in plain English — no weighted-score numbers (those
  // leak engine plumbing into clinician UI per UX critic 2026-05-10).
  if (alternativesArr.length < 2) {
    const runnersUp = s5.output.ranked.slice(1, 3);
    for (const r of runnersUp) {
      alternativesArr.push({
        option: r.option,
        eliminatedAtStage: 4,
        reason:
          "Ranked behind the recommendation on the criteria you weighted most heavily.",
      });
    }
  }
  // Cap to 5 to keep the UI scannable.
  const alternatives = alternativesArr.slice(0, 5);

  // Robust alternative integrity: if the engine returns the SAME option as
  // the recommendation (happens when only 1-2 options survived Stage 2 or
  // when one option dominates every criterion), surface that honestly rather
  // than render a "safety net" that's a copy of the recommendation. UX critic
  // 2026-05-10 flagged this as the #1 trust killer.
  const robustIsDistinct = s5.output.robustOption !== recommended.option;
  const robustAlternative = robustIsDistinct
    ? { option: s5.output.robustOption, why: s5.output.robustWhy }
    : {
        option: "No clearly different fallback",
        why: "Your inputs converge on one path. If your assumptions shift later, run the same template again with the new numbers and compare.",
      };

  const output: DecisionOutput = {
    decisionId,
    decidedAt: now,
    recommendation: {
      option: recommended.option,
      confidence: s5.output.confidence,
      rationale: s5.output.recommendationRationale,
    },
    alternatives,
    robustAlternative,
    methodTrace: [
      { stage: 1, name: "values", output: s1.output },
      { stage: 2, name: "constraints", output: s2.output },
      { stage: 3, name: "weights", output: s3.output },
      { stage: 4, name: "outranking", output: s4.output },
      {
        stage: 5,
        name: "ranking",
        output: {
          ranked: s5.output.ranked,
          confidence: s5.output.confidence,
          robustOption: s5.output.robustOption,
        },
      },
    ],
    workloadReducers: s5.output.workloadReducers,
    destinations: [
      { type: "user_ui", delivered: true, deliveredAt: now },
    ],
  };

  // Validate output against the canonical Zod schema before returning.
  const parsed = DecisionOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new Error(
      "Engine output failed schema validation: " +
        JSON.stringify(parsed.error.flatten()),
    );
  }

  return {
    output: parsed.data,
    metrics: {
      totalLatencyMs: Date.now() - t0,
      perStageMs: [s1.latencyMs, s2.latencyMs, s3.latencyMs, s4.latencyMs, s5.latencyMs],
      totalTokensIn: s1.tokensIn + s2.tokensIn + s3.tokensIn + s4.tokensIn + s5.tokensIn,
      totalTokensOut: s1.tokensOut + s2.tokensOut + s3.tokensOut + s4.tokensOut + s5.tokensOut,
    },
  };
}

// Re-export stage outputs for tests / observability consumers.
export type { Stage1Output, Stage2Output, Stage3Output, Stage4Output, Stage5Output };
