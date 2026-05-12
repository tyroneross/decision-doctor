// GET /api/search/suggest?q=<partial>&limit=<n>
//
// Predictive search for visible search boxes. This is intentionally title-first:
// it helps users discover corpus, library, and KB items while they type. It
// includes metadata_only corpus titles but does not treat low-trust article
// bodies as answer-grounding material.

import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { runWithActor, withActor } from "@/lib/db/actor";
import { normalizeBodyKind, type BodyKind } from "@/lib/corpus/body-kind";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(12).optional().default(8),
});

interface RawSuggestion {
  id: string;
  title: string;
  kind: string;
  source: string | null;
  source_url: string | null;
  body_kind: string | null;
  score: number | string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q")?.trim(),
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;
  const q = parsed.data.q;
  const like = `%${q.toLowerCase()}%`;

  const rows = await runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const result = await tx.execute(sql`
        WITH input AS (
          SELECT ${like}::text AS needle,
                 websearch_to_tsquery('english', ${q}) AS tsq
        ),
        corpus AS (
          SELECT id::text,
                 title,
                 'corpus'::text AS kind,
                 source_type AS source,
                 source_url,
                 (metadata->'content_extract'->>'body_kind') AS body_kind,
                 (
                   CASE WHEN lower(title) LIKE (SELECT needle FROM input) THEN 10 ELSE 0 END
                   + ts_rank_cd(search_tsv, (SELECT tsq FROM input), 32)
                 )::float AS score
            FROM corpus_documents
           WHERE (
                   lower(title) LIKE (SELECT needle FROM input)
                   OR search_tsv @@ (SELECT tsq FROM input)
                 )
             AND coalesce(metadata->'content_extract'->>'body_kind', 'full_text')
                 NOT IN ('blocked', 'degraded')
        ),
        library AS (
          SELECT id::text,
                 title,
                 kind,
                 pain_path AS source,
                 NULL::text AS source_url,
                 NULL::text AS body_kind,
                 (
                   CASE WHEN lower(title) LIKE (SELECT needle FROM input) THEN 9 ELSE 0 END
                   + ts_rank_cd(search_tsv, (SELECT tsq FROM input), 32)
                 )::float AS score
            FROM (
              SELECT id, title, pain_path, search_tsv, 'use_case'::text AS kind FROM library_use_cases
              UNION ALL
              SELECT id, title, pain_path, search_tsv, 'prompt'::text AS kind FROM library_prompts
              UNION ALL
              SELECT id, title, pain_path, search_tsv, 'skill'::text AS kind FROM library_skills
              UNION ALL
              SELECT id, title, pain_path, search_tsv, 'plugin'::text AS kind FROM library_plugins
            ) l
           WHERE lower(title) LIKE (SELECT needle FROM input)
              OR search_tsv @@ (SELECT tsq FROM input)
        ),
        kb AS (
          SELECT id::text,
                 title,
                 'kb_article'::text AS kind,
                 slug AS source,
                 NULL::text AS source_url,
                 NULL::text AS body_kind,
                 (
                   CASE WHEN lower(title) LIKE (SELECT needle FROM input) THEN 8 ELSE 0 END
                   + ts_rank_cd(search_tsv, (SELECT tsq FROM input), 32)
                 )::float AS score
            FROM kb_articles
           WHERE lower(title) LIKE (SELECT needle FROM input)
              OR search_tsv @@ (SELECT tsq FROM input)
        )
        SELECT * FROM corpus
        UNION ALL SELECT * FROM library
        UNION ALL SELECT * FROM kb
        ORDER BY score DESC, title ASC
        LIMIT ${parsed.data.limit}
      `);
      return result.rows as unknown as RawSuggestion[];
    }),
  );

  return NextResponse.json({
    suggestions: rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      source: row.source,
      sourceUrl: row.source_url,
      bodyKind: row.body_kind ? (normalizeBodyKind(row.body_kind) as BodyKind) : null,
    })),
  });
}
