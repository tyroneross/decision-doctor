// lib/ai-knowledge/search/library-leg.ts — S1: 4th retrieval leg for /api/search.
//
// Queries all 4 library tables (library_use_cases, library_prompts,
// library_skills, library_plugins) using the same tsvector + OR-quorum
// pattern from lib/library/index.ts searchLibrary().
//
// Returns LegHit[] matching the shape used by the existing 3 corpus legs
// (bm25/vector/kg) so rrfFuse() can blend results without changes.
//
// Each hit carries kind: 'library:<table_short_name>' so the fused result
// response can badge the source. The doc_id is the library table's UUID —
// NOT a corpus_documents UUID. Callers must handle this distinction when
// hydrating snippets.
//
// Runs through runWithActor so RLS applies:
//   - Global rows (scope='global') visible to all actors including guests.
//   - User-scoped rows visible only to the matching actor.

import "server-only";
import { sql } from "drizzle-orm";
import { runWithActor, withActor } from "@/lib/db/actor";

export interface LibraryLegHit {
  doc_id: string;
  rank: number;
  kind: string; // 'library:use_cases' | 'library:prompts' | 'library:skills' | 'library:plugins'
  title: string;
  snippet: string;
}

export interface SearchContext {
  actor: {
    userId: string;
    tenantId: string;
  };
}

// Matches the LegHit shape expected by rrfFuse() — rank is the tsvector score.
// The extended fields (kind, title, snippet) are for the final result assembly.
export type { LibraryLegHit as LegHitExtended };

const QUORUM_MIN_HITS = 3;

/**
 * Build OR-quorum tsquery string: tokens joined with ' | '.
 * Strips non-word chars, drops tokens ≤ 2 chars.
 * Same logic as lib/library/index.ts buildOrQuery().
 */
function buildOrQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 2);
  return tokens.join(" | ");
}

interface RawRow {
  doc_id: string;
  title: string;
  body: string;
  rank: number | string;
}

async function searchOneTable(
  tx: Parameters<Parameters<typeof withActor>[0]>[0],
  tableName: string,
  query: string,
): Promise<RawRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Strict pass: websearch_to_tsquery (AND semantics)
  const strictResult = await tx.execute(sql`
    SELECT id AS doc_id, title, body,
           ts_rank_cd(search_tsv, websearch_to_tsquery('english', ${trimmed}), 32) AS rank
      FROM ${sql.raw(tableName)}
     WHERE search_tsv @@ websearch_to_tsquery('english', ${trimmed})
     ORDER BY rank DESC
     LIMIT 20
  `);
  const strictRows = strictResult.rows as unknown as RawRow[];

  if (strictRows.length >= QUORUM_MIN_HITS) {
    return strictRows;
  }

  // OR-quorum fallback: to_tsquery with | (OR semantics)
  const orQuery = buildOrQuery(trimmed);
  if (!orQuery) return strictRows;

  const fallbackResult = await tx.execute(sql`
    SELECT id AS doc_id, title, body,
           ts_rank_cd(search_tsv, to_tsquery('english', ${orQuery}), 32) AS rank
      FROM ${sql.raw(tableName)}
     WHERE search_tsv @@ to_tsquery('english', ${orQuery})
     ORDER BY rank DESC
     LIMIT 20
  `);
  const fallbackRows = fallbackResult.rows as unknown as RawRow[];

  // Merge: deduplicate by doc_id, keep highest rank.
  const merged = new Map<string, RawRow>();
  for (const row of [...strictRows, ...fallbackRows]) {
    const existing = merged.get(row.doc_id);
    const rankNum = Number(row.rank);
    const existingRank = existing ? Number(existing.rank) : -Infinity;
    if (!existing || rankNum > existingRank) {
      merged.set(row.doc_id, row);
    }
  }
  return Array.from(merged.values());
}

/**
 * Library retrieval leg.
 *
 * Fans out to all 4 library tables concurrently within the same actor
 * transaction so RLS GUCs apply. Returns LibraryLegHit[] sorted by rank
 * descending, capped at 20 per table (80 total pre-fusion).
 *
 * Each hit's doc_id is the library row UUID. The `kind` field identifies
 * which table the hit came from so /api/search can badge it in results.
 */
export async function librarySearch(
  query: string,
  ctx: SearchContext,
): Promise<LibraryLegHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const hits: LibraryLegHit[] = [];

  const tables: Array<{ name: string; kind: string }> = [
    { name: "library_use_cases", kind: "library:use_cases" },
    { name: "library_prompts", kind: "library:prompts" },
    { name: "library_skills", kind: "library:skills" },
    { name: "library_plugins", kind: "library:plugins" },
  ];

  await runWithActor(
    { userId: ctx.actor.userId, tenantId: ctx.actor.tenantId },
    async () =>
      withActor(async (tx) => {
        await Promise.all(
          tables.map(async ({ name, kind }) => {
            const rows = await searchOneTable(tx, name, trimmed);
            for (const r of rows) {
              hits.push({
                doc_id: r.doc_id,
                rank: Number(r.rank),
                kind,
                title: r.title,
                snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
              });
            }
          }),
        );
      }),
  );

  // Sort descending by rank before returning.
  hits.sort((a, b) => b.rank - a.rank);
  return hits;
}
