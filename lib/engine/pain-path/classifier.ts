// Pain-path classifier — E2 implementation.
//
// Maps a free-text challenge (or a user-selected path) to one of the 6 canonical
// pain paths. If the text is ambiguous (LLM confidence < 0.7) the classifier
// returns ClarifierChips so the chat surface can ask the user to pick a path.
//
// The ClarifierChips type MUST come from lib/engine/clarifier.ts (typed clarifier
// protocol). It is never redefined here.
//
// Strategy:
//   1. If selectedPath is supplied and the text clearly corroborates it → return
//      as-is at confidence 1.0 (no LLM call needed).
//   2. Otherwise: keyword heuristics first. If heuristic confidence ≥ 0.7, return
//      without an LLM call (fast + free).
//   3. If heuristic confidence < 0.7: call Groq; parse the result. If Groq returns
//      confidence ≥ 0.7 use it; else emit clarifier chips.
//   4. If Groq fails: fall back to the heuristic result and emit chips when
//      confidence < 0.7.

import "server-only";
import { callStage } from "@/lib/groq";
import type { ClarifierChips } from "@/lib/engine/clarifier";
import type { PainPathId } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PainPathClassification {
  path: PainPathId;
  /** 0-1 confidence. Values below 0.7 indicate ambiguity; clarifiers will be populated. */
  confidence: number;
  /** Present when confidence < 0.7 — chips asking the user to confirm their path. */
  clarifiers?: ClarifierChips[];
}

// ---------------------------------------------------------------------------
// Chip options — one per canonical path
// ---------------------------------------------------------------------------

const PAIN_PATH_CHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "referrals", label: "Grow / manage referrals" },
  { value: "research", label: "Keep up with research" },
  { value: "admin", label: "Reduce admin overload" },
  { value: "capacity_growth", label: "Plan capacity or pricing" },
  { value: "follow_up", label: "Improve patient follow-up" },
  { value: "custom", label: "Something else" },
];

function buildClarifierChips(bestGuess?: PainPathId): ClarifierChips {
  return {
    kind: "chips",
    fieldId: "pain_path",
    label: "Which challenge best describes your situation?",
    hint: "Pick the closest match — we'll refine from there.",
    options: PAIN_PATH_CHIP_OPTIONS,
    ...(bestGuess ? { defaultValue: bestGuess } : {}),
  };
}

// ---------------------------------------------------------------------------
// Keyword heuristics
// ---------------------------------------------------------------------------

// Each path maps to a set of keywords. More keyword hits → higher confidence.
const PATH_KEYWORDS: Record<PainPathId, string[]> = {
  referrals: [
    "referral", "referrals", "refer", "specialist", "network", "outreach",
    "new patient", "source", "grow referral", "referral partner", "sending referrals",
    "receiving referrals", "referral sources", "build referral",
  ],
  research: [
    "research", "literature", "study", "studies", "journal", "guideline",
    "evidence", "clinical update", "keep up", "specialty", "new findings",
    "read", "articles", "paper", "papers", "current with", "stay current",
    "latest research", "clinical evidence", "stay informed",
  ],
  admin: [
    "admin", "administrative", "paperwork", "inbox", "email", "message",
    "forms", "documentation", "chart", "notes", "prior auth", "billing",
    "overload", "overwhelm", "drown", "drowning", "buried", "backlog",
    "clerical", "messages", "faxes", "fax", "requests", "letters",
    "correspondence", "inundated", "swamped", "too much work",
  ],
  capacity_growth: [
    "capacity", "growth", "pricing", "revenue", "schedule", "appointment",
    "waitlist", "expand", "scale", "profit", "fee", "rate", "slots",
    "workload", "hours", "demand", "grow my practice", "more patients",
    "raise rates", "increase revenue",
  ],
  follow_up: [
    "follow-up", "follow up", "followup", "follow ups", "reminder", "check in",
    "check-in", "patient contact", "consistency", "missed", "no-show",
    "outreach", "recall", "unresolved", "track patient", "after visit",
    "post visit", "patient communication", "patient reminders", "callbacks",
    "call back", "following up",
  ],
  custom: [],
};

interface HeuristicResult {
  path: PainPathId;
  confidence: number;
}

