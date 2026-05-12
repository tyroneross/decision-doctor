// lib/recommendations/split-headline.ts
//
// Stage 8 of the engine emits recommendation.option as a single string. Engine
// outputs frequently inline the entire stack into the headline:
//
//   "Deploy this stack: SimplePractice / Headway billing automation +
//    Spruce / OhMD secure messaging + AI replies + Otter.ai or Granola"
//
// That's the WHAT-to-do (a subhead) jammed into the H1 slot. We split it
// client-side into:
//   - headline: the verb phrase ("Deploy this stack")
//   - stack:    the tool list as discrete chips
//
// Heuristics, not parsing:
//   1. If text contains a colon, headline = before colon, tail = after.
//   2. Otherwise headline = first 7 words, tail = the rest.
//   3. Tail is split on " + " (with surrounding spaces) and " / "
//      (with surrounding spaces) — these are the two connectors the
//      engine emits between stack items.
//   4. Headline is clamped to 60 chars.
//   5. Stack chips are de-duplicated, trimmed, and capped at 8 items.
//
// Pure function — no React, safe for both client and server.
//
// Also exports deriveWorkflowHeadline — a benefit-led headline heuristic
// for list rows, replacing the engine's "Deploy this stack: ..." verb phrase.

import { categoryFor } from "@/lib/decision-display";

export interface ParsedTask {
  headline: string;
  stack: string[];
}

// ─── deriveWorkflowHeadline ──────────────────────────────────────────────
//
// Returns a benefit-led, user-facing headline for a decision list row.
//
// Heuristic ladder:
//   1. If row.title is set and is NOT the auto-generated "Deploy this stack"
//      pattern, return it verbatim (trust user-set titles).
//   2. Else look up the template category and pick a verb+benefit phrase.
//   3. Append a brief domain hint derived from the stack tools.
//   4. Cap at 80 chars; trim trailing punctuation; no em-dashes.

const AUTO_TITLE_PATTERN = /^deploy this stack/i;
const MAX_HEADLINE = 80;

// Use-case groups inferred from the stack tools. The id is stable for
// grouping; the label is the human-readable group header.
//
// Order matters: higher-specificity patterns first so e.g. a scribe-+-billing
// row lands in "Automate session notes" (the dominant capability) instead of
// the broader billing bucket.
const USE_CASE_GROUPS: Array<{
  id: string;
  label: string;
  pattern: RegExp;
}> = [
  {
    id: "session-notes",
    label: "Automate session notes",
    pattern: /scribe|note|otter|granola/i,
  },
  {
    id: "intake-triage",
    label: "Streamline intake & triage",
    pattern: /intake|form|triage|screening/i,
  },
  {
    id: "messaging",
    label: "Asynchronous client messaging",
    pattern: /spruce|ohmd|messag|secure reply/i,
  },
  {
    id: "billing",
    label: "Smarter billing handoff",
    pattern: /billing|claim|alma|simplepractice|headway|stripe/i,
  },
  {
    id: "scheduling",
    label: "Scheduling & calendars",
    pattern: /acuity|cal\.com|calendly|scheduling/i,
  },
];

export interface UseCaseGroup {
  id: string;
  label: string;
}

const FALLBACK_GROUP: UseCaseGroup = {
  id: "other",
  label: "Other workflows",
};

/** Bucket a row by its stack of tools into a single use-case group. */
export function deriveUseCaseGroup(stack: string[]): UseCaseGroup {
  if (stack.length === 0) return FALLBACK_GROUP;
  const stackStr = stack.join(" ");
  for (const g of USE_CASE_GROUPS) {
    if (g.pattern.test(stackStr)) {
      return { id: g.id, label: g.label };
    }
  }
  return FALLBACK_GROUP;
}

export interface WorkflowHeadlineInput {
  title: string | null;
  templateId: string;
  /** The raw recommendationOption string from the engine. */
  recommendationOption: string | null;
}

/**
 * Derive a row-distinguishing headline for a decision list row.
 *
 * Strategy:
 *   1. If row.title is user-set and NOT the auto-generated "Deploy this
 *      stack" pattern, return it verbatim — the user knows best.
 *   2. Otherwise build the headline from the actual stack of tools so each
 *      row is distinguishable from its siblings. The use-case category is
 *      surfaced via the group header above the row, not in the row title.
 *   3. Last-resort fallback: the template category label.
 *
 * Returns plain text, no JSX, no em-dashes.
 */
export function deriveWorkflowHeadline(row: WorkflowHeadlineInput): string {
  // Step 1: trust user-set title if not auto-generated.
  if (row.title && !AUTO_TITLE_PATTERN.test(row.title.trim())) {
    return clamp(row.title.trim());
  }

  // Step 2: build a stack-signature title so rows under the same use-case
  // group still read differently from each other.
  const stack = splitTaskHeadline(row.recommendationOption ?? "").stack;
  if (stack.length > 0) {
    return clamp(stack.join(" + "));
  }

  // Step 3: last-resort fallback to the template category. Rare path —
  // means the engine produced no stack at all.
  const cat = categoryFor(row.templateId);
  return clamp(cat.label);
}

function clamp(s: string): string {
  // Trim trailing punctuation except question marks.
  const trimmed = s.replace(/[.,;:]+$/, "").trim();
  if (trimmed.length <= MAX_HEADLINE) return trimmed;
  // Hard cut at word boundary.
  const cut = trimmed.slice(0, MAX_HEADLINE);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

const MAX_HEADLINE_CHARS = 60;
const MAX_HEADLINE_WORDS = 7;
const MAX_STACK_ITEMS = 8;

export function splitTaskHeadline(text: string): ParsedTask {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { headline: "", stack: [] };
  }

  let headline: string;
  let tail: string;

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0 && colonIdx < trimmed.length - 1) {
    headline = trimmed.slice(0, colonIdx).trim();
    tail = trimmed.slice(colonIdx + 1).trim();
  } else {
    const words = trimmed.split(/\s+/);
    if (words.length <= MAX_HEADLINE_WORDS) {
      headline = trimmed;
      tail = "";
    } else {
      headline = words.slice(0, MAX_HEADLINE_WORDS).join(" ");
      tail = words.slice(MAX_HEADLINE_WORDS).join(" ");
    }
  }

  // Clamp the headline. If we cut, append an ellipsis.
  if (headline.length > MAX_HEADLINE_CHARS) {
    headline = headline.slice(0, MAX_HEADLINE_CHARS - 1).trimEnd() + "…";
  }

  // Parse stack from tail.
  const stack = tail ? splitStack(tail) : [];

  return { headline, stack };
}

/**
 * Split a stack tail string into discrete tool chips.
 *
 * Connectors recognized: " + " and " / " (always with surrounding spaces
 * to avoid splitting "and/or"-style copy).
 *
 * "Otter.ai or Granola" stays as a single chip — we don't split on " or ",
 * keeping the engine's "tool A or tool B" optionality intact.
 */
function splitStack(tail: string): string[] {
  // Split on " + " first; each segment may further contain " / ".
  const parts: string[] = [];
  for (const seg of tail.split(/\s+\+\s+/)) {
    for (const sub of seg.split(/\s+\/\s+/)) {
      const cleaned = sub.trim().replace(/[.;,]+$/, "").trim();
      if (cleaned) parts.push(cleaned);
    }
  }

  // De-dup case-insensitively but preserve first-seen casing.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
    if (result.length >= MAX_STACK_ITEMS) break;
  }

  return result;
}
