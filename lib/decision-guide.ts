import { z } from "zod";
import {
  detectPhiLikeText,
  TemplateIdSchema,
  type TemplateId,
} from "../shared/schema";

export const AiMaturitySchema = z.enum([
  "new_to_ai",
  "comfortable",
  "advanced",
]);
export type AiMaturity = z.infer<typeof AiMaturitySchema>;

export const DecisionGuideRequestSchema = z.object({
  question: z.string().trim().min(8).max(700),
  aiMaturity: AiMaturitySchema.default("new_to_ai"),
});
export type DecisionGuideRequest = z.infer<typeof DecisionGuideRequestSchema>;

export type DecisionGuideNextQuestion = {
  fieldId: string;
  label: string;
  prompt: string;
  example: string;
};

export type DecisionGuideResult = {
  status: "ready" | "needs_clarification";
  templateId?: TemplateId;
  templateTitle?: string;
  confidence: number;
  maturity: AiMaturity;
  plainAnswer: string;
  rationale: string;
  startPath?: string;
  nextQuestions: DecisionGuideNextQuestion[];
  simpleSteps: string[];
  safetyNotes: string[];
  alternatives: Array<{
    templateId: TemplateId;
    label: string;
    why: string;
  }>;
};

type SignalConfig = {
  title: string;
  terms: string[];
  nextQuestions: DecisionGuideNextQuestion[];
};

const TEMPLATE_SIGNALS: Record<TemplateId, SignalConfig> = {
  capacity: {
    title: "Capacity",
    terms: [
      "capacity",
      "waitlist",
      "waiting list",
      "intake",
      "new patient",
      "new client",
      "overbooked",
      "burnout",
      "exhausted",
      "schedule",
      "sessions",
      "visits",
      "panel",
      "hours",
      "availability",
    ],
    nextQuestions: [
      {
        fieldId: "weeklyVisitCount",
        label: "Visits each week",
        prompt: "How many visits do you usually complete in a week?",
        example: "Example: 32",
      },
      {
        fieldId: "waitlistWeeks",
        label: "Waitlist length",
        prompt: "How many weeks until the next available new-patient slot?",
        example: "Example: 6",
      },
      {
        fieldId: "burnoutRisk",
        label: "Burnout risk",
        prompt: "Is owner capacity currently low, moderate, or high risk?",
        example: "Example: moderate",
      },
    ],
  },
  pricing: {
    title: "Pricing",
    terms: [
      "price",
      "pricing",
      "fee",
      "fees",
      "rate",
      "rates",
      "insurance",
      "cash pay",
      "private pay",
      "income",
      "revenue",
      "cancellation",
      "retention",
      "affordability",
      "panel mix",
    ],
    nextQuestions: [
      {
        fieldId: "currentFee",
        label: "Current session fee",
        prompt: "What is your most common private-pay session fee?",
        example: "Example: 220",
      },
      {
        fieldId: "targetMonthlyIncomeGap",
        label: "Monthly income gap",
        prompt: "What monthly income gap are you trying to close?",
        example: "Example: 3500",
      },
      {
        fieldId: "priceSensitivity",
        label: "Patient price sensitivity",
        prompt: "Are recent price concerns low, moderate, or high?",
        example: "Example: moderate",
      },
    ],
  },
  "admin-hire": {
    title: "Admin hire",
    terms: [
      "admin",
      "assistant",
      "hire",
      "hiring",
      "virtual assistant",
      "va",
      "billing",
      "claims",
      "calls",
      "missed calls",
      "inbox",
      "paperwork",
      "scheduling",
      "delegate",
      "automation",
      "contractor",
    ],
    nextQuestions: [
      {
        fieldId: "adminHoursPerWeek",
        label: "Admin hours each week",
        prompt: "How many weekly hours go to non-clinical admin work?",
        example: "Example: 12",
      },
      {
        fieldId: "missedCallsPerWeek",
        label: "Missed calls each week",
        prompt: "How many patient or referral calls are likely missed weekly?",
        example: "Example: 8",
      },
      {
        fieldId: "monthlyBudget",
        label: "Monthly admin budget",
        prompt: "What monthly admin budget could you sustain for three months?",
        example: "Example: 1200",
      },
    ],
  },
};

const MATURITY_STEPS: Record<AiMaturity, string[]> = {
  new_to_ai: [
    "Use counts and categories only.",
    "Pick the closest answer instead of writing a long story.",
    "Run the intake, then read the recommendation and the fallback.",
  ],
  comfortable: [
    "State the tradeoff you care about most.",
    "Answer the six structured fields with recent business facts.",
    "Compare the recommendation with the robust alternative before acting.",
  ],
  advanced: [
    "Use the intake as the constraint set for the decision model.",
    "Review alternatives eliminated at Stage 2 or Stage 4.",
    "Inspect the method trace before exporting or sharing the decision.",
  ],
};

