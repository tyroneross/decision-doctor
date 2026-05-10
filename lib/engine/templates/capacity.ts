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

export const capacityTemplate: DecisionTemplate = {
  id: "capacity",
  title: "Decide capacity",
  fieldCount: 6,
  fieldSchema: z
    .object({
      weeklyVisitCount: z.number().int().min(0).max(80),
      waitlistWeeks: z.number().min(0).max(24),
      adminHoursPerWeek: z.number().min(0).max(30),
      burnoutRisk: z.enum(["low", "moderate", "high"]),
      growthGoal: z.enum(["reduce", "maintain", "grow"]),
      scheduleFlexibility: z.enum(["low", "medium", "high"]),
    })
    .strict(),
  criteria: [
    {
      id: "patient_access",
      label: "Patient access",
      description: "Preserves timely access for appropriate new patients.",
      direction: "maximize",
      baseWeight: 0.24,
      weightAdjustment: (fields) => (numberField(fields, "waitlistWeeks") >= 6 ? 0.08 : 0),
    },
    {
      id: "owner_capacity",
      label: "Owner capacity",
      description: "Reduces overload and protects clinical energy.",
      direction: "maximize",
      baseWeight: 0.28,
      weightAdjustment: (fields) => (textField(fields, "burnoutRisk") === "high" ? 0.1 : 0),
    },
    {
      id: "revenue_stability",
      label: "Revenue stability",
      description: "Avoids unnecessary revenue volatility.",
      direction: "maximize",
      baseWeight: 0.18,
    },
    {
      id: "implementation_speed",
      label: "Implementation speed",
      description: "Can be acted on without a long setup cycle.",
      direction: "maximize",
      baseWeight: 0.18,
    },
    {
      id: "reversibility",
      label: "Reversibility",
      description: "Can be reversed if demand or capacity changes.",
      direction: "maximize",
      baseWeight: 0.12,
    },
  ],
  candidateSet: [
    {
      id: "cap-new-intakes",
      option: "Cap new intakes for four weeks",
      summary: "Temporarily pause or ration new intakes while clearing existing load.",
      scores: {
        patient_access: (fields) => (numberField(fields, "waitlistWeeks") >= 6 ? 35 : 55),
        owner_capacity: 92,
        revenue_stability: 70,
        implementation_speed: 95,
        reversibility: 94,
      },
    },
    {
      id: "add-clinical-block",
      option: "Add one protected clinical block",
      summary: "Open a limited recurring visit block without changing the whole schedule.",
      constraints: [
        {
          id: "schedule-flexibility",
          description: "Requires at least medium schedule flexibility.",
          failsWhen: (fields) => textField(fields, "scheduleFlexibility") === "low",
          reason: () => "Schedule flexibility is low, so adding a clinical block would likely create spillover overload.",
        },
      ],
      scores: {
        patient_access: 88,
        owner_capacity: (fields) => (textField(fields, "burnoutRisk") === "high" ? 35 : 64),
        revenue_stability: 90,
        implementation_speed: 70,
        reversibility: 65,
      },
    },
    {
      id: "admin-support",
      option: "Buy back admin time first",
      summary: "Use admin help or automation before changing clinical capacity.",
      scores: {
        patient_access: 74,
        owner_capacity: (fields) => Math.min(96, 58 + numberField(fields, "adminHoursPerWeek") * 2.4),
        revenue_stability: 82,
        implementation_speed: 72,
        reversibility: 78,
      },
    },
    {
      id: "raise-rate-slow-demand",
      option: "Raise rates to slow demand",
      summary: "Use pricing to reduce excess demand while protecting income.",
      constraints: [
        {
          id: "growth-goal",
          description: "Not compatible with an active growth goal.",
          failsWhen: (fields) => textField(fields, "growthGoal") === "grow",
          reason: () => "The stated goal is growth, so using price to suppress demand conflicts with the objective.",
        },
      ],
      scores: {
        patient_access: 42,
        owner_capacity: 78,
        revenue_stability: 76,
        implementation_speed: 64,
        reversibility: 48,
      },
    },
  ],
  workloadReducers: (recommendation, robustAlternative) => [
    {
      type: "prompt",
      title: "Draft the patient-facing update",
      description: "Paste-ready language for announcing the capacity change without over-explaining.",
      artifact: {
        promptText: `Draft a concise, warm practice update for: ${recommendation.option}. Do not include patient details. Include who it affects, when it starts, and how existing patients can ask scheduling questions.`,
      },
      automationLevel: "user_executes",
      coverage: "partial_task",
      permission_tier: "T0",
    },
    {
      type: "playbook",
      title: "One-week rollout checklist",
      description: "Concrete steps to make the capacity decision operational.",
      artifact: {
        playbookSteps: [
          "Update scheduling rules and intake availability.",
          "Block 30 minutes to revise website and voicemail language.",
          "Review the first seven days of appointment requests before adjusting again.",
        ],
      },
      automationLevel: "user_executes",
      coverage: "full_task",
      permission_tier: "T1",
    },
    {
      type: "prompt",
      title: "Stress-test the fallback",
      description: "A quick check for when assumptions shift.",
      artifact: {
        promptText: `Compare "${recommendation.option}" with the robust fallback "${robustAlternative.option}" if demand changes by 20%. Return only operational risks and first next steps.`,
      },
      automationLevel: "user_executes",
      coverage: "task_setup",
      permission_tier: "T0",
    },
  ],
};
