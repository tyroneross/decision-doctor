// lib/audience/filter.ts — SQL helper for the retrieval-leg audience filter.
//
// One job: given a SearchScope and a content_type, emit the SQL fragment
// retrieval legs (bm25, vector, kg, title, library, kb) splice into their
// existing WHERE clause to limit the candidate set to adoption-tagged rows.
//
// Design (locked):
//   - 'focused' → INNER JOIN to content_audience, restricting to
//                 audience='ai-adoption-solo'.
//   - 'broad'   → no-op. Retrieval sees the whole corpus.
//
// Untagged corpus rows are EXCLUDED from 'focused' results — the JOIN is
// inner. Backfill is the single source of truth for tagging; if a row isn't
// in content_audience, it's by construction outside the adoption surface.
// (This is the conservative default; A7 Optimize tests the opposite.)

import { sql, type SQL } from "drizzle-orm";
import type { SearchScope, ContentAudienceContentType } from "@/lib/db/schema";

export interface AudienceClauseInput {
  scope: SearchScope;
  contentType: ContentAudienceContentType;
  /**
   * The table alias the leg uses for the content row. The JOIN matches
   * `content_audience.content_id = <docAlias>.id`. Default 'd' to match the
   * existing leg shape (FROM corpus_documents — no alias needed since the
   * SELECT references id directly).
   */
  docIdColumn?: SQL;
}

export interface AudienceClause {
  /** SQL fragment to splice immediately after the FROM clause (joins). */
  join: SQL;
  /** SQL fragment to splice into the WHERE clause as an AND-able predicate. */
  where: SQL;
}

const ADOPTION_AUDIENCE = "ai-adoption-solo";

/**
 * Build the audience JOIN + WHERE for a retrieval leg.
 *
 * For 'broad' both fragments are empty (sql.empty()), so callers always
 * splice them in unconditionally — no branching at the call site.
 */
export function audienceClauseFor(input: AudienceClauseInput): AudienceClause {
  if (input.scope === "broad") {
    return { join: sql``, where: sql`` };
  }
  // 'focused' path. Use an EXISTS subquery rather than a JOIN so the leg's
  // GROUP BY / ORDER BY clauses don't need to be rewritten — every existing
  // leg expects to compute rank from the content table alone.
  const docId = input.docIdColumn ?? sql.raw("id");
  return {
    join: sql``,
    where: sql` AND EXISTS (
      SELECT 1 FROM content_audience ca
       WHERE ca.content_type = ${input.contentType}
         AND ca.audience = ${ADOPTION_AUDIENCE}
         AND ca.content_id = ${docId}
    )`,
  };
}

/**
 * Convenience for the recommendation engine and any other caller that must
 * pin to 'focused' regardless of the user's toggle. Equivalent to calling
 * audienceClauseFor({ scope: 'focused', contentType }).
 */
export function focusedAudienceClause(
  contentType: ContentAudienceContentType,
  docIdColumn?: SQL,
): AudienceClause {
  return audienceClauseFor({ scope: "focused", contentType, docIdColumn });
}