function classifyWithHeuristics(text: string): HeuristicResult {
  const lower = text.toLowerCase();
  const scores: Record<PainPathId, number> = {
    referrals: 0,
    research: 0,
    admin: 0,
    capacity_growth: 0,
    follow_up: 0,
    custom: 0,
  };

  for (const [path, keywords] of Object.entries(PATH_KEYWORDS) as Array<[PainPathId, string[]]>) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[path] += 1;
      }
    }
  }

  // Find the path with the most hits.
  let topPath: PainPathId = "custom";
  let topScore = 0;
  let secondScore = 0;

  for (const [path, score] of Object.entries(scores) as Array<[PainPathId, number]>) {
    if (score > topScore) {
      secondScore = topScore;
      topScore = score;
      topPath = path;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Confidence is derived from the relative dominance of the top path.
  // 0 hits → custom at 0.3. As hits increase and the margin widens, confidence rises.
  if (topScore === 0) {
    return { path: "custom", confidence: 0.3 };
  }

  const margin = topScore - secondScore;

  // Confidence formula:
  //   - Base from hit count: 1 hit = 0.6, 2 hits = 0.7, 3+ hits = 0.8.
  //   - Margin bonus: if the top path has > 2× the second, add 0.1.
  //   - Cap at 0.95.
  const hitBase = topScore === 1 ? 0.6 : topScore === 2 ? 0.7 : 0.8;
  const exclusiveBonus = secondScore === 0 ? 0.1 : 0; // top path is the ONLY match
  const marginBonus = margin >= 2 ? 0.05 : 0;
  const confidence = Math.min(0.95, hitBase + exclusiveBonus + marginBonus);

  return { path: topPath, confidence };
}

// ---------------------------------------------------------------------------
// LLM classification
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = `You are the pain-path classifier for Aida, an AI assistant helping solo healthcare practitioners spend less time on admin and more time on patients.

Given a free-text challenge description, classify it into the most appropriate pain path. Return ONLY JSON.

Pain paths:
- "referrals"       — Growing or managing a referral network; sourcing new patients; specialist outreach.
- "research"        — Keeping up with medical research, clinical guidelines, evidence, specialty updates.
- "admin"           — Reducing administrative overload: inbox, documentation, forms, prior auth, billing, paperwork.
- "capacity_growth" — Planning capacity, pricing, scheduling, revenue growth, or managing workload demand.
- "follow_up"       — Improving patient follow-up consistency: reminders, check-ins, recall, unresolved tasks.
- "custom"          — Does not fit any of the above. Use when the challenge spans multiple paths or is unique.

Rules:
- Pick the SINGLE best path. If two paths tie, pick the one that most directly names the practitioner's frustration.
- If the text is too vague or spans multiple paths equally, use "custom" and set confidence below 0.65.
- Never invent a new path.

OUTPUT (JSON only — no prose, no fences):
{
  "path": "referrals" | "research" | "admin" | "capacity_growth" | "follow_up" | "custom",
  "confidence": <0.0-1.0 float — how certain you are>,
  "rationale": "<1 sentence>"
}`;

interface LlmClassification {
  path: PainPathId;
  confidence: number;
  rationale: string;
}

async function classifyWithLlm(challenge: string): Promise<LlmClassification | null> {
  let answer: string;
  try {
    const result = await callStage({
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      userPrompt: challenge,
      responseSchema: {},
      temperature: 0.1,
    });
    answer = result.answer;
  } catch {
    return null;
  }

  const parsed = parseJson(answer);
  if (
    !parsed ||
    !isValidPainPath(parsed.path) ||
    typeof parsed.confidence !== "number"
  ) {
    return null;
  }

  return {
    path: parsed.path as PainPathId,
    confidence: Math.min(1, Math.max(0, parsed.confidence as number)),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a free-text challenge into one of the 6 canonical pain paths.
 *
 * - If `selectedPath` is provided and the heuristic corroborates it (any hits
 *   for that path, or no strong signals elsewhere), returns it at confidence 1.0.
 * - Otherwise: heuristic first; LLM if confidence < 0.7; chips if still ambiguous.
 */
export async function classifyPainPath(input: {
  challenge: string;
  selectedPath?: PainPathId;
}): Promise<PainPathClassification> {
  const { challenge, selectedPath } = input;

  // Fast path: selectedPath provided.
  if (selectedPath) {
    // Check that the text doesn't strongly contradict the selectedPath by
    // looking at whether any other path scores much higher.
    const heuristic = classifyWithHeuristics(challenge);
    const corroborated =
      heuristic.path === selectedPath ||
      heuristic.confidence < 0.7 || // weak heuristic — trust selectedPath
      selectedPath === "custom"; // custom is always accepted
    if (corroborated) {
      return { path: selectedPath, confidence: 1.0 };
    }
    // Heuristic strongly disagrees — fall through to LLM classification but
    // keep selectedPath as the tiebreaker below.
  }

  // Heuristic classification.
  const heuristic = classifyWithHeuristics(challenge);

  // If heuristic is confident enough, short-circuit.
  if (heuristic.confidence >= 0.7) {
    return { path: heuristic.path, confidence: heuristic.confidence };
  }

  // LLM call for ambiguous cases.
  const llm = await classifyWithLlm(challenge);

  if (llm && llm.confidence >= 0.7) {
    return { path: llm.path, confidence: llm.confidence };
  }

  // Still ambiguous. Pick the best guess and emit clarifier chips.
  const bestGuess: PainPathId =
    llm && llm.confidence > heuristic.confidence
      ? llm.path
      : heuristic.confidence > 0
        ? heuristic.path
        : selectedPath ?? "custom";

  const finalConfidence = llm
    ? Math.max(llm.confidence, heuristic.confidence)
    : heuristic.confidence;

  return {
    path: bestGuess === "custom" ? "custom" : bestGuess,
    confidence: finalConfidence || 0.3,
    clarifiers: [buildClarifierChips(bestGuess)],
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const VALID_PAIN_PATHS = new Set<string>([
  "referrals", "research", "admin", "capacity_growth", "follow_up", "custom",
]);

function isValidPainPath(v: unknown): boolean {
  return typeof v === "string" && VALID_PAIN_PATHS.has(v);
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
