import { z } from "zod";
import type { DecisionTemplate, TemplateFields } from "../types";

function numberField(fields: TemplateFields, key: string): number {
  const value = fields[key];
  return typeof value === "number" ? value : 0;
}

function textField(fields: TemplateFields, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

export const pricingTemplate: DecisionTemplate = {
  id: "pricing",
  title: "Decide pricing",
  fieldCount: 6,
  fieldSchema: z
    .object({
      currentFee: z.number().min(0).max(1000),
      targetMonthlyIncomeGap: z.number().min(0).max(50000),
      panelMix: z.enum(["mostly_cash", "mixed", "mostly_insurance"]),
      demandLevel: z.enum(["low", "moderate", "high"]),
      priceSensitivity: z.enum(["low", "moderate", "high"]),
      adminTolerance: z.enum(["low", "moderate", "high"]),
    })
    .strict(),
  criteria: [
    {
      id: "income_lift",
      label: "Income lift",
      description: "Closes the monthly income gap.",
      direction: "maximize",
      baseWeight: 0.3,
      weightAdjustment: (fields) => (numberField(fields, "targetMonthlyIncomeGap") >= 5000 ? 0.08 : 0),
    },
    {
      id: "retention_risk",
      label: "Retention protection",
      description: "Avoids preventable attrition from a pricing change.",
      direction: "maximize",
      baseWeight: 0.24,
      weightAdjustment: (fields) => (textField(fields, "priceSensitivity") === "high" ? 0.08 : 0),
    },
    {
      id: "admin_load",
      label: "Admin simplicity",
      description: "Keeps billing and communication overhead manageable.",
      direction: "maximize",
      baseWeight: 0.18,
      weightAdjustment: (fields) => (textField(fields, "adminTolerance") === "low" ? 0.06 : 0),
    },
    {
      id: "market_fit",
      label: "Market fit",
      description: "Fits current demand and panel composition.",
      direction: "maximize",
      baseWeight: 0.18,
    },
    {
      id: "reversibility",
      label: "Reversibility",
      description: "Can be adjusted without confusing patients.",
      direction: "maximize",
      baseWeight: 0.1,
    },
  ],
  candidateSet: [
    {
      id: "raise-standard-fee",
      option: "Raise the standard fee by 8 to 12 percent",
      summary: "A direct fee increase for new patients and renewals.",
      constraints: [
        {
          id: "cash-panel-fit",
          description: "Works best with at least some cash-pay control.",
          failsWhen: (fields) => textField(fields, "panelMix") === "mostly_insurance",
          reason: () => "The panel is mostly insurance-based, so a standard private fee change has limited practical effect.",
        },
      ],
      scores: {
        income_lift: (fields) => Math.min(95, 55 + numberField(fields, "targetMonthlyIncomeGap") / 180),
        retention_risk: (fields) => (textField(fields, "priceSensitivity") === "high" ? 42 : 72),
        admin_load: 78,
        market_fit: (fields) => (textField(fields, "demandLevel") === "high" ? 88 : 66),
        reversibility: 52,
      },
    },
    {
      id: "new-patient-only",
      option: "Apply pricing changes to new patients first",
      summary: "Protect continuity while testing market acceptance.",
      scores: {
        income_lift: (fields) => Math.min(84, 45 + numberField(fields, "targetMonthlyIncomeGap") / 250),
        retention_risk: 88,
        admin_load: 76,
        market_fit: (fields) => (textField(fields, "demandLevel") === "low" ? 52 : 82),
        reversibility: 78,
      },
    },
    {
      id: "tighten-policy",
      option: "Tighten cancellation and documentation policies",
      summary: "Recover revenue leakage before changing base fees.",
      scores: {
        income_lift: 54,
        retention_risk: 76,
        admin_load: (fields) => (textField(fields, "adminTolerance") === "low" ? 48 : 72),
        market_fit: 74,
        reversibility: 82,
      },
    },
    {
      id: "hold-prices",
      option: "Hold fees and optimize retention",
      summary: "Avoid price movement while improving schedule utilization.",
      scores: {
        income_lift: 36,
        retention_risk: 94,
        admin_load: 90,
        market_fit: (fields) => (textField(fields, "demandLevel") === "low" ? 84 : 55),
        reversibility: 96,
      },
    },
  ],
  workloadReducers: (recommendation, robustAlternative) => [
    {
      type: "prompt",
      title: "Draft the pricing notice",
      description: "Paste-ready copy for a clear pricing update.",
      artifact: {
        promptText: `Draft a short practice pricing notice for: ${recommendation.option}. Do not include patient identifiers. Include effective date, who it applies to, and a calm explanation of continuity of care.`,
      },
      automationLevel: "user_executes",
      coverage: "partial_task",
      permission_tier: "T0",
    },
    {
      type: "playbook",
      title: "Pricing rollout checklist",
      description: "Operational sequence for implementing the pricing decision.",
      artifact: {
        playbookSteps: [
          "Update the fee schedule and intake scripts.",
          "Prepare a two-sentence answer for common price questions.",
          "Review appointment volume and cancellations after 30 days.",
        ],
      },
      automationLevel: "user_executes",
      coverage: "full_task",
      permission_tier: "T1",
    },
    {
      type: "prompt",
      title: "Fallback communication plan",
      description: "Prepares language if the robust alternative becomes better.",
      artifact: {
        promptText: `Create a contingency note comparing "${recommendation.option}" to "${robustAlternative.option}" if retention risk is higher than expected. Keep it operational and non-clinical.`,
      },
      automationLevel: "user_executes",
      coverage: "task_setup",
      permission_tier: "T0",
    },
  ],
};
