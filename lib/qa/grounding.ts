// lib/qa/grounding.ts — Q1: Source formatting + empty-grounding detection.
//
// Formats retrieved search hits into a prompt context block that the
// synthesizer embeds into its system prompt. Each source gets a header
// with its UUID and kind so the LLM can emit [[doc:<uuid>]] tokens per
// the S1 citation contract.

export interface SourceForGrounding {
  uuid: string;
  kind: "use_case" | "prompt" | "skill" | "plugin" | "corpus";
  title: string;
  body: string;
  score?: number;
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
 * The LLM is instructed (in the synthesizer prompt) to cite using
 * [[doc:<uuid>]] tokens — the exact UUIDs that appear in these headers.
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

      return [
        `### Source [${s.uuid}] (kind: ${s.kind})`,
        `Title: ${s.title}`,
        `Body: ${truncated}`,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * Return true when the source list is insufficient for a grounded answer.
 *
 * Triggers when:
 *   - fewer than 2 sources present, OR
 *   - ALL sources have score < minScore (default 0.3).
 *
 * When this returns true the route emits an empty-grounding state instead
 * of synthesizing a zero-shot answer.
 */
export function shouldEmitEmptyGrounding(
  sources: SourceForGrounding[],
  minScore = 0.3,
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
