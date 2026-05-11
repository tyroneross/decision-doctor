// F-5 — Knowledge-graph retrieval leg for hybrid search (F-31).
//
// Three steps:
//   1. Canonicalize query into entities. Exact match first (lower(canonical_name)
//      OR aliases @> ARRAY[token]), then pg_trgm similarity fallback for typos.
//   2. Expand 1-hop through ai_relationships (both directions).
//   3. Join through ai_document_entity_mentions to surface document ids,
//      ranked by sum(mention_count * confidence).
//
// 1-hop only: 2-hop expansion explodes recall noise on a graph this small
// (411 entities, 335 edges). See .build-loop/memory/decision_kg_leg_expansion_depth.md.
//
// Returns [] gracefully when the KG has zero entity matches — KG is a
// recall booster, not a hard requirement. The lexical + vector legs still
// fire from F-9.

import "server-only";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export interface KGHit {
  doc_id: string;
  rank: number;
}

// Tokenize for KG canonicalization. Keep tokens of length ≥ 3 to avoid
// matching every stopword via trigram similarity.
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * KG retrieval leg. Empty KG, empty token set, or no entity match all
 * return [] — call-site composes the legs via RRF, which is robust to
 * one leg being silent.
 */
export async function kgSearch(
  tx: NeonDatabase,
  query: string,
  limit = 20,
): Promise<KGHit[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  // Single SQL pass: resolve seed entities, 1-hop expansion, mention rollup.
  // We use UNION ALL to merge seeds + 1-hop neighbors before joining
  // through mentions so a doc that mentions both a seed AND a neighbor
  // accumulates rank from both paths.
  const rows = await tx.execute(sql`
    WITH seed AS (
      SELECT DISTINCT id
        FROM ai_entities
       WHERE lower(canonical_name) = ANY(${tokens}::text[])
          OR aliases && ${tokens}::text[]
          OR EXISTS (
               SELECT 1 FROM unnest(${tokens}::text[]) AS t(tok)
                WHERE similarity(lower(canonical_name), t.tok) > 0.5
             )
    ),
    expanded AS (
      SELECT id FROM seed
      UNION
      SELECT r.target_entity_id AS id
        FROM ai_relationships r JOIN seed ON seed.id = r.source_entity_id
      UNION
      SELECT r.source_entity_id AS id
        FROM ai_relationships r JOIN seed ON seed.id = r.target_entity_id
    )
    SELECT m.document_id AS doc_id,
           SUM(m.mention_count * m.confidence)::float AS rank
      FROM ai_document_entity_mentions m
      JOIN expanded e ON e.id = m.entity_id
     GROUP BY m.document_id
     ORDER BY rank DESC
     LIMIT ${limit}
  `);
  return (rows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}
