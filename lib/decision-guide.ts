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
  chips: string[];
};

export type DecisionGuideAssumption = {
  topic: string;
  value: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
  challengePrompt: string;
};

export type DecisionFrameworkType = "SED" | "GDD" | "VDD" | "EDD" | "TCLD";

export type DecisionGuideFramework = {
  id: string;
  name: string;
  decisionType: DecisionFrameworkType;
  lens: string;
  why: string;
  methods: string[];
  criteria: Array<{
    id: string;
    label: string;
    why: string;
  }>;
  candidateOptions: string[];
  constraintPrompts: string[];
  aiWorkflowIdeas: Array<{
    title: string;
    description: string;
    permissionTier: "T0" | "T1" | "T2";
  }>;
  researchBasis: string[];
};

export type DecisionGuideChat = {
  assistantMessage: string;
  nextQuestion: string;
  quickReplies: string[];
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
  primaryQuestion?: DecisionGuideNextQuestion;
  progressLabel: string;
  inferredAssumptions: DecisionGuideAssumption[];
  framework: DecisionGuideFramework;
  chat: DecisionGuideChat;
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
  inferredAssumptions: DecisionGuideAssumption[];
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
        chips: ["Under 24", "24-32", "33-40", "More than 40"],
      },
      {
        fieldId: "waitlistWeeks",
        label: "Waitlist length",
        prompt: "How many weeks until the next available new-patient slot?",
        example: "Example: 6",
        chips: ["0-2 weeks", "3-5 weeks", "6-8 weeks", "9+ weeks"],
      },
      {
        fieldId: "burnoutRisk",
        label: "Burnout risk",
        prompt: "Is owner capacity currently low, moderate, or high risk?",
        example: "Example: moderate",
        chips: ["Low", "Moderate", "High"],
      },
    ],
    inferredAssumptions: [
      {
        topic: "Primary risk",
        value: "Access pressure is competing with owner capacity.",
        confidence: "high",
        rationale: "Capacity language usually turns on waitlist, schedule, and burnout facts.",
        challengePrompt: "This is not mainly a capacity problem.",
      },
      {
        topic: "Safe default",
        value: "Use weekly counts and categories before narrative detail.",
        confidence: "high",
        rationale: "The PRD keeps v1 decisions free of patient-specific details.",
        challengePrompt: "I need a different kind of business fact here.",
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
        chips: ["Under $150", "$150-$199", "$200-$249", "$250+"],
      },
      {
        fieldId: "targetMonthlyIncomeGap",
        label: "Monthly income gap",
        prompt: "What monthly income gap are you trying to close?",
        example: "Example: 3500",
        chips: ["Under $1k", "$1k-$3k", "$3k-$5k", "$5k+"],
      },
      {
        fieldId: "priceSensitivity",
        label: "Patient price sensitivity",
        prompt: "Are recent price concerns low, moderate, or high?",
        example: "Example: moderate",
        chips: ["Low", "Moderate", "High"],
      },
    ],
    inferredAssumptions: [
      {
        topic: "Primary risk",
        value: "Revenue, access, and retention are the tradeoff.",
        confidence: "high",
        rationale: "Pricing language usually turns on fee, insurance, and retention facts.",
        challengePrompt: "This is not mainly a pricing problem.",
      },
      {
        topic: "Safe default",
        value: "Use recent business numbers before patient stories.",
        confidence: "medium",
        rationale: "The intake can compare options without knowing patient identities.",
        challengePrompt: "The relevant fact is not captured by fees or retention.",
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
        chips: ["Under 5", "5-10", "11-15", "16+"],
      },
      {
        fieldId: "missedCallsPerWeek",
        label: "Missed calls each week",
        prompt: "How many patient or referral calls are likely missed weekly?",
        example: "Example: 8",
        chips: ["0-2", "3-5", "6-10", "11+"],
      },
      {
        fieldId: "monthlyBudget",
        label: "Monthly admin budget",
        prompt: "What monthly admin budget could you sustain for three months?",
        example: "Example: 1200",
        chips: ["Under $500", "$500-$999", "$1k-$2k", "$2k+"],
      },
    ],
    inferredAssumptions: [
      {
        topic: "Primary risk",
        value: "Admin load is competing with clinical time and response quality.",
        confidence: "high",
        rationale: "Delegation language usually turns on admin hours, calls, and budget.",
        challengePrompt: "This is not mainly an admin delegation problem.",
      },
      {
        topic: "Safe default",
        value: "Compare hire, automate, and defer before committing spend.",
        confidence: "medium",
        rationale: "The decision has budget and reversibility implications.",
        challengePrompt: "I already know the option set is different.",
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

const RESEARCH_BASIS = [
  "Start with values before ranking options.",
  "Use hard constraints as vetoes before tradeoff questions.",
  "Ask low-burden pairwise or chip questions to expose preferences.",
  "Rank only a small shortlist and keep a robust fallback visible.",
];

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

function baseFramework(
  overrides: Omit<DecisionGuideFramework, "researchBasis">,
): DecisionGuideFramework {
  return {
    ...overrides,
    researchBasis: RESEARCH_BASIS,
  };
}

function templateFramework(templateId: TemplateId): DecisionGuideFramework {
  if (templateId === "capacity") {
    return baseFramework({
      id: "capacity-mcda",
      name: "Capacity MCDA framework",
      decisionType: "SED",
      lens: "Finite practice-capacity options with high-consequence tradeoffs.",
      why: "The known option set can be filtered by owner capacity, access pressure, revenue stability, and reversibility.",
      methods: [
        "VFT to name the objective: access without overload.",
        "Fast-and-frugal vetoes for burnout and schedule limits.",
        "PAPRIKA-style tradeoffs across access, capacity, revenue, speed, and reversibility.",
        "TOPSIS-style ranking with minimax-regret fallback.",
      ],
      criteria: [
        {
          id: "patient_access",
          label: "Patient access",
          why: "Waitlist pressure decides how costly it is to restrict demand.",
        },
        {
          id: "owner_capacity",
          label: "Owner capacity",
          why: "Burnout risk is a non-negotiable constraint for a solo practice.",
        },
        {
          id: "reversibility",
          label: "Reversibility",
          why: "Temporary capacity moves should be easy to adjust after fresh data.",
        },
      ],
      candidateOptions: [
        "Cap new intakes temporarily",
        "Add one protected clinical block",
        "Buy back admin time first",
        "Use pricing to slow excess demand",
      ],
      constraintPrompts: [
        "What is the maximum weekly visit load you can sustain for four weeks?",
        "What waitlist length creates an access problem?",
        "Which option would you reject if burnout risk stayed high?",
      ],
      aiWorkflowIdeas: [
        {
          title: "Waitlist update draft",
          description: "Use AI to draft a non-PHI practice update for intake availability.",
          permissionTier: "T0",
        },
        {
          title: "Scheduling rules checklist",
          description: "Turn the recommendation into a one-week calendar and intake-rule playbook.",
          permissionTier: "T1",
        },
        {
          title: "Demand review prompt",
          description: "Summarize weekly inquiry counts and cancellations before changing capacity again.",
          permissionTier: "T1",
        },
      ],
    });
  }

  if (templateId === "pricing") {
    return baseFramework({
      id: "pricing-access-framework",
      name: "Pricing and access framework",
      decisionType: "SED",
      lens: "Finite pricing moves where revenue, retention, access, and admin load trade off.",
      why: "Pricing decisions need visible tradeoffs because a revenue gain can create retention or access risk.",
      methods: [
        "VFT to separate income goals from access commitments.",
        "Constraint filter for insurance mix and admin tolerance.",
        "Pairwise tradeoff questions for income lift versus retention protection.",
        "Weighted ranking with a robust fallback if demand changes.",
      ],
      criteria: [
        {
          id: "income_lift",
          label: "Income lift",
          why: "The decision must close a real monthly gap, not just optimize price in abstract.",
        },
        {
          id: "retention_risk",
          label: "Retention protection",
          why: "Continuity risk constrains how aggressive the pricing move can be.",
        },
        {
          id: "admin_load",
          label: "Admin simplicity",
          why: "Billing complexity can erase the capacity benefit of a pricing change.",
        },
      ],
      candidateOptions: [
        "Raise the standard fee",
        "Apply changes to new patients first",
        "Tighten cancellation or documentation policy",
        "Hold fees and improve utilization",
      ],
      constraintPrompts: [
        "Which patients or payers can the price change realistically affect?",
        "What monthly gap has to close for this to be worth the disruption?",
        "What level of attrition or access friction would make the change unacceptable?",
      ],
      aiWorkflowIdeas: [
        {
          title: "Pricing notice draft",
          description: "Use AI to draft clear, calm pricing language without patient details.",
          permissionTier: "T0",
        },
        {
          title: "FAQ response bank",
          description: "Generate short answers for likely billing and continuity questions.",
          permissionTier: "T0",
        },
        {
          title: "30-day review checklist",
          description: "Create a simple review ritual for volume, cancellations, and admin burden.",
          permissionTier: "T1",
        },
      ],
    });
  }

  return baseFramework({
    id: "admin-automation-framework",
    name: "Admin delegation and automation framework",
    decisionType: "GDD",
    lens: "A generative workflow decision: build the lightest operating model that returns owner time safely.",
    why: "The best answer may be a hire, an automation, an SOP, or a staged combination rather than one fixed option.",
    methods: [
      "VFT to define which owner hours should be protected.",
      "RGT-style construct discovery for what feels safe to delegate.",
      "Constraint filter for budget, process clarity, and privacy comfort.",
      "Minimax-regret guard before committing recurring spend.",
    ],
    criteria: [
      {
        id: "time_return",
        label: "Owner time return",
        why: "The decision should free clinical or personal capacity, not just move work around.",
      },
      {
        id: "privacy_fit",
        label: "Privacy fit",
        why: "Delegation and automation must stay inside bounded operational access.",
      },
      {
        id: "implementation_speed",
        label: "Implementation speed",
        why: "A solo practice needs relief without a long project cycle.",
      },
    ],
    candidateOptions: [
      "Automate scheduling and intake first",
      "Hire a part-time healthcare VA",
      "Contract a billing specialist",
      "Document SOPs before delegating",
    ],
    constraintPrompts: [
      "Which tasks repeat every week and do not require clinical judgment?",
      "Which systems would a helper or automation need to touch?",
      "What is the smallest safe experiment for the next 14 days?",
    ],
    aiWorkflowIdeas: [
      {
        title: "Admin SOP generator",
        description: "Turn a repeated task into a step-by-step SOP with approval boundaries.",
        permissionTier: "T1",
      },
      {
        title: "Inbox triage drafts",
        description: "Draft non-PHI response templates for scheduling and routine admin messages.",
        permissionTier: "T0",
      },
      {
        title: "Automation shortlist",
        description: "Compare low-risk tools or scripts before hiring recurring help.",
        permissionTier: "T1",
      },
    ],
  });
}

function hasAny(lower: string, terms: string[]): boolean {
  return terms.some((term) => lower.includes(term));
}

function classifyGeneralDecision(question: string): DecisionFrameworkType {
  const lower = question.toLowerCase();
  if (hasAny(lower, ["urgent", "today", "tomorrow", "this week", "immediately", "crisis"])) {
    return "TCLD";
  }
  if (hasAny(lower, ["values", "mission", "identity", "boundaries", "life", "meaning"])) {
    return "VDD";
  }
  if (hasAny(lower, ["ai", "automate", "workflow", "free up", "save time", "reduce work", "where should i start"])) {
    return "EDD";
  }
  if (hasAny(lower, ["build", "design", "create", "plan", "offer", "program", "service line"])) {
    return "GDD";
  }
  if (hasAny(lower, ["choose", "select", "buy", "vendor", "software", "platform", "tool", "contract"])) {
    return "SED";
  }
  return "EDD";
}

function generalFramework(question: string): DecisionGuideFramework {
  const decisionType = classifyGeneralDecision(question);
  const isAiWorkflow = decisionType === "EDD" || /\b(ai|automate|workflow|save time|free up)\b/i.test(question);
  const name = isAiWorkflow
    ? "AI workflow opportunity framework"
    : "Custom practice decision framework";

  return baseFramework({
    id: isAiWorkflow ? "ai-workflow-opportunity" : `custom-${decisionType.toLowerCase()}`,
    name,
    decisionType,
    lens:
      decisionType === "SED"
        ? "A finite option decision that should be filtered before ranking."
        : "A custom practice decision that needs values, constraints, and candidate options defined before ranking.",
    why:
      "The question does not need to force-fit into capacity, pricing, or admin hire. It can still use the same decision-science spine: values, constraints, tradeoffs, shortlist, fallback.",
    methods: [
      "VFT to define the outcome the doctor actually wants.",
      "Fast-and-frugal vetoes for compliance, time, budget, and reversibility.",
      "RGT-style discovery if the criteria are still unclear.",
      "Pairwise tradeoff questions before any final recommendation.",
      "Minimax-regret fallback when confidence is not high enough.",
    ],
    criteria: [
      {
        id: "capacity_return",
        label: "Capacity returned",
        why: "The app should favor options that free owner time or reduce avoidable work.",
      },
      {
        id: "risk_control",
        label: "Risk control",
        why: "Healthcare-adjacent workflows need bounded access and no PHI in v1.",
      },
      {
        id: "setup_burden",
        label: "Setup burden",
        why: "A useful workflow must fit between patient care and practice operations.",
      },
      {
        id: "reversibility",
        label: "Reversibility",
        why: "Low-regret experiments are safer than irreversible operational changes.",
      },
    ],
    candidateOptions: isAiWorkflow
      ? [
          "Automate a repeated admin draft",
          "Create an SOP and checklist",
          "Use AI to summarize business counts",
          "Defer automation until the workflow is clearer",
        ]
      : [
          "Run a small reversible experiment",
          "Choose the lowest-risk option that meets constraints",
          "Collect one more high-value data point",
          "Defer if the downside is not bounded",
        ],
    constraintPrompts: [
      "What outcome would make this decision feel like a win?",
      "What would make an option unacceptable regardless of upside?",
      "What repeated task or decision step currently consumes the most owner time?",
      "What is the smallest reversible test you could run in two weeks?",
    ],
    aiWorkflowIdeas: [
      {
        title: "Workflow triage prompt",
        description: "List repeated tasks, time cost, risk, and whether AI can draft, summarize, or check them.",
        permissionTier: "T0",
      },
      {
        title: "SOP-first automation",
        description: "Ask AI to turn the current process into a checklist before choosing tools.",
        permissionTier: "T1",
      },
      {
        title: "Low-risk draft assistant",
        description: "Use AI only for drafts or summaries until the practice validates access boundaries.",
        permissionTier: "T1",
      },
    ],
  });
}

function frameworkQuestion(framework: DecisionGuideFramework): DecisionGuideNextQuestion {
  const firstConstraint = framework.constraintPrompts[0] ?? "What is the most important outcome?";
  return {
    fieldId: "frameworkAnchor",
    label: "Framework anchor",
    prompt: firstConstraint,
    example: "Example: free three admin hours per week without adding privacy risk",
    chips: framework.criteria.slice(0, 4).map((criterion) => criterion.label),
  };
}

function frameworkAssumptions(framework: DecisionGuideFramework): DecisionGuideAssumption[] {
  return [
    {
      topic: "Decision type",
      value: `${framework.decisionType}: ${framework.lens}`,
      confidence: "medium",
      rationale: "The router uses the user's wording to choose the lightest rigorous decision pipeline.",
      challengePrompt: "This decision needs a different framework type.",
    },
    {
      topic: "Automation guardrail",
      value: "Start with drafts, summaries, SOPs, and checklists before granting tool access.",
      confidence: "high",
      rationale: "The PRD keeps v1 non-PHI and user-executed; automation should reduce workload without hidden actions.",
      challengePrompt: "This workflow already has approved operational access.",
    },
  ];
}

function chatForResult(
  framework: DecisionGuideFramework,
  maturity: AiMaturity,
  templateTitle?: string,
): DecisionGuideChat {
  const target = templateTitle ?? framework.name;
  const maturityCue =
    maturity === "new_to_ai"
      ? "I will keep this to plain questions and safe next steps."
      : "I will keep the method visible so you can inspect the tradeoffs.";

  return {
    assistantMessage: `${target} is the best starting frame. ${maturityCue}`,
    nextQuestion: framework.constraintPrompts[0] ?? "What outcome matters most?",
    quickReplies: framework.candidateOptions.slice(0, 4),
  };
}

export function guideDecisionQuestion(
  request: DecisionGuideRequest,
): DecisionGuideResult {
  const parsed = DecisionGuideRequestSchema.parse(request);
  const phiReason = detectPhiLikeText(parsed.question);
  if (phiReason) {
    const framework = baseFramework({
      id: "safe-rewrite",
      name: "Safe rewrite frame",
      decisionType: "TCLD",
      lens: "The first decision is whether the question is safe to process.",
      why: "No decision framework should run until patient identifiers and clinical details are removed.",
      methods: [
        "PHI veto before any preference elicitation.",
        "Business-fact rewrite using counts and categories.",
        "Restart routing after the safe rewrite.",
      ],
      criteria: [
        {
          id: "safe_input",
          label: "Safe input",
          why: "The app cannot accept patient identifiers or clinical narrative in v1.",
        },
      ],
      candidateOptions: ["Rewrite with business facts", "Remove identifiers", "Ask again"],
      constraintPrompts: ["Can you rewrite this using only counts, categories, time ranges, and budget numbers?"],
      aiWorkflowIdeas: [
        {
          title: "Safe rewrite checklist",
          description: "Convert patient-specific text into operational categories before using the app.",
          permissionTier: "T0",
        },
      ],
    });
    return {
      status: "needs_clarification",
      confidence: 0,
      maturity: parsed.aiMaturity,
      plainAnswer:
        "Remove patient names, contact details, dates of birth, record numbers, or clinical notes first.",
      rationale: `The question looks like it may contain ${phiReason}.`,
      nextQuestions: [],
      progressLabel: "Clarify before intake",
      inferredAssumptions: [],
      framework,
      chat: {
        assistantMessage:
          "I cannot process that version safely. Rewrite it as a business decision without patient identifiers.",
        nextQuestion: framework.constraintPrompts[0] ?? "Can you rewrite the question safely?",
        quickReplies: framework.candidateOptions,
      },
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

  if (!top || topScore < 2) {
    const framework = generalFramework(parsed.question);
    const primaryQuestion = frameworkQuestion(framework);
    return {
      status: "ready",
      confidence: 62,
      maturity: parsed.aiMaturity,
      plainAnswer: `Use a custom ${framework.decisionType} framework instead of forcing this into one of the three starter templates.`,
      rationale:
        "Decision-science routing says the app should first define values, veto constraints, candidate options, and the smallest safe automation or operating experiment.",
      nextQuestions: [primaryQuestion],
      primaryQuestion,
      progressLabel: "Custom framework: 1 of 4 anchors",
      inferredAssumptions: frameworkAssumptions(framework),
      framework,
      chat: chatForResult(framework, parsed.aiMaturity),
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
  const framework = templateFramework(top.templateId);

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
    primaryQuestion: selected.nextQuestions[0],
    progressLabel: `1 of ${selected.nextQuestions.length} intake anchors`,
    inferredAssumptions: selected.inferredAssumptions,
    framework,
    chat: chatForResult(framework, parsed.aiMaturity, selected.title),
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
