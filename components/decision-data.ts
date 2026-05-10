import type { TemplateId } from "@/shared/schema";

export type IntakeField =
  | {
      id: string;
      label: string;
      help: string;
      type: "number";
      min: number;
      max: number;
      step?: number;
      suffix?: string;
    }
  | {
      id: string;
      label: string;
      help: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
    }
  | {
      id: string;
      label: string;
      help: string;
      type: "multi";
      options: Array<{ value: string; label: string }>;
      maxSelected: number;
    };

export type DecisionTemplate = {
  id: TemplateId;
  title: string;
  action: string;
  description: string;
  time: string;
  fields: IntakeField[];
};

export const decisionTemplates: DecisionTemplate[] = [
  {
    id: "capacity",
    title: "Capacity",
    action: "Decide capacity",
    description:
      "Choose whether to cap intake, add sessions, or reduce admin drag.",
    time: "6 fields",
    fields: [
      {
        id: "weeklyVisitCount",
        label: "Visits each week",
        help: "Use your typical weekly completed visit count.",
        type: "number",
        min: 0,
        max: 80,
      },
      {
        id: "waitlistWeeks",
        label: "Waitlist length",
        help: "Estimate weeks until the next available new-patient slot.",
        type: "number",
        min: 0,
        max: 24,
        suffix: "weeks",
      },
      {
        label: "Admin hours each week",
        id: "adminHoursPerWeek",
        help: "Include scheduling, billing, portal work, and follow-up tasks.",
        type: "number",
        min: 0,
        max: 30,
      },
      {
        id: "burnoutRisk",
        label: "Burnout risk",
        help: "Pick the current owner-capacity signal.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
      {
        id: "growthGoal",
        label: "Practice goal",
        help: "This anchors the tradeoff the engine should protect.",
        type: "select",
        options: [
          { value: "reduce", label: "Reduce load" },
          { value: "maintain", label: "Maintain current panel" },
          { value: "grow", label: "Grow capacity" },
        ],
      },
      {
        id: "scheduleFlexibility",
        label: "Schedule flexibility",
        help: "Choose how much room exists to change clinical blocks.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing",
    action: "Decide pricing",
    description:
      "Choose whether to raise fees, hold price, or change your mix.",
    time: "6 fields",
    fields: [
      {
        id: "currentFee",
        label: "Current session fee",
        help: "Use your most common private-pay session fee.",
        type: "number",
        min: 0,
        max: 1000,
      },
      {
        id: "targetMonthlyIncomeGap",
        label: "Monthly income gap",
        help: "Estimate the monthly gap between current and target income.",
        type: "number",
        min: 0,
        max: 50000,
      },
      {
        id: "panelMix",
        label: "Panel mix",
        help: "Pick the closest current model.",
        type: "select",
        options: [
          { value: "mostly_cash", label: "Mostly cash pay" },
          { value: "mixed", label: "Mixed cash pay and insurance" },
          { value: "mostly_insurance", label: "Mostly insurance" },
        ],
      },
      {
        id: "demandLevel",
        label: "Demand level",
        help: "Use current inquiry volume and schedule fill as the signal.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
      {
        id: "priceSensitivity",
        label: "Patient price sensitivity",
        help: "Use your recent intake conversations as the signal.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
      {
        id: "adminTolerance",
        label: "Admin tolerance",
        help: "Choose how much billing and communication overhead you can absorb.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "admin-hire",
    title: "Admin hire",
    action: "Decide a hire",
    description:
      "Choose whether to hire admin help, use tools, or keep work in-house.",
    time: "6 fields",
    fields: [
      {
        id: "adminHoursPerWeek",
        label: "Admin hours each week",
        help: "Include tasks that do not require your clinical judgment.",
        type: "number",
        min: 0,
        max: 40,
      },
      {
        id: "missedCallsPerWeek",
        label: "Missed calls each week",
        help: "Count likely patient or referral calls you cannot return fast.",
        type: "number",
        min: 0,
        max: 100,
      },
      {
        id: "monthlyBudget",
        label: "Monthly admin budget",
        help: "Use a number you could sustain for three months.",
        type: "number",
        min: 0,
        max: 20000,
      },
      {
        id: "hiringUrgency",
        label: "Hiring urgency",
        help: "Choose how quickly the admin constraint needs relief.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
      {
        id: "processClarity",
        label: "Process clarity",
        help: "Choose how documented the repeatable admin work already is.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
      {
        id: "privacyComfort",
        label: "Privacy comfort",
        help: "Choose comfort with granting bounded operational access.",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
];

export function getTemplate(templateId: string): DecisionTemplate | undefined {
  return decisionTemplates.find((template) => template.id === templateId);
}
