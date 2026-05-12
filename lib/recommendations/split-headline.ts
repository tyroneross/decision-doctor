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

const CATEGORY_PHRASES: Record<string, string> = {
  capacity: "Reclaim hours each week",
  pricing: "Tighten pricing without losing clients",
  admin: "Cut admin overhead",
  skill: "Streamline this workflow",
  other: "Streamline this workflow",
};

// Domain hints derived from tool names in the stack.
const DOMAIN_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /scribe|note|otter|granola/i, hint: "automate session notes" },
  {
    pattern: /billing|claim|alma|simplepractice|headway/i,
    hint: "smarter billing handoff",
  },
  { pattern: /spruce|ohmd|messag/i, hint: "async client messaging" },
  { pattern: /intake|form/i, hint: "faster intake" },
];

export interface WorkflowHeadlineInput {
  title: string | null;
  templateId: string;
  /** The raw recommendationOption string from the engine. */
  recommendationOption: string | null;
}

/**
 * Derive a benefit-led headline for a decision list row.
 * Returns a plain string, no JSX, no em-dashes.
 */
export function deriveWorkflowHeadline(row: WorkflowHeadlineInput): string {
  // Step 1: trust user-set title if it exists and is not auto-generated.
  if (row.title && !AUTO_TITLE_PATTERN.test(row.title.trim())) {
    return clamp(row.title.trim());
  }

  // Step 2: pick benefit phrase from category.
  const cat = categoryFor(row.templateId);
  const base: string = CATEGORY_PHRASES[cat.id] ?? "Streamline this workflow";

  // Step 3: derive a domain hint from the stack.
  const stack = splitTaskHeadline(row.recommendationOption ?? "").stack;
  const stackStr = stack.join(" ");
  let hint = "";
  for (const d of DOMAIN_HINTS) {
    if (d.pattern.test(stackStr)) {
      hint = d.hint;
      break;
    }
  }

  const full = hint ? `${base} - ${hint}` : base;
  return clamp(full);
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