const MATURITY_ANSWER: Record<AiMaturity, string> = {
  new_to_ai:
    "Start with the closest template, answer only the short business questions, and avoid patient details.",
  comfortable:
    "Use the template to turn your question into a small tradeoff: what to protect, what to change, and what risk is acceptable.",
  advanced:
    "Treat the template as a lightweight decision model: inputs become constraints and weights, then the method trace shows why the recommendation won.",
};

function scoreQuestion(question: string): Array<{
  templateId: TemplateId;
  score: number;
}> {
  const lower = question.toLowerCase();
  return TemplateIdSchema.options
    .map((templateId) => {
      const score = TEMPLATE_SIGNALS[templateId].terms.reduce(
        (total, term) => total + (lower.includes(term) ? term.split(" ").length : 0),
        0,
      );
      return { templateId, score };
    })
    .sort((a, b) => b.score - a.score);
}

function alternativeReason(templateId: TemplateId): string {
  if (templateId === "capacity") {
    return "Use this if the main question is schedule load, waitlist pressure, or burnout.";
  }
  if (templateId === "pricing") {
    return "Use this if the main question is fees, insurance mix, income, or retention risk.";
  }
  return "Use this if the main question is admin load, missed calls, delegation, or automation.";
}

export function guideDecisionQuestion(
  request: DecisionGuideRequest,
): DecisionGuideResult {
  const parsed = DecisionGuideRequestSchema.parse(request);
  const phiReason = detectPhiLikeText(parsed.question);
  if (phiReason) {
    return {
      status: "needs_clarification",
      confidence: 0,
      maturity: parsed.aiMaturity,
      plainAnswer:
        "Remove patient names, contact details, dates of birth, record numbers, or clinical notes first.",
      rationale: `The question looks like it may contain ${phiReason}.`,
      nextQuestions: [],
      simpleSteps: [
        "Rewrite the question using business facts only.",
        "Use counts, time ranges, categories, and budget numbers.",
        "Then ask the guide again.",
      ],
      safetyNotes: ["Decision Doctor v1 does not accept PHI-shaped text."],
      alternatives: [],
    };
  }

  const scores = scoreQuestion(parsed.question);
  const [top, second] = scores;
  const topScore = top?.score ?? 0;
  const secondScore = second?.score ?? 0;

  if (!top || topScore === 0) {
    return {
      status: "needs_clarification",
      confidence: 20,
      maturity: parsed.aiMaturity,
      plainAnswer:
        "Choose the decision area first: capacity, pricing, or admin help.",
      rationale:
        "The question does not contain enough decision-specific signal yet.",
      nextQuestions: [
        {
          fieldId: "decisionArea",
          label: "Decision area",
          prompt: "Is the main pressure capacity, pricing, or admin work?",
          example: "Example: capacity",
        },
      ],
      simpleSteps: MATURITY_STEPS[parsed.aiMaturity],
      safetyNotes: ["Keep the question free of patient-specific information."],
      alternatives: TemplateIdSchema.options.map((templateId) => ({
        templateId,
        label: TEMPLATE_SIGNALS[templateId].title,
        why: alternativeReason(templateId),
      })),
    };
  }

  const confidence = Math.min(95, 55 + topScore * 10 + Math.max(0, topScore - secondScore) * 5);
  const selected = TEMPLATE_SIGNALS[top.templateId];

  return {
    status: "ready",
    templateId: top.templateId,
    templateTitle: selected.title,
    confidence,
    maturity: parsed.aiMaturity,
    plainAnswer: MATURITY_ANSWER[parsed.aiMaturity],
    rationale: alternativeReason(top.templateId),
    startPath: `/app/decisions/new/${top.templateId}`,
    nextQuestions: selected.nextQuestions,
    simpleSteps: MATURITY_STEPS[parsed.aiMaturity],
    safetyNotes: [
      "Use business facts only.",
      "Do not include patient names, dates of birth, contact details, record numbers, or clinical notes.",
    ],
    alternatives: scores
      .filter((candidate) => candidate.templateId !== top.templateId)
      .slice(0, 2)
      .map((candidate) => ({
        templateId: candidate.templateId,
        label: TEMPLATE_SIGNALS[candidate.templateId].title,
        why: alternativeReason(candidate.templateId),
      })),
  };
}
