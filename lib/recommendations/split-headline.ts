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

export interface ParsedTask {
  headline: string;
  stack: string[];
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
