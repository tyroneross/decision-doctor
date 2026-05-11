// F-3 — Lexical retrieval leg for hybrid search (F-31).
//
// Filename retains "bm25-leg" for stream continuity with the F-31 design.
// Implementation is Postgres-core FTS (tsvector + GIN + ts_rank_cd), NOT
// strict BM25. See .build-loop/memory/decision_f1_tsvector_pivot.md for
// why we substituted paradedb's pg_search (deprecated on Neon as of
// 2026-05-11).
//
// Uses `body_tsv` (body-only) per the F-1 pivot brief. The live DB also
// exposes `search_tsv` (title-weighted A + body-weighted B), which is a
// fallback target if F-12 recall@10 falls short.
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
           ts_rank_cd(body_tsv, tsq.q, 32) AS rank
      FROM corpus_documents, tsq
     WHERE body_tsv @@ tsq.q
     ORDER BY rank DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}
