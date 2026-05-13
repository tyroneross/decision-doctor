// lib/audience/classify.ts — Deterministic audience-rule table for Track A.
//
// Maps a (content_type, source_signal) pair to zero or more audience tags.
// Used by:
//   - scripts/backfill-content-audience.ts (initial + idempotent re-runs)
//   - tests/audience-classify.test.ts (lock the rules from drifting silently)
//
// Two audience values — schema enforces both:
//   - 'ai-adoption-solo'    : adoption-tagged content (the product mission)
//   - 'ai-research-general' : broader AI research surface
//
// A row may carry both tags (dual-use, e.g. vendor news). The DB unique
// constraint (content_type, content_id, audience) means we insert two rows
// in that case, not one row with both audiences. Keeps the WHERE clause
// in filter.ts trivial.

export type Audience = "ai-adoption-solo" | "ai-research-general";
export type AudienceContentType =
  | "corpus_document"
  | "library_use_case"
  | "library_prompt"
  | "library_skill"
  | "library_plugin"
  | "kb_article"
  | "plugin"
  | "skill";

export interface CorpusSignal {
  contentType: "corpus_document";
  /** corpus_documents.source_type value (e.g. 'arxiv', 'anthropic-news'). */
  sourceType: string;
}

export interface LibrarySignal {
  contentType:
    | "library_use_case"
    | "library_prompt"
    | "library_skill"
    | "library_plugin";
}

export interface KbSignal {
  contentType: "kb_article";
}

export interface PluginSkillSignal {
  contentType: "plugin" | "skill";
  /**
   * The source URL or fetch origin of the plugin/skill row. Anthropic's
   * curated knowledge-work-plugins repo is the adoption surface. Other
   * upstream URLs default to ai-research-general.
   */
  sourceUrl: string | null;
}

export type ClassifyInput =
  | CorpusSignal
  | LibrarySignal
  | KbSignal
  | PluginSkillSignal;

export interface ClassifyResult {
  audiences: Audience[];
  /** When empty, classify intentionally chose not to tag. The caller logs
   * the row for human review rather than inserting a row. */
  reason: string;
}

const ADOPTION_CORPUS_SOURCES = new Set<string>([
  // healthcare-adjacent industry news is the closest existing proxy for
  // solo-healthcare adoption content. arxiv is research, vendor news is dual-use.
  "industry",
  "industry-news",
  "healthcare-news",
]);

const RESEARCH_CORPUS_SOURCES = new Set<string>([
  "arxiv",
  "arxiv-paper",
  "paper",
  "research",
]);

const DUAL_USE_CORPUS_SOURCES = new Set<string>([
  // Vendor news lands in both buckets — adoption practitioners need the
  // product announcements and the broader research surface also tracks them.
  "anthropic",
  "anthropic-news",
  "openai",
  "openai-news",
]);

const ADOPTION_PLUGIN_URL_MARKERS = [
  // Anthropic's curated repo of knowledge-work plugins is adoption-aligned.
  "anthropics/knowledge-work-plugins",
  "github.com/anthropics/skills",
];

/**
 * Deterministic classifier. Pure function — no IO, no LLM. Re-runs return
 * the same answer for the same input. Backfill idempotency depends on this.
 */
export function classifyAudience(input: ClassifyInput): ClassifyResult {
  switch (input.contentType) {
    case "corpus_document": {
      const src = input.sourceType.toLowerCase();
      if (DUAL_USE_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-adoption-solo", "ai-research-general"],
          reason: `corpus_document/${src} — vendor news, dual-use`,
        };
      }
      if (ADOPTION_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-adoption-solo"],
          reason: `corpus_document/${src} — adoption industry signal`,
        };
      }
      if (RESEARCH_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-research-general"],
          reason: `corpus_document/${src} — research surface`,
        };
      }
      return {
        audiences: [],
        reason: `corpus_document/${src} — unknown source_type; flagged for human review`,
      };
    }

    case "library_use_case":
    case "library_prompt":
    case "library_skill":
    case "library_plugin":
      // Library content is curated specifically for solo healthcare practitioners.
      // Every row is adoption by construction.
      return {
        audiences: ["ai-adoption-solo"],
        reason: `${input.contentType} — curated for solo healthcare`,
      };

    case "kb_article":
      // Knowledge-base articles are curated learning content for adoption.
      return {
        audiences: ["ai-adoption-solo"],
        reason: "kb_article — curated learning content",
      };

    case "plugin":
    case "skill": {
      const url = (input.sourceUrl ?? "").toLowerCase();
      if (
        ADOPTION_PLUGIN_URL_MARKERS.some((m) => url.includes(m.toLowerCase()))
      ) {
        return {
          audiences: ["ai-adoption-solo"],
          reason: `${input.contentType} — anthropics curated knowledge-work surface`,
        };
      }
      // Unmarked plugin/skill rows default to adoption — the toolkit's
      // population is adoption-aligned today; mistakes get human-corrected.
      return {
        audiences: ["ai-adoption-solo"],
        reason: `${input.contentType} — default adoption surface (no upstream marker)`,
      };
    }
  }
}

/** Convenience — returns true when classify chose at least one audience. */
export function classifyHasResult(r: ClassifyResult): boolean {
  return r.audiences.length > 0;
}
