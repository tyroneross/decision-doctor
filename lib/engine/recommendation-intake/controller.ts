import "server-only";

import { z } from "zod";
import {
  DecisionTemplateHintSchema,
  PainPathIdSchema,
  RecommendationInputSchema,
  RecommendationIntakeActionSchema,
  RecommendationIntakeFillSchema,
  RecommendationIntakeQuestionSchema,
  RecommendationIntakeStateSchema,
  type DecisionTemplateHint,
  type PainPathId,
  type RecommendationInput,
  type RecommendationIntakeAction,
  type RecommendationIntakeAssumption,
  type RecommendationIntakeBlockingScore,
  type RecommendationIntakeFill,
  type RecommendationIntakeQuestion,
  type RecommendationIntakeState,
} from "@/shared/schema";
import { classifyPainPath } from "@/lib/engine/pain-path/classifier";
import {
  detectDecisionIntent,
  type DecisionDetection,
} from "@/lib/chat/decision-detector";

const MAX_ASKED_QUESTIONS = 7;
const ASK_THRESHOLD = 8;

/**
 * Hiring/delegation keyword shortlist. Harvested from branch-codex's
 * decision-guide.ts admin-hire signal config — captures the surface forms
 * of "should I hire X" questions before any LLM call.
 *
 * Two-stage gate: this keyword regex is the cheap pre-filter. When it fires
 * positive, the controller calls detectDecisionIntent() (a ~200ms Groq call)
 * to confirm the question is decision-shaped. When the regex misses, no Groq
 * call is made.
 */
const HIRING_KEYWORD_PATTERN =
  /\b(hire|hiring|hir(e|ing) an?|delegate|outsource|contract(or)?|virtual assistant|\bva\b|admin (assistant|hire|support)|biller|biller|associate|w-?2|1099)\b/i;

const HIRING_DRIVER_OPTIONS = [
  { value: "too_many_calls", label: "Too many calls" },
  { value: "after_hours_messages", label: "After-hours messages" },
  { value: "missed_follow_ups", label: "Missed follow-ups" },
  { value: "no_vacation", label: "Can't take vacation" },
  { value: "recent_mistake", label: "Recent mistake" },
  { value: "other", label: "Other" },
];

/**
 * Pure pre-filter: does the free-text challenge look like a hiring/delegation
 * question? Cheap synchronous regex check; no I/O.
 */
export function isHiringShapedChallenge(text: string | undefined): boolean {
  if (!text) return false;
  return HIRING_KEYWORD_PATTERN.test(text);
}

export const RecommendationIntakeNextInputSchema = z.object({
  state: RecommendationIntakeStateSchema.optional(),
  challengeText: z.string().min(1).max(800).optional(),
  painPath: PainPathIdSchema.optional(),
  goal: z.string().min(1).max(400).optional(),
}).superRefine((value, ctx) => {
  if (!value.state && !value.challengeText?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["challengeText"],
      message: "challengeText is required when state is not provided.",
    });
  }
});

export const RecommendationIntakeAnswerInputSchema = z.object({
  state: RecommendationIntakeStateSchema,
  question: RecommendationIntakeQuestionSchema,
  display: z.string().min(1).max(240),
  raw: z.union([z.string().max(240), z.number().finite()]),
});

export type RecommendationIntakeNextInput = z.infer<
  typeof RecommendationIntakeNextInputSchema
>;
export type RecommendationIntakeAnswerInput = z.infer<
  typeof RecommendationIntakeAnswerInputSchema
>;

interface CandidateUnknown {
  topic: string;
  fill: RecommendationIntakeFill;
  blockingScore: RecommendationIntakeBlockingScore;
  question?: RecommendationIntakeQuestion;
  defaultValue?: string | number;
  defaultConfidence?: RecommendationIntakeAssumption["confidence"];
  defaultRationale?: string;
  challengePrompt?: string;
}

const PAIN_PATH_OPTIONS = [
  { value: "referrals", label: "Grow or manage referrals" },
  { value: "research", label: "Keep up with research" },
  { value: "admin", label: "Reduce admin overload" },
  { value: "capacity_growth", label: "Plan capacity or pricing" },
  { value: "follow_up", label: "Improve patient follow-up" },
  { value: "custom", label: "Something else" },
];

