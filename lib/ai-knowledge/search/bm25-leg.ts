// F-3 — Lexical retrieval leg for hybrid search (F-31).
//
// Filename retains "bm25-leg" for stream continuity with the F-31 design.
// Implementation is Postgres-core FTS (tsvector + GIN + ts_rank_cd), NOT
// strict BM25. See .build-loop/memory/decision_f1_tsvector_pivot.md for
// why we substituted paradedb's pg_search (deprecated on Neon as of
// 2026-05-11).
//
// Uses `search_tsv` (setweight(title,'A') || setweight(body,'B')), NOT
// `body_tsv`. The original F-1 pivot memo defaulted to body_tsv, but
// inspection of the live corpus (2026-05-11) showed 50 of 121 documents
// (openai-news source) have body length = 58 chars — CDP load
// placeholder, not the article text. body_tsv would give zero lexical
// signal for those rows. search_tsv is the title-weighted variant that
// also lives in the live DB (corpus_documents_search_idx GIN), so the
// swap is one identifier change. See
// .build-loop/memory/pattern_tsvector_rank_query.md for the column
// discovery + rationale.
//
// Runs inside the caller's actor transaction (set_config('app.current_user_id', ...))
// so RLS on corpus_documents is enforced.

import "server-only";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export interface BM25Hit {
  doc_id: string;
  rank: number;
}

/**
 * Lexical retrieval leg. Accepts a transaction (so the caller controls
 * RLS GUCs + leg-level latency timing) and returns top-K doc ids by
 * cover-density rank.
 *
 * Two-pass: AND-quorum first via websearch_to_tsquery (which honors phrase
 * queries + AND/OR/NOT operators). If that returns zero rows — common for
 * 5+ token natural-language queries because not every term is present in
 * every relevant doc — falls back to an OR-quorum query so recall stays
 * useful. Cover-density rank (flag 32) still produces a meaningful ordering
 * because docs matching more terms accumulate higher rank.
 */
export async function bm25Search(
  tx: NeonDatabase,
  query: string,
  limit = 20,
): Promise<BM25Hit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const andRows = await tx.execute(sql`
    WITH tsq AS (SELECT websearch_to_tsquery('english', ${trimmed}) AS q)
    SELECT id AS doc_id,
           ts_rank_cd(search_tsv, tsq.q, 32) AS rank
      FROM corpus_documents, tsq
     WHERE search_tsv @@ tsq.q
     ORDER BY rank DESC
     LIMIT ${limit}
  `);
  if (andRows.rows.length > 0) {
    return (andRows.rows as Array<{ doc_id: string; rank: number | string }>).map(
      (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
    );
  }

  const orQuery = buildOrQuorum(trimmed);
  if (!orQuery) return [];

  const orRows = await tx.execute(sql`
    WITH tsq AS (SELECT to_tsquery('english', ${orQuery}) AS q)
    SELECT id AS doc_id,
           ts_rank_cd(search_tsv, tsq.q, 32) AS rank
      FROM corpus_documents, tsq
     WHERE search_tsv @@ tsq.q
     ORDER BY rank DESC
     LIMIT ${limit}
  `);
  return (orRows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}

// Sanitize and OR-join tokens for to_tsquery. to_tsquery is operator-aware
// and rejects raw punctuation, so we strip everything but [a-z0-9], drop
// tokens shorter than 2 chars, and join with ` | `. Empty result is valid
// (caller treats as zero hits).
export function buildOrQuorum(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 2)
    .join(" | ");
}
