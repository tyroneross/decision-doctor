// F-9 — Hybrid-search API route.
//
// GET /api/search?q=<query>&scope=<global|my|both>&limit=<n>
//
// Pipeline (sequential by call dependency, parallel where possible):
//   1. embedQuery(q)           → 768-dim vector (network call, ~120ms)
//   2. legs run in parallel    → bm25, vector, kg (one tx each, RLS scoped)
//   3. rrfFuse(legs)           → fused top-K (in-memory)
//   4. rerank(top-K)           → bge → gpt4o-mini fallback
//   5. write ai_search_queries → observability row (100ms timeout, non-fatal)
//   6. respond                 → { results, total_ms, degraded, source }
//
// runtime = 'nodejs' is mandatory: the @neondatabase/serverless driver and
// the openai SDK both require Node.js APIs (WebSocket, fetch streaming).

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { embedQuery } from "@/lib/ai-knowledge/embed/openai";
import { bm25Search } from "@/lib/ai-knowledge/search/bm25-leg";
import { vectorSearch } from "@/lib/ai-knowledge/search/vector-leg";
import { kgSearch } from "@/lib/ai-knowledge/search/kg-leg";
import { rrfFuse, type LegHit } from "@/lib/ai-knowledge/search/rrf-fusion";
import { rerank } from "@/lib/ai-knowledge/rerank/bge-client";
import { gpt4oRerank } from "@/lib/ai-knowledge/rerank/gpt4o-fallback";
import { getSessionActor } from "@/lib/auth-session";
import { runWithActor, withActor, db } from "@/lib/db/actor";
import type { RerankResult } from "@/lib/ai-knowledge/rerank/types";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().min(1).max(500),
  scope: z.enum(["global", "my", "both"]).optional().default("both"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

type LegName = "bm25" | "vector" | "kg";

interface SearchResult {
  doc_id: string;
  title: string;
  source_url: string;
  snippet: string;
  score: number;
  legs: LegName[];
}

export async function GET(req: Request) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q"),
    scope: searchParams.get("scope") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { q, limit } = parsed.data;

  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Phase 1 — embed the query (network).
  let embedding: number[];
  try {
    embedding = await embedQuery(q);
  } catch (err) {
    return NextResponse.json(
      { error: "embed_failed", detail: String(err) },
      { status: 502 },
    );
  }

  // Phase 2 — three legs in parallel. Each leg runs in its own tx so
  // RLS GUCs scope correctly. We time each leg independently for the
  // observability row.
  const legTiming: Record<LegName, number> = { bm25: 0, vector: 0, kg: 0 };
  const runLeg = <T>(
    name: LegName,
    fn: (tx: Parameters<Parameters<typeof withActor>[0]>[0]) => Promise<T>,
  ): Promise<T> => {
    const start = Date.now();
    return runWithActor({ userId: actor.userId, tenantId: actor.tenantId }, async () =>
      withActor(async (tx) => {
        const out = await fn(tx);
        legTiming[name] = Date.now() - start;
        return out;
      }),
    );
  };

  const [bm25Hits, vectorHits, kgHits] = await Promise.all([
    runLeg("bm25", (tx) => bm25Search(tx, q, 20)).catch(() => []),
    runLeg("vector", (tx) => vectorSearch(tx, embedding, 20)).catch(() => []),
    runLeg("kg", (tx) => kgSearch(tx, q, 20)).catch(() => []),
  ]);

  // Phase 3 — RRF fusion.
  const fused = rrfFuse({
    bm25: bm25Hits as LegHit[],
    vector: vectorHits as LegHit[],
    kg: kgHits as LegHit[],
  });

  if (fused.length === 0) {
    const total = Date.now() - t0;
    // Best-effort observability write; never block the response on it.
    void logSearch({
      userId: actor.userId,
      query: q,
      result_count: 0,
      lex_ms: legTiming.bm25,
      vec_ms: legTiming.vector,
      kg_ms: legTiming.kg,
      rerank_ms: 0,
      total_ms: total,
      degraded: false,
      degraded_reason: null,
    });
    return NextResponse.json({
      results: [],
      total_ms: total,
      degraded: false,
      source: "passthrough",
    });
  }

  // Phase 4 — hydrate top candidates for rerank. Cap at 30 (matches the
  // gpt-4o-mini fallback's MAX_DOCS).
  const candidateIds = fused.slice(0, 30).map((f) => f.doc_id);
  const candidateRows = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) =>
        tx.execute(sql`
          SELECT id, title, source_url, body
            FROM corpus_documents
           WHERE id = ANY(${candidateIds}::uuid[])
        `),
      ),
  );
  const hydrated = new Map<
    string,
    { id: string; title: string; source_url: string; body: string }
  >();
  for (const r of candidateRows.rows as Array<{
    id: string;
    title: string;
    source_url: string;
    body: string;
  }>) {
    hydrated.set(r.id, r);
  }

  let rerankResult: RerankResult;
  try {
    rerankResult = await rerank(
      {
        query: q,
        docs: candidateIds.flatMap((id) => {
          const row = hydrated.get(id);
          return row ? [{ id, text: row.body }] : [];
        }),
      },
      gpt4oRerank,
    );
  } catch (err) {
    rerankResult = {
      doc_ids: candidateIds,
      degraded: true,
      degraded_reason: "fallback_failed",
      rerank_ms: 0,
      source: "passthrough",
    };
  }

  // Phase 5 — assemble final results.
  const results: SearchResult[] = rerankResult.doc_ids
    .slice(0, limit)
    .flatMap((id) => {
      const row = hydrated.get(id);
      const fusedEntry = fused.find((f) => f.doc_id === id);
      if (!row || !fusedEntry) return [];
      return [
        {
          doc_id: id,
          title: row.title,
          source_url: row.source_url,
          snippet: row.body.slice(0, 300).replace(/\s+/g, " "),
          score: fusedEntry.score,
          legs: fusedEntry.legs as LegName[],
        },
      ];
    });

  const total_ms = Date.now() - t0;

  // Phase 6 — observability write BEFORE the response. Best-effort; the
  // outer response is the load-bearing piece. 100ms budget.
  await logSearch({
    userId: actor.userId,
    query: q,
    result_count: results.length,
    lex_ms: legTiming.bm25,
    vec_ms: legTiming.vector,
    kg_ms: legTiming.kg,
    rerank_ms: rerankResult.rerank_ms,
    total_ms,
    degraded: rerankResult.degraded,
    degraded_reason: rerankResult.degraded_reason,
  });

  return NextResponse.json({
    results,
    total_ms,
    degraded: rerankResult.degraded,
    source: rerankResult.source,
  });
}

interface SearchLogInput {
  userId: string;
  query: string;
  result_count: number;
  lex_ms: number;
  vec_ms: number;
  kg_ms: number;
  rerank_ms: number;
  total_ms: number;
  degraded: boolean;
  degraded_reason: string | null;
}

async function logSearch(input: SearchLogInput): Promise<void> {
  const ABORT = new AbortController();
  const t = setTimeout(() => ABORT.abort(), 100);
  try {
    await Promise.race([
      db.execute(sql`
        INSERT INTO ai_search_queries
          (user_id, query_text, result_count, lexical_ms, vector_ms, kg_ms,
           rerank_ms, total_ms, degraded, degraded_reason)
        VALUES
          (${input.userId}::uuid, ${input.query}, ${input.result_count},
           ${input.lex_ms}, ${input.vec_ms}, ${input.kg_ms},
           ${input.rerank_ms}, ${input.total_ms}, ${input.degraded},
           ${input.degraded_reason})
      `),
      new Promise<never>((_, reject) =>
        ABORT.signal.addEventListener("abort", () =>
          reject(new Error("logSearch timeout")),
        ),
      ),
    ]);
  } catch {
    // Non-fatal. Observability degradation is not a user-facing failure.
  } finally {
    clearTimeout(t);
  }
}
