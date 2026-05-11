// C7 — Robustness copy helper for the "If this stops working" tier 2 card
// in RecommendationView. Pure function, no LLM call. Inputs are the
// pre-computed stage4 outranking + stage5 ranking; output is a short
// human-readable threshold string (≤140 chars) that the UI renders as the
// "switch to plan B when…" copy.
//
// The minimax-regret robust alternative is already chosen by stage5 — this
// helper just wraps it in plain language. When the engine output is missing
// (legacy decisions pre-F-08, or values-dominant decisions where there is no
// single robust alt), returns a stable placeholder that the UI prints
// verbatim.
//
// Shape kept simple: callers pass the already-extracted RobustAlternative
// and template id; we don't reach back into the methodTrace because that
// shape is loose at the boundary (JSON column, type-narrowed at render).

export interface RobustnessInput {
  /** stage5.robustCandidate.label (or row.robustAlternative.option). */
  robustOption: string | undefined | null;
  /** stage5.robustWhy (or row.robustAlternative.why / .rationale). */
  robustWhy: string | undefined | null;
  /** Template id; informs which threshold copy fits best. */
  templateId: "capacity" | "pricing" | "admin-hire" | string | null | undefined;
}

export interface RobustnessOutput {
  /** Headline option name to render. Falls back to "Reassess" when absent. */
  option: string;
  /** Short threshold copy: ≤140 chars. */
  threshold: string;
  /** True when the engine returned real robust data (vs placeholder). */
  hasReal: boolean;
}

const PLACEHOLDER_BY_TEMPLATE: Record<string, string> = {
  capacity:
    "Re-run the survey if your weekly patient volume drops below ~22 visits.",
  pricing:
    "Re-run if fill rate falls below 70% for 4 weeks running.",
  "admin-hire":
    "Re-run if monthly admin hours climb back above 12 after the change.",
};

const DEFAULT_PLACEHOLDER =
  "Re-run this decision if any of your hard inputs shift more than ~20%.";

export function describeRobustness(input: RobustnessInput): RobustnessOutput {
  const realWhy = (input.robustWhy ?? "").trim();
  const realOption = (input.robustOption ?? "").trim();

  if (realOption && realWhy) {
    // Truncate runaway prose to 140 chars at a word boundary.
    const trimmed =
      realWhy.length <= 140
        ? realWhy
        : realWhy.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    return { option: realOption, threshold: trimmed, hasReal: true };
  }

  if (realOption) {
    // Have an option but no threshold — surface a template-aware default.
    const placeholder =
      (input.templateId &&
        PLACEHOLDER_BY_TEMPLATE[input.templateId]) ??
      DEFAULT_PLACEHOLDER;
    return { option: realOption, threshold: placeholder, hasReal: true };
  }

  // No engine data — full placeholder so the card is never empty.
  return {
    option: "Reassess",
    threshold:
      (input.templateId && PLACEHOLDER_BY_TEMPLATE[input.templateId]) ??
      DEFAULT_PLACEHOLDER,
    hasReal: false,
  };
}
