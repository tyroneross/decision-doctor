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
 * websearch_to_tsquery sanitizes user input and supports "phrase queries"
 * + AND/OR/NOT operators. ts_rank_cd flag 32 normalizes by 1 + log(unique
 * words in document) — closest builtin to BM25's length normalization.
 */
export async function bm25Search(
  tx: NeonDatabase,
  query: string,
  limit = 20,
): Promise<BM25Hit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await tx.execute(sql`
    WITH tsq AS (SELECT websearch_to_tsquery('english', ${trimmed}) AS q)
    SELECT id AS doc_id,
           ts_rank_cd(search_tsv, tsq.q, 32) AS rank
      FROM corpus_documents, tsq
     WHERE search_tsv @@ tsq.q
     ORDER BY rank DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}
