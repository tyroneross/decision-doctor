// Title-discovery leg for /api/search.
//
// This leg keeps articles with metadata-only bodies discoverable by title.
// They can appear in search result surfaces with a badge, but /app/ask still
// filters metadata-only rows out before answer synthesis.

import "server-only";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { audienceClauseFor } from "@/lib/audience/filter";
import type { SearchScope } from "@/lib/db/schema";

export interface TitleHit {
  doc_id: string;
  rank: number;
}

export async function titleSearch(
  tx: NeonDatabase,
  query: string,
  limit = 20,
  scope: SearchScope = "focused",
): Promise<TitleHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const like = `%${trimmed.toLowerCase()}%`;
  // Track A audience filter at corpus_documents.id.
  const aud = audienceClauseFor({
    scope,
    contentType: "corpus_document",
    docIdColumn: sql.raw("corpus_documents.id"),
  });

  const rows = await tx.execute(sql`
    WITH tsq AS (SELECT websearch_to_tsquery('english', ${trimmed}) AS q)
    SELECT id AS doc_id,
           (
             CASE WHEN lower(title) LIKE ${like} THEN 10 ELSE 0 END
             + ts_rank_cd(search_tsv, tsq.q, 32)
           )::float AS rank
      FROM corpus_documents, tsq
     WHERE (
             lower(title) LIKE ${like}
             OR search_tsv @@ tsq.q
           )
       AND coalesce(metadata->'content_extract'->>'body_kind', 'full_text')
           NOT IN ('blocked', 'degraded')
       ${aud.where}
     ORDER BY rank DESC
     LIMIT ${limit}
  `);

  return (rows.rows as Array<{ doc_id: string; rank: number | string }>).map(
    (r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }),
  );
}
