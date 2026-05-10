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

export const adminHireTemplate: DecisionTemplate = {
  id: "admin-hire",
  title: "Decide an admin hire",
  fieldCount: 6,
  fieldSchema: z
    .object({
      adminHoursPerWeek: z.number().min(0).max(40),
      missedCallsPerWeek: z.number().min(0).max(100),
      monthlyBudget: z.number().min(0).max(20000),
      hiringUrgency: z.enum(["low", "moderate", "high"]),
      processClarity: z.enum(["low", "medium", "high"]),
      privacyComfort: z.enum(["low", "medium", "high"]),
    })
    .strict(),
  criteria: [
    {
      id: "time_return",
      label: "Owner time return",
      description: "Returns meaningful owner hours each week.",
      direction: "maximize",
      baseWeight: 0.28,
      weightAdjustment: (fields) => (numberField(fields, "adminHoursPerWeek") >= 10 ? 0.08 : 0),
    },
    {
      id: "patient_responsiveness",
      label: "Patient responsiveness",
      description: "Improves response time for scheduling and front-desk needs.",
      direction: "maximize",
      baseWeight: 0.22,
      weightAdjustment: (fields) => (numberField(fields, "missedCallsPerWeek") >= 8 ? 0.07 : 0),
    },
    {
      id: "cost_fit",
      label: "Cost fit",
      description: "Fits the available monthly budget.",
      direction: "maximize",
      baseWeight: 0.22,
    },
    {
      id: "privacy_fit",
      label: "Privacy fit",
      description: "Matches the owner's comfort with delegating operational access.",
      direction: "maximize",
      baseWeight: 0.16,
      weightAdjustment: (fields) => (textField(fields, "privacyComfort") === "low" ? 0.08 : 0),
    },
    {
      id: "implementation_speed",
      label: "Implementation speed",
      description: "Can be put in place quickly.",
      direction: "maximize",
      baseWeight: 0.12,
    },
  ],
  candidateSet: [
    {
      id: "part-time-va",
      option: "Hire a part-time healthcare virtual assistant",
      summary: "Delegate scheduling, inbox triage, and routine admin blocks.",
      constraints: [
        {
          id: "budget",
          description: "Needs enough monthly budget for a recurring assistant.",
          failsWhen: (fields) => numberField(fields, "monthlyBudget") < 800,
          reason: () => "The monthly budget is below the minimum practical range for a recurring assistant.",
        },
        {
          id: "privacy",
          description: "Requires comfort granting limited operational access.",
          failsWhen: (fields) => textField(fields, "privacyComfort") === "low",
          reason: () => "Privacy comfort is low, so external admin access should not be the first move.",
        },
      ],
      scores: {
        time_return: (fields) => Math.min(95, 50 + numberField(fields, "adminHoursPerWeek") * 2.8),
        patient_responsiveness: 88,
        cost_fit: (fields) => Math.min(90, numberField(fields, "monthlyBudget") / 18),
        privacy_fit: 58,
        implementation_speed: 62,
      },
    },
    {
      id: "contract-biller",
      option: "Contract a billing specialist",
      summary: "Delegate revenue-cycle friction before hiring general admin help.",
      constraints: [
        {
          id: "budget",
          description: "Needs some recurring contractor budget.",
          failsWhen: (fields) => numberField(fields, "monthlyBudget") < 500,
          reason: () => "The monthly budget is too low for a reliable billing contractor.",
        },
      ],
      scores: {
        time_return: 70,
        patient_responsiveness: 52,
        cost_fit: (fields) => Math.min(92, numberField(fields, "monthlyBudget") / 12),
        privacy_fit: 68,
        implementation_speed: 70,
      },
    },
    {
      id: "automate-intake",
      option: "Automate scheduling and intake first",
      summary: "Use templates and scheduling rules before adding headcount.",
      scores: {
        time_return: (fields) => Math.min(84, 42 + numberField(fields, "adminHoursPerWeek") * 2),
        patient_responsiveness: (fields) => Math.min(86, 50 + numberField(fields, "missedCallsPerWeek") * 3),
        cost_fit: 94,
        privacy_fit: 88,
        implementation_speed: 86,
      },
    },
    {
      id: "sop-first",
      option: "Document SOPs before hiring",
      summary: "Clarify repeatable workflows so later delegation is safer.",
      scores: {
        time_return: 44,
        patient_responsiveness: 48,
        cost_fit: 98,
        privacy_fit: 96,
        implementation_speed: (fields) => (textField(fields, "processClarity") === "low" ? 82 : 68),
      },
    },
  ],
  workloadReducers: (recommendation, robustAlternative) => [
    {
      type: "prompt",
      title: "Draft the admin role brief",
      description: "Paste-ready prompt for a practical role or workflow brief.",
      artifact: {
        promptText: `Draft a one-page operating brief for: ${recommendation.option}. Do not include patient identifiers. Include responsibilities, access boundaries, first-week tasks, and success metrics.`,
      },
      automationLevel: "user_executes",
      coverage: "partial_task",
      permission_tier: "T0",
    },
    {
      type: "playbook",
      title: "Delegation safety checklist",
      description: "Keeps the hire or automation path bounded and auditable.",
      artifact: {
        playbookSteps: [
          "List the exact systems or inboxes involved.",
          "Define what the helper may do without approval.",
          "Schedule a 14-day review of errors, response time, and owner hours saved.",
        ],
      },
      automationLevel: "user_executes",
      coverage: "full_task",
      permission_tier: "T1",
    },
    {
      type: "prompt",
      title: "Fallback hiring comparison",
      description: "A short contingency analysis for changed assumptions.",
      artifact: {
        promptText: `Compare "${recommendation.option}" with "${robustAlternative.option}" if budget or privacy comfort changes. Focus on operational tradeoffs and next actions only.`,
      },
      automationLevel: "user_executes",
      coverage: "task_setup",
      permission_tier: "T0",
    },
  ],
};
