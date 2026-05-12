// lib/corpus/body-kind.ts — V2 trust-tier classification for corpus bodies.
//
// Source of truth: workers/src/ingestion/quality.ts (Railway side, EXTRACTOR_VERSION
// 2026-05-11.ingestion-v2.1). This file is the Vercel-side mirror — duplicated
// rather than imported because `workers/tsconfig.json` is a scoped project root.
// Keep the BodyKind union in sync with the worker; the build will not catch
// drift across the package boundary.
//
// Persistence: stored under `corpus_documents.metadata->'content_extract'->>'body_kind'`
// (jsonb path; NOT yet a column — see plan §"Phase-2 later promotion"). Read
// via `metadataBodyKindSelectFragment()` to keep all read sites consistent.
//
// Back-compat: pre-backfill rows have NULL body_kind. Treat NULL as `full_text`
// for back-compat so the corpus stays usable until the repair sweep runs.

export type BodyKind =
  | "full_text"
  | "source_summary"
  | "metadata_only"
  | "blocked"
  | "degraded";

/**
 * The set of body_kind values the V2 search pipeline is willing to surface as
 * full-trust citations. NULL is treated as `full_text` (back-compat). Anything
 * else (blocked, degraded, metadata_only) is filtered out of search candidates
 * and never reaches the grounding prompt.
 */
export const TRUSTED_BODY_KINDS: ReadonlySet<BodyKind> = new Set<BodyKind>([
  "full_text",
  "source_summary",
]);

/**
 * Body kinds that may surface as citations but should be badged as partial
 * trust (LLM is instructed to treat them as summaries, not full text).
 */
export const PARTIAL_TRUST_BODY_KINDS: ReadonlySet<BodyKind> = new Set<BodyKind>([
  "source_summary",
]);

/**
 * Body kinds that must NEVER surface as citations or library promotions.
 * Used as a guard on /api/library/save and downstream renderers.
 */
export const BLOCKED_BODY_KINDS: ReadonlySet<BodyKind> = new Set<BodyKind>([
  "blocked",
  "degraded",
  "metadata_only",
]);

/**
 * Normalize a raw value read from `metadata->'content_extract'->>'body_kind'`.
 * NULL / undefined / unknown → `"full_text"` (back-compat for pre-backfill rows).
 * Any recognized BodyKind passes through unchanged.
 */
export function normalizeBodyKind(raw: unknown): BodyKind {
  if (raw === "full_text" || raw === "source_summary" || raw === "metadata_only" || raw === "blocked" || raw === "degraded") {
    return raw;
  }
  // NULL, undefined, empty string, or any unrecognized value → assume legacy
  // full_text row (corpus pre-backfill).
  return "full_text";
}

/**
 * True when this hit should be surfaced as a full-trust citation.
 * NULL body_kind → true (back-compat).
 */
export function isTrustedBodyKind(raw: unknown): boolean {
  return TRUSTED_BODY_KINDS.has(normalizeBodyKind(raw));
}

/**
 * True when this hit is a partial-trust source (the LLM and UI badge it
 * accordingly, but it still grounds an answer).
 */
export function isPartialTrustBodyKind(raw: unknown): boolean {
  return PARTIAL_TRUST_BODY_KINDS.has(normalizeBodyKind(raw));
}

/**
 * True when this row must be hard-blocked from any citation / promotion path.
 */
export function isBlockedBodyKind(raw: unknown): boolean {
  // NULL/back-compat values are NOT blocked.
  if (raw == null || raw === "") return false;
  return BLOCKED_BODY_KINDS.has(raw as BodyKind);
}

/**
 * Human-readable UI badge text. Returns null for full_text / null (back-compat) —
 * those need no badge.
 */
export function bodyKindBadgeLabel(raw: unknown): string | null {
  const kind = normalizeBodyKind(raw);
  switch (kind) {
    case "source_summary":
      return "Source summary only";
    case "metadata_only":
      return "Metadata only";
    case "degraded":
      return "Degraded source";
    case "blocked":
      return "Blocked source";
    case "full_text":
    default:
      return null;
  }
}
