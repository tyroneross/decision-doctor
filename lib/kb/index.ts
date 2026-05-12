// lib/kb/index.ts — Knowledge Base retrieval module.
//
// Runs all reads through runWithActor/withActor so RLS auto-applies:
//   - scope='global' rows visible to all actors (curated KB content).
//   - scope=user_id rows visible only to that user (future: user-saved KB notes).
// Guests call with synthetic UUID matching /api/search and /api/library/use-cases
// patterns (00000000-...).
//
// Search uses the search_tsv generated column (title=A, summary=B, body=C) with
// an OR-quorum fallback for multi-token queries that under-match strict
// websearch_to_tsquery. Mirrors the hardening item 9c pattern from lib/library/index.ts.

import "server-only";
import { sql } from "drizzle-orm";
import { runWithActor, withActor } from "@/lib/db/actor";
import type { KbArticle } from "@/lib/db/schema";

export type { KbArticle };

export interface KbActor {
  userId: string;
  tenantId: string;
}

const QUORUM_MIN_HITS = 3;

/**
 * Public-shape KB article — what the API + UI consume. Avoids leaking raw
 * column names; consumers only need these fields.
 */
export interface KbArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  reading_minutes: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface KbArticleFull extends KbArticleSummary {
  body: string;
}

function rowToSummary(r: KbArticle): KbArticleSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    reading_minutes: r.readingMinutes,
    display_order: r.displayOrder,
    created_at: (r.createdAt as unknown as Date).toISOString(),
    updated_at: (r.updatedAt as unknown as Date).toISOString(),
  };
}

function rowToFull(r: KbArticle): KbArticleFull {
  return { ...rowToSummary(r), body: r.body };
}

/**
 * List KB articles visible to the actor. Ordered by display_order asc, then
 * created_at desc.
 */
export async function listKbArticles(actor: KbActor): Promise<KbArticleSummary[]> {
  return runWithActor(actor, async () =>
    withActor(async (tx) => {
      const result = await tx.execute(sql`
        SELECT id, scope, slug, title, summary, body, reading_minutes,
               display_order, metadata, created_at, updated_at
          FROM kb_articles
         ORDER BY display_order ASC, created_at DESC
      `);
      const rows = result.rows as Array<{
        id: string;
        scope: string;
        slug: string;
        title: string;
        summary: string;
        body: string;
        reading_minutes: number | null;
        display_order: number;
        metadata: unknown;
        created_at: Date;
        updated_at: Date;
      }>;
      return rows.map((r) =>
        rowToSummary({
          id: r.id,
          scope: r.scope,
          slug: r.slug,
          title: r.title,
          summary: r.summary,
          body: r.body,
          readingMinutes: r.reading_minutes,
          displayOrder: r.display_order,
          metadata: r.metadata as KbArticle["metadata"],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        } as KbArticle),
      );
    }),
  );
}

/**
 * Fetch a single KB article by slug. Returns null if the slug doesn't exist
 * in the actor's scope (RLS-filtered).
 */
export async function getKbArticleBySlug(
  actor: KbActor,
  slug: string,
): Promise<KbArticleFull | null> {
  return runWithActor(actor, async () =>
    withActor(async (tx) => {
      const result = await tx.execute(sql`
        SELECT id, scope, slug, title, summary, body, reading_minutes,
               display_order, metadata, created_at, updated_at
          FROM kb_articles
         WHERE slug = ${slug}
         LIMIT 1
      `);
      const rows = result.rows as Array<{
        id: string;
        scope: string;
        slug: string;
        title: string;
        summary: string;
        body: string;
        reading_minutes: number | null;
        display_order: number;
        metadata: unknown;
        created_at: Date;
        updated_at: Date;
      }>;
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return rowToFull({
        id: r.id,
        scope: r.scope,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        body: r.body,
        readingMinutes: r.reading_minutes,
        displayOrder: r.display_order,
        metadata: r.metadata as KbArticle["metadata"],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as KbArticle);
    }),
  );
}

/**
 * Search KB articles by query. Strict pass first; OR-quorum fallback (item 9c)
 * if strict returns < QUORUM_MIN_HITS. Ranked by ts_rank_cd.
 */
export async function searchKbArticles(
  actor: KbActor,
  query: string,
): Promise<Array<KbArticleSummary & { rank: number }>> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return runWithActor(actor, async () =>
    withActor(async (tx) => {
      const strictResult = await tx.execute(sql`
        SELECT id, scope, slug, title, summary, body, reading_minutes,
               display_order, metadata, created_at, updated_at,
               ts_rank_cd(search_tsv, websearch_to_tsquery('english', ${trimmed}), 32) AS rank
          FROM kb_articles
         WHERE search_tsv @@ websearch_to_tsquery('english', ${trimmed})
         ORDER BY rank DESC
         LIMIT 20
      `);
      let rows = strictResult.rows as Array<{
        id: string;
        scope: string;
        slug: string;
        title: string;
        summary: string;
        body: string;
        reading_minutes: number | null;
        display_order: number;
        metadata: unknown;
        created_at: Date;
        updated_at: Date;
        rank: number | string;
      }>;

      if (rows.length < QUORUM_MIN_HITS) {
        // OR-quorum fallback. Build to_tsquery with | between terms.
        const tokens = trimmed
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => /^[a-z0-9]+$/i.test(t) && t.length >= 2);
        if (tokens.length > 0) {
          const orQuery = tokens.join(" | ");
          try {
            const fbResult = await tx.execute(sql`
              SELECT id, scope, slug, title, summary, body, reading_minutes,
                     display_order, metadata, created_at, updated_at,
                     ts_rank_cd(search_tsv, to_tsquery('english', ${orQuery}), 32) AS rank
                FROM kb_articles
               WHERE search_tsv @@ to_tsquery('english', ${orQuery})
               ORDER BY rank DESC
               LIMIT 20
            `);
            const fbRows = fbResult.rows as typeof rows;
            const seen = new Set(rows.map((r) => r.id));
            for (const fb of fbRows) {
              if (!seen.has(fb.id)) {
                rows.push(fb);
                seen.add(fb.id);
              }
            }
            rows.sort((a, b) => Number(b.rank) - Number(a.rank));
          } catch {
            // OR fallback failure → keep strict results
          }
        }
      }

      return rows.map((r) => ({
        ...rowToSummary({
          id: r.id,
          scope: r.scope,
          slug: r.slug,
          title: r.title,
          summary: r.summary,
          body: r.body,
          readingMinutes: r.reading_minutes,
          displayOrder: r.display_order,
          metadata: r.metadata as KbArticle["metadata"],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        } as KbArticle),
        rank: Number(r.rank),
      }));
    }),
  );
}
