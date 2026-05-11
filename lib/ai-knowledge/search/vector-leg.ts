// F-4 — Dense vector retrieval leg for hybrid search (F-31).
//
// Queries corpus_embeddings via pgvector cosine distance (<=>) with
// hnsw.ef_search bumped to 100 inside a transaction. Acceptance: EXPLAIN
// (ANALYZE, BUFFERS) MUST show "Index Scan using corpus_embeddings_hnsw_idx"
// (see drizzle/0003_corpus.sql for index definition: m=16, ef_construction=200).
//
// Runs inside the caller's actor transaction; the SET LOCAL is scoped to
// the same transaction so it doesn't leak across pool connections.

import "server-only";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export interface VectorHit {
  doc_id: string;
  rank: number; // distance (lower is closer); ranks are inverted by RRF anyway
}

/**
 * Vector retrieval leg. Caller passes the query embedding (768-dim
 * Matryoshka) and a transaction. We dedupe by document_id (a doc has
 * multiple chunk embeddings; the best chunk wins) and return the top-K.
 *
 * hnsw.ef_search = 100 trades latency for recall. Default is 40; pgvector
 * docs recommend ~100 for production workloads.
 *
 * pgvector accepts vectors as the string form "[v1,v2,...]" via parameter
 * binding (the OpenAI helper returns number[]; we serialize once here).
 */
export async function vectorSearch(
  tx: NeonDatabase,
  queryEmbedding: number[],
  limit = 20,
): Promise<VectorHit[]> {
  if (queryEmbedding.length === 0) return [];
  await tx.execute(sql`SET LOCAL hnsw.ef_search = 100`);
  const vec = "[" + queryEmbedding.join(",") + "]";
  const rows = await tx.execute(sql`
    SELECT document_id AS doc_id,
           MIN(embedding <=> ${vec}::vector) AS rank
      FROM corpus_embeddings
     GROUP BY document_id
     ORDER BY rank ASC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}
