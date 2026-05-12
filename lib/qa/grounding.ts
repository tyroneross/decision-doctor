// lib/qa/grounding.ts — Q1: Source formatting + empty-grounding detection.
//
// Formats retrieved search hits into a prompt context block that the
// synthesizer embeds into its system prompt. Each source gets a header
// with its UUID and kind so the LLM can emit [[doc:<uuid>]] tokens per
// the S1 citation contract.

import type { BodyKind } from "@/lib/corpus/body-kind";
import { normalizeBodyKind, isPartialTrustBodyKind } from "@/lib/corpus/body-kind";

export interface SourceForGrounding {
  uuid: string;
  kind: "use_case" | "prompt" | "skill" | "plugin" | "corpus";
  title: string;
  body: string;
  score?: number;
  /**
   * Trust-tier classification of the body content. Only present (and only
   * meaningful) for `kind: "corpus"` hits — library kinds (use_case, prompt,
   * skill, plugin) are user-curated and treated as full-text by default.
   *
   * NULL is interpreted as `"full_text"` (pre-backfill back-compat). See
   * lib/corpus/body-kind.ts for the union. C10 contract: `blocked` /
   * `degraded` / `metadata_only` are filtered upstream and SHOULD NOT appear
   * here; if they do (defense in depth), formatSourcesForPrompt still tags
   * them so the LLM does not treat them as full-text.
   */
  body_kind?: BodyKind | null;
}

// Max body chars per source before truncation. Keeps total context under
// ~6K tokens for the Groq model (5 sources × ~500 chars each ≈ 2500 chars
// + header overhead ≈ ~1K tokens per source block).
const MAX_BODY_CHARS = 500;

/**
 * Format retrieved sources into a prompt block.
 *
 * Output shape (example):
 *
 *   ### Source [a1b2c3d4-...] (kind: use_case)
 *   Title: AI Scheduling for Follow-Up
 *   Body: Use an AI scheduling assistant to automate patient follow-up...
 *
 * For partial-trust corpus hits (body_kind == "source_summary") an extra
 * "Trust:" line is emitted so the LLM knows the body is a curated summary
 * rather than the original article text. The LLM is instructed (in the
 * synthesizer prompt) to cite using [[doc:<uuid>]] tokens — the exact UUIDs
 * that appear in these headers.
 */
export function formatSourcesForPrompt(sources: SourceForGrounding[]): string {
  if (sources.length === 0) {
    return "(no sources retrieved)";
  }

  return sources
    .map((s) => {
      const truncated =
        s.body.length > MAX_BODY_CHARS
          ? s.body.slice(0, MAX_BODY_CHARS).trimEnd() + "…"
          : s.body;

      const lines = [
        `### Source [${s.uuid}] (kind: ${s.kind})`,
        `Title: ${s.title}`,
      ];

      // Trust hint only for corpus hits with a partial-trust body_kind, or
      // when an unexpected non-trusted kind slips past the upstream filter.
      if (s.kind === "corpus") {
        const normalized = normalizeBodyKind(s.body_kind);
        if (isPartialTrustBodyKind(s.body_kind)) {
          lines.push(
            "Trust: source_summary — this is a curated summary, not the full article. Treat as partial evidence.",
          );
        } else if (normalized !== "full_text") {
          // Defense in depth — upstream should never hand us a blocked /
          // degraded / metadata_only body. If it happens, flag it so the LLM
          // does not synthesize against unverified content.
          lines.push(
            `Trust: ${normalized} — this source did not pass the full-text quality gate. Do not treat as authoritative.`,
          );
        }
      }

      lines.push(`Body: ${truncated}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Return true when the source list is insufficient for a grounded answer.
 *
 * Triggers when:
 *   - fewer than 2 sources present, OR
 *   - ALL sources have score < minScore.
 *
 * Search scores come from Reciprocal Rank Fusion, not a 0..1 relevance
 * probability. With k=60, strong multi-leg hits commonly land around
 * 0.03, so the default floor must stay on the RRF scale.
 *
 * When this returns true the route emits an empty-grounding state instead
 * of synthesizing a zero-shot answer.
 */
export const DEFAULT_MIN_RRF_GROUNDING_SCORE = 0.01;

export function shouldEmitEmptyGrounding(
  sources: SourceForGrounding[],
  minScore = DEFAULT_MIN_RRF_GROUNDING_SCORE,
): boolean {
  if (sources.length < 2) return true;
  // If every source has a defined score and all are below threshold → no grounding.
  const scoredSources = sources.filter((s) => s.score !== undefined);
  if (
    scoredSources.length === sources.length &&
    scoredSources.every((s) => (s.score ?? 0) < minScore)
  ) {
    return true;
  }
  return false;
}