function buildInitialState(input: RecommendationIntakeNextInput): RecommendationIntakeState {
  if (input.state) {
    return RecommendationIntakeStateSchema.parse(input.state);
  }

  return RecommendationIntakeStateSchema.parse({
    challengeText: input.challengeText,
    ...(input.painPath ? { painPath: input.painPath } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
    scoringInput: {},
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function hasFilled(state: RecommendationIntakeState, path: string): boolean {
  if (state.filledPaths.includes(path)) return true;
  if (path === "painPath") return Boolean(state.painPath);
  if (path === "goal") return Boolean(state.goal);
  if (path.startsWith("scoringInput.")) {
    const key = path.slice("scoringInput.".length) as keyof NonNullable<
      RecommendationInput["scoringInput"]
    >;
    return typeof state.scoringInput?.[key] === "number";
  }
  return false;
}

function score(
  topic: string,
  evidenceGap: number,
  reversibility: number,
  risk: number,
  reason: string,
): RecommendationIntakeBlockingScore {
  const blocking = evidenceGap + reversibility + risk;
  return {
    topic,
    evidenceGap,
    reversibility,
    risk,
    blocking,
    decision: blocking >= ASK_THRESHOLD ? "ask" : "infer",
    reason,
  };
}

function chipsQuestion(args: {
  id: string;
  topic: string;
  prompt: string;
  fieldId: string;
  label: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  fill: RecommendationIntakeFill;
  blockingScore: RecommendationIntakeBlockingScore;
}): RecommendationIntakeQuestion {
  return RecommendationIntakeQuestionSchema.parse({
    id: args.id,
    topic: args.topic,
    prompt: args.prompt,
    widget: {
      kind: "chips",
      fieldId: args.fieldId,
      label: args.label,
      ...(args.hint ? { hint: args.hint } : {}),
      options: args.options,
      ...(args.defaultValue ? { defaultValue: args.defaultValue } : {}),
    },
    fills: args.fill,
    blockingScore: args.blockingScore,
  });
}

function maybeAssumption(
  state: RecommendationIntakeState,
  topic: string,
): RecommendationIntakeAssumption | null {
  return state.assumptions.find((a) => a.topic === topic) ?? null;
}

function inferGoal(state: RecommendationIntakeState): string {
  const path = state.painPath ?? "custom";
  const label = path.replace("_", " ");
  return `Reduce time and friction around ${label} work while keeping patient information out of AI tools.`;
}

function buildUnknowns(state: RecommendationIntakeState): CandidateUnknown[] {
  const unknowns: CandidateUnknown[] = [];

  if (!hasFilled(state, "painPath")) {
    const fill = RecommendationIntakeFillSchema.parse({
      path: "painPath",
      kind: "pain_path",
      mergeStrategy: "replace",
    });
    const blockingScore = score(
      "pain_path",
      5,
      5,
      3,
      "The pain path controls which use cases and safety guardrails Aida retrieves.",
    );
    unknowns.push({
      topic: "pain_path",
      fill,
      blockingScore,
      question: chipsQuestion({
        id: "pain-path",
        topic: "pain_path",
        prompt: "Pick the closest area so Aida can retrieve the right use cases.",
        fieldId: "painPath",
        label: "Which area does this affect most?",
        hint: "Choose the closest match. You can still describe edge cases later.",
        options: PAIN_PATH_OPTIONS,
        fill,
        blockingScore,
      }),
    });
  }

  // S2.C2 — WHY-first driver question for hiring-shaped challenges.
  // Fires before frequency/time_burden so the user is asked "what's driving
  // this?" before "how often does it come up?". Stored as a free-form
  // assumption on `state.goal` so it doesn't need a new scoringInput field.
  const hiringShaped =
    isHiringShapedChallenge(state.challengeText) &&
    (state.painPath === "admin" ||
      state.painPath === "custom" ||
      state.painPath === "capacity_growth");
  if (
    hiringShaped &&
    !state.askedTopics.includes("hiring_driver") &&
    !maybeAssumption(state, "hiring_driver")
  ) {
    // Synthetic path — applyPath() falls through to a no-op record on
    // unrecognized paths, so the answer is captured in state.answers[]
    // and state.filledPaths[] without mutating painPath/goal/scoringInput.
    const fill = RecommendationIntakeFillSchema.parse({
      path: "meta.hiringDriver",
      kind: "string",
      mergeStrategy: "replace",
    });
    const blockingScore = score(
      "hiring_driver",
      5,
      4,
      3,
      "The driving cause shapes whether to hire, automate, or restructure — first-question quality matters more than frequency for hiring decisions.",
    );
    unknowns.push({
      topic: "hiring_driver",
      fill,
      blockingScore,
      question: chipsQuestion({
        id: "hiring-driver",
        topic: "hiring_driver",
        prompt:
          "What's driving the need? Pick the closest match.",
        fieldId: "hiringDriver",
        label: "What's driving this?",
        hint: "We use this to frame the hire/automate/defer tradeoff before asking about frequency.",
        options: HIRING_DRIVER_OPTIONS,
        fill,
        blockingScore,
      }),
    });
  }

  if (!hasFilled(state, "scoringInput.frequency")) {
    const fill = RecommendationIntakeFillSchema.parse({
      path: "scoringInput.frequency",
      kind: "number",
      mergeStrategy: "replace",
    });
    const blockingScore = score(
      "frequency",
      4,
      4,
      2,
      "Frequency is a high-leverage input for whether automation is worth trying.",
    );
    unknowns.push({
      topic: "frequency",
      fill,
      blockingScore,
      question: chipsQuestion({
        id: "frequency",
        topic: "frequency",
        prompt: "Estimate how often the pain shows up.",
        fieldId: "frequency",
        label: "How often does this challenge come up?",
        hint: "A rough estimate is enough.",
        options: [
          { value: "0.25", label: "Monthly or less" },
          { value: "0.5", label: "Weekly" },
          { value: "0.75", label: "Several times a week" },
          { value: "1", label: "Daily" },
        ],
        defaultValue: "0.5",
        fill,
        blockingScore,
      }),
    });
  }

  if (!hasFilled(state, "scoringInput.timeBurden")) {
    const fill = RecommendationIntakeFillSchema.parse({
      path: "scoringInput.timeBurden",
      kind: "number",
      mergeStrategy: "replace",
    });
    const blockingScore = score(
      "time_burden",
      4,
      3,
      2,
      "Time burden helps rank quick wins against larger workflow changes.",
    );
    unknowns.push({
      topic: "time_burden",
      fill,
      blockingScore,
      question: chipsQuestion({
        id: "time-burden",
        topic: "time_burden",
        prompt: "Estimate the time burden per occurrence.",
        fieldId: "timeBurden",
        label: "How much time does it usually take?",
        hint: "Pick the closest option.",
        options: [
          { value: "0.2", label: "Under 15 minutes" },
          { value: "0.5", label: "15 to 60 minutes" },
          { value: "0.75", label: "1 to 3 hours" },
          { value: "1", label: "More than 3 hours" },
        ],
        defaultValue: "0.5",
        fill,
        blockingScore,
      }),
    });
  }

  if (!hasFilled(state, "scoringInput.painSeverity")) {
    const fill = RecommendationIntakeFillSchema.parse({
      path: "scoringInput.painSeverity",
      kind: "number",
      mergeStrategy: "replace",
    });
    const blockingScore = score(
      "pain_severity",
      3,
      3,
      2,
      "Severity separates mild annoyances from bottlenecks worth acting on now.",
    );
    unknowns.push({
      topic: "pain_severity",
      fill,
      blockingScore,
      question: chipsQuestion({
        id: "pain-severity",
        topic: "pain_severity",
        prompt: "Estimate how much this slows the practice down.",
        fieldId: "painSeverity",
        label: "How much does this slow your practice down?",
        hint: "Your gut read is enough.",
        options: [
          { value: "0.2", label: "Minor inconvenience" },
          { value: "0.5", label: "Noticeable friction" },
          { value: "0.75", label: "Real drag on my day" },
          { value: "1", label: "Serious bottleneck" },
        ],
        defaultValue: "0.5",
        fill,
        blockingScore,
      }),
    });
  }

  const inferred: Array<{
    topic: string;
    path: string;
    value: string | number;
    confidence: RecommendationIntakeAssumption["confidence"];
    rationale: string;
    challengePrompt: string;
    score: RecommendationIntakeBlockingScore;
  }> = [
    {
      topic: "goal",
      path: "goal",
      value: state.goal ?? inferGoal(state),
      confidence: "medium",
      rationale: "The stated pain is enough to form a practical first-session goal.",
      challengePrompt: "Tell Aida the specific outcome you want instead.",
      score: score("goal", 3, 2, 1, "Goal can be inferred safely from the pain statement."),
    },
    {
      topic: "risk_tolerance",
      path: "scoringInput.riskTolerance",
      value: 0.4,
      confidence: "medium",
      rationale: "Healthcare workflows should start cautious unless the user says otherwise.",
      challengePrompt: "Tell Aida you are comfortable with a more experimental starting point.",
      score: score("risk_tolerance", 3, 2, 1, "Defaulting cautious is safer than asking every user."),
    },
    {
      topic: "ai_comfort",
      path: "scoringInput.aiComfort",
      value: 0.5,
      confidence: "medium",
      rationale: "Moderate AI comfort keeps the first recommendation usable without overfitting to skill level.",
      challengePrompt: "Tell Aida if you are brand new to AI or already advanced.",
      score: score("ai_comfort", 2, 2, 1, "AI comfort can be inferred as moderate for the first pass."),
    },
    {
      topic: "data_readiness",
      path: "scoringInput.dataReadiness",
      value: 0.5,
      confidence: "low",
      rationale: "Aida assumes some safe non-PHI context is available, but not enough for full automation.",
      challengePrompt: "Tell Aida what safe data or templates you already have.",
      score: score("data_readiness", 3, 2, 1, "Neutral data readiness avoids pretending the user has clean data."),
    },
  ];

  for (const item of inferred) {
    if (hasFilled(state, item.path) || maybeAssumption(state, item.topic)) {
      continue;
    }
    unknowns.push({
      topic: item.topic,
      fill: RecommendationIntakeFillSchema.parse({
        path: item.path,
        kind: typeof item.value === "number" ? "number" : "string",
        mergeStrategy: "replace",
      }),
      blockingScore: item.score,
      defaultValue: item.value,
      defaultConfidence: item.confidence,
      defaultRationale: item.rationale,
      challengePrompt: item.challengePrompt,
    });
  }

  return unknowns.filter((u) => !state.askedTopics.includes(u.topic));
}

function applyPath(
  state: RecommendationIntakeState,
  fill: RecommendationIntakeFill,
  value: string | number,
): RecommendationIntakeState {
  const next = RecommendationIntakeStateSchema.parse({
    ...state,
    scoringInput: { ...(state.scoringInput ?? {}) },
    answers: [...state.answers],
    assumptions: [...state.assumptions],
    askedTopics: [...state.askedTopics],
    filledPaths: [...state.filledPaths],
  });

  if (fill.path === "painPath") {
    const parsed = PainPathIdSchema.safeParse(value);
    if (parsed.success) next.painPath = parsed.data;
  } else if (fill.path === "goal") {
    if (typeof value === "string" && value.trim()) {
      next.goal = value.trim().slice(0, 400);
    }
  } else if (fill.path.startsWith("scoringInput.")) {
    const key = fill.path.slice("scoringInput.".length) as keyof NonNullable<
      RecommendationInput["scoringInput"]
    >;
    next.scoringInput = {
      ...(next.scoringInput ?? {}),
      [key]: clamp01(typeof value === "number" ? value : Number(value)),
    };
  }

  if (!next.filledPaths.includes(fill.path)) {
    next.filledPaths.push(fill.path);
  }

  return RecommendationIntakeStateSchema.parse(next);
}

function addAssumptions(
  state: RecommendationIntakeState,
  unknowns: CandidateUnknown[],
): RecommendationIntakeState {
  let next = state;
  for (const u of unknowns) {
    if (u.defaultValue === undefined || maybeAssumption(next, u.topic)) continue;
    next = applyPath(next, u.fill, u.defaultValue);
    next.assumptions.push({
      topic: u.topic,
      path: u.fill.path,
      value: u.defaultValue,
      confidence: u.defaultConfidence ?? "medium",
      rationale: u.defaultRationale ?? u.blockingScore.reason,
      challengePrompt:
        u.challengePrompt ?? "Tell Aida if this assumption should change.",
    });
  }
  return RecommendationIntakeStateSchema.parse(next);
}

async function classifyIntoState(
  state: RecommendationIntakeState,
): Promise<RecommendationIntakeState> {
  if (state.painPath) return state;

  const classification = await classifyPainPath({
    challenge: state.challengeText,
  });

  if (classification.confidence < 0.7 || classification.path === "custom") {
    return state;
  }

  const fill = RecommendationIntakeFillSchema.parse({
    path: "painPath",
    kind: "pain_path",
    mergeStrategy: "replace",
  });
  const next = applyPath(state, fill, classification.path);
  next.assumptions.push({
    topic: "pain_path",
    path: "painPath",
    value: classification.path,
    confidence: classification.confidence >= 0.85 ? "high" : "medium",
    rationale: "Aida inferred the closest pain path from the challenge wording.",
    challengePrompt: "Choose a different pain path if this is not the right fit.",
  });
  return RecommendationIntakeStateSchema.parse(next);
}

function progress(state: RecommendationIntakeState, remaining: number) {
  return {
    asked: state.questionCount,
    max: MAX_ASKED_QUESTIONS,
    remainingHighLeverage: remaining,
  };
}

/**
 * Match hiring-shaped challenge text to a decision template hint.
 * Returns null when no template applies. Today only admin-hire is wired; the
 * shape is extensible (Path B — typed return) for capacity / pricing once
 * their template intake flows ship.
 */
function suggestedTemplateForHiring(text: string): DecisionTemplateHint | null {
  // Anchor terms come straight from branch-codex's admin-hire signal config
  // — they're the textbook surface forms of "should I hire X" questions.
  if (
    /\b(admin (assistant|hire|support)|virtual assistant|\bva\b|biller|associate|contractor|delegate|outsource|hire (an? )?(admin|assistant|biller))\b/i.test(
      text,
    )
  ) {
    return "admin-hire";
  }
  return null;
}

/**
 * Injectable detector. Tests pass a stub that returns a deterministic
 * DecisionDetection; production passes the real Groq-backed detector.
 */
export type IntentDetector = (
  text: string,
) => Promise<DecisionDetection>;

const DEFAULT_DETECTOR: IntentDetector = detectDecisionIntent;

export async function nextStep(
  input: RecommendationIntakeNextInput,
  options?: { detector?: IntentDetector },
): Promise<RecommendationIntakeAction> {
  let state = buildInitialState(RecommendationIntakeNextInputSchema.parse(input));
  state = await classifyIntoState(state);

  // S2.C1 — Decision-intent routing for hiring-shaped challenges.
  //
  // Two-stage gate:
  //   1. Cheap keyword regex (isHiringShapedChallenge) decides whether the
  //      challenge text is worth confirming.
  //   2. If yes AND no detection has been performed yet (questionCount === 0)
  //      AND the user hasn't already declined routing, call the LLM detector.
  //      When kind=decision + suggestedPath=decision + confidence≥0.7 AND a
  //      template hint matches, emit route_to_decision.
  //
  // The client's "No, keep this as a workflow" affordance sets
  // state.routingDeclined=true on its callback, so this branch is suppressed
  // on the next call and the user continues into the WHY-first fallback.
  if (
    state.questionCount === 0 &&
    !state.routingDeclined &&
    isHiringShapedChallenge(state.challengeText)
  ) {
    const detector = options?.detector ?? DEFAULT_DETECTOR;
    let detection: DecisionDetection | null = null;
    try {
      detection = await detector(state.challengeText);
    } catch {
      // Detector failures are non-fatal — fall through to normal intake.
      detection = null;
    }
    if (
      detection &&
      detection.kind === "decision" &&
      detection.suggestedPath === "decision" &&
      detection.confidence >= 0.7
    ) {
      const hint = suggestedTemplateForHiring(state.challengeText);
      if (hint) {
        const parsedHint = DecisionTemplateHintSchema.parse(hint);
        const action = {
          action: "route_to_decision",
          state,
          suggestedTemplate: parsedHint,
          confidence: detection.confidence,
          rationale: detection.rationale.slice(0, 240),
        } satisfies RecommendationIntakeAction;
        return RecommendationIntakeActionSchema.parse(action);
      }
    }
  }

  const unknowns = buildUnknowns(state);
  const askable = unknowns
    .filter((u) => u.question && u.blockingScore.decision === "ask")
    .sort((a, b) => b.blockingScore.blocking - a.blockingScore.blocking);

  if (askable.length > 0 && state.questionCount < MAX_ASKED_QUESTIONS) {
    const question = askable[0]!.question!;
    const action = {
      action: "ask",
      state,
      question,
      progress: progress(state, askable.length),
    } satisfies RecommendationIntakeAction;
    return RecommendationIntakeActionSchema.parse(action);
  }

  const inferable = unknowns.filter((u) => u.defaultValue !== undefined);
  if (inferable.length > 0) {
    const next = addAssumptions(state, inferable);
    const newlyAdded = next.assumptions.filter((a) =>
      inferable.some((u) => u.topic === a.topic),
    );
    const action = {
      action: "infer",
      state: next,
      defaults: newlyAdded,
      progress: progress(next, 0),
    } satisfies RecommendationIntakeAction;
    return RecommendationIntakeActionSchema.parse(action);
  }

  const recommendationInput = finalize({ state });
  const action = {
    action: "done",
    state,
    recommendationInput,
    reason: "Aida has enough signal to recommend a first AI task.",
  } satisfies RecommendationIntakeAction;
  return RecommendationIntakeActionSchema.parse(action);
}

export function ingestAnswer(
  input: RecommendationIntakeAnswerInput,
): RecommendationIntakeState {
  const parsed = RecommendationIntakeAnswerInputSchema.parse(input);
  let next = applyPath(parsed.state, parsed.question.fills, parsed.raw);

  if (!next.askedTopics.includes(parsed.question.topic)) {
    next.askedTopics.push(parsed.question.topic);
  }
  next.answers.push({
    questionId: parsed.question.id,
    topic: parsed.question.topic,
    fills: parsed.question.fills,
    display: parsed.display,
    raw: parsed.raw,
    answeredAt: new Date().toISOString(),
  });
  next.questionCount += 1;

  return RecommendationIntakeStateSchema.parse(next);
}

export function finalize(input: {
  state: RecommendationIntakeState;
}): RecommendationInput {
  const stateWithDefaults = addAssumptions(
    RecommendationIntakeStateSchema.parse(input.state),
    buildUnknowns(input.state).filter((u) => u.defaultValue !== undefined),
  );

  const scoringInput = {
    painSeverity: stateWithDefaults.scoringInput.painSeverity ?? 0.7,
    frequency: stateWithDefaults.scoringInput.frequency ?? 0.6,
    timeBurden: stateWithDefaults.scoringInput.timeBurden ?? 0.6,
    riskTolerance: stateWithDefaults.scoringInput.riskTolerance ?? 0.4,
    aiComfort: stateWithDefaults.scoringInput.aiComfort ?? 0.5,
    dataReadiness: stateWithDefaults.scoringInput.dataReadiness ?? 0.5,
  };

  return RecommendationInputSchema.parse({
    painPath: stateWithDefaults.painPath ?? "custom",
    challengeText: stateWithDefaults.challengeText,
    goal: stateWithDefaults.goal ?? inferGoal(stateWithDefaults),
    scoringInput,
  });
}
