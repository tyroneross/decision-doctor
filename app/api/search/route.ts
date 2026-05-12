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
import { createHash } from "crypto";
import { embedQuery } from "@/lib/ai-knowledge/embed/openai";
import { bm25Search } from "@/lib/ai-knowledge/search/bm25-leg";
import { vectorSearch } from "@/lib/ai-knowledge/search/vector-leg";
import { kgSearch } from "@/lib/ai-knowledge/search/kg-leg";
import { librarySearch } from "@/lib/ai-knowledge/search/library-leg";
import { rrfFuse, type LegHit } from "@/lib/ai-knowledge/search/rrf-fusion";
import { rerank } from "@/lib/ai-knowledge/rerank/bge-client";
import { gpt4oRerank } from "@/lib/ai-knowledge/rerank/gpt4o-fallback";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { runWithActor, withActor, db } from "@/lib/db/actor";
import { auditEvents } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/ratelimit";
import type { RerankResult } from "@/lib/ai-knowledge/rerank/types";
import {
  type BodyKind,
  normalizeBodyKind,
  isBlockedBodyKind,
} from "@/lib/corpus/body-kind";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().min(1).max(500),
  scope: z.enum(["global", "my", "both"]).optional().default("both"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

type LegName = "bm25" | "vector" | "kg" | "library";

interface SearchResult {
  doc_id: string;
  title: string;
  source_url: string;
  snippet: string;
  score: number;
  legs: LegName[];
  kind?: string; // 'corpus' for existing legs; 'library:<table>' for library hits
  /**
   * V2 trust-tier for corpus hits. Null/omitted for library hits and for
   * pre-backfill corpus rows (callers treat null as `full_text`). The BM25 /
   * vector / kg legs already filter `blocked` / `degraded` / `metadata_only`
   * upstream; if such a row leaks through (defense in depth) the route drops
   * the hit before responding so the UI never surfaces it as a citation.
   */
  body_kind?: BodyKind | null;
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

  // Search is intentionally accessible to guests. The corpus is curated AI-
  // adoption content; users (signed-in or not) need to browse it to find
  // recommendations and prompts. RLS on corpus_documents enforces
  // `scope='global' OR scope=current_user_id` — guests have no user_id, so
  // RLS naturally narrows their results to global content. The "my" scope
  // option is a no-op for guests (returns the same as global).
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // S1: Rate limit — authed users share the same CAP bucket as /api/chat.
  // Guests use a synthetic key; they get a lower effective cap from the
  // shared in-memory bucket (single key for all guests in this process).
  const rl = await checkRateLimit(
    actor?.userId ?? "00000000-0000-0000-0000-guest000000000",
  );
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Search rate limit reached. Try again shortly.",
        retry_after: Math.ceil((rl.resetAt - Date.now()) / 1000),
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  // Synthetic UUIDs for guest's actor context — only used to call
  // runWithActor below; RLS GUC for app.current_user_id stays unset for
  // the global-only path.
  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

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

  // Phase 2 — four legs in parallel. Each corpus leg runs in its own tx so
  // RLS GUCs scope correctly. Library leg uses runWithActor internally.
  // We time each leg independently for the observability row.
  const legTiming: Record<LegName, number> = { bm25: 0, vector: 0, kg: 0, library: 0 };
  const runLeg = <T>(
    name: LegName,
    fn: (tx: Parameters<Parameters<typeof withActor>[0]>[0]) => Promise<T>,
  ): Promise<T> => {
    const start = Date.now();
    return runWithActor({ userId, tenantId }, async () =>
      withActor(async (tx) => {
        const out = await fn(tx);
        legTiming[name] = Date.now() - start;
        return out;
      }),
    );
  };

  // S1: Library leg — runs its own runWithActor internally.
  const libStart = Date.now();
  const [bm25Hits, vectorHits, kgHits, libraryHits] = await Promise.all([
    runLeg("bm25", (tx) => bm25Search(tx, q, 20)).catch(() => []),
    runLeg("vector", (tx) => vectorSearch(tx, embedding, 20)).catch(() => []),
    runLeg("kg", (tx) => kgSearch(tx, q, 20)).catch(() => []),
    librarySearch(q, { actor: { userId, tenantId } })
      .then((hits) => {
        legTiming.library = Date.now() - libStart;
        return hits;
      })
      .catch(() => []),
  ]);

  // Map library hits to LegHit shape for RRF fusion.
  // Library hits use their own UUID as doc_id (not corpus_documents UUIDs).
  const libraryLegHits: LegHit[] = (libraryHits as Array<{ doc_id: string; rank: number }>).map(
    (h) => ({ doc_id: h.doc_id, rank: h.rank }),
  );

  // Phase 3 — RRF fusion across all 4 legs.
  const fused = rrfFuse({
    bm25: bm25Hits as LegHit[],
    vector: vectorHits as LegHit[],
    kg: kgHits as LegHit[],
    library: libraryLegHits,
  });

  if (fused.length === 0) {
    const total = Date.now() - t0;
    const queryHash = createHash("sha256").update(q).digest("hex").slice(0, 16);
    // Best-effort observability writes; never block the response on them.
    void logSearch({
      userId,
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
    if (actor) {
      void logAuditEvent({
        userId: actor.userId,
        tenantId: actor.tenantId,
        queryHash,
        legCounts: {
          bm25: (bm25Hits as LegHit[]).length,
          vector: (vectorHits as LegHit[]).length,
          kg: (kgHits as LegHit[]).length,
          library: (libraryHits as Array<unknown>).length,
        },
        latency_ms: total,
        rerankSource: "passthrough",
        degraded: false,
        degradedReason: null,
      });
    }
    return NextResponse.json({
      results: [],
      total_ms: total,
      degraded: false,
      source: "passthrough",
    });
  }

  // S1: Separate library hits from corpus hits so we can hydrate them
  // independently. Library hits are already hydrated (title + snippet from
  // librarySearch). Corpus hits need a DB fetch.
  const libraryHitMap = new Map(
    (libraryHits as Array<{ doc_id: string; kind: string; title: string; snippet: string }>).map(
      (h) => [h.doc_id, h] as const,
    ),
  );
  const corpusCandidateIds = fused
    .slice(0, 30)
    .map((f) => f.doc_id)
    .filter((id) => !libraryHitMap.has(id));

  // Phase 4 — hydrate corpus candidates for rerank. Cap at 30.
  // Library hits participate in RRF fusion but skip corpus hydration.
  // V2: also pull body_kind from metadata->'content_extract' so we can
  // (a) defensively drop any blocked/degraded row that slipped past the
  // upstream leg filter, and (b) propagate the trust tier to the response.
  const hydrated = new Map<
    string,
    {
      id: string;
      title: string;
      source_url: string;
      body: string;
      body_kind: BodyKind | null;
    }
  >();

  if (corpusCandidateIds.length > 0) {
    const candidateRows = await runWithActor(
      { userId, tenantId },
      async () =>
        withActor(async (tx) =>
          tx.execute(sql`
            SELECT id, title, source_url, body,
                   (metadata->'content_extract'->>'body_kind') AS body_kind
              FROM corpus_documents
             WHERE id IN (${sql.join(
               corpusCandidateIds.map((id) => sql`${id}::uuid`),
               sql`, `,
             )})
          `),
        ),
    );
    for (const r of candidateRows.rows as Array<{
      id: string;
      title: string;
      source_url: string;
      body: string;
      body_kind: string | null;
    }>) {
      // Defense in depth: skip any row whose body_kind is explicitly
      // blocked / degraded / metadata_only. Null and unknown values are
      // treated as full_text per back-compat policy.
      if (isBlockedBodyKind(r.body_kind)) continue;
      hydrated.set(r.id, {
        id: r.id,
        title: r.title,
        source_url: r.source_url,
        body: r.body,
        body_kind: r.body_kind as BodyKind | null,
      });
    }
  }

  let rerankResult: RerankResult;
  try {
    rerankResult = await rerank(
      {
        query: q,
        docs: fused.slice(0, 30).flatMap((f) => {
          const id = f.doc_id;
          const libHit = libraryHitMap.get(id);
          if (libHit) {
            return [{ id, text: `${libHit.title}\n\n${libHit.snippet}`.slice(0, 1500) }];
          }
          const row = hydrated.get(id);
          // Many openai-news docs have body=58 chars (CDP loader placeholder)
          // while title carries real signal. Always prepend title so the
          // cross-encoder / listwise judge has something to anchor on.
          return row
            ? [{ id, text: `${row.title}\n\n${row.body}`.slice(0, 1500) }]
            : [];
        }),
      },
      gpt4oRerank,
    );
  } catch (err) {
    rerankResult = {
      doc_ids: fused.slice(0, 30).map((f) => f.doc_id),
      degraded: true,
      degraded_reason: "fallback_failed",
      rerank_ms: 0,
      source: "passthrough",
    };
  }

  // Phase 5 — assemble final results. Library hits surface with kind badge;
  // corpus hits surface without kind (treated as 'corpus' implicitly).
  const results: SearchResult[] = rerankResult.doc_ids
    .slice(0, limit)
    .flatMap<SearchResult>((id) => {
      const fusedEntry = fused.find((f) => f.doc_id === id);
      if (!fusedEntry) return [];

      // Library hit — already hydrated; no source_url (library rows don't have one).
      const libHit = libraryHitMap.get(id);
      if (libHit) {
        return [
          {
            doc_id: id,
            title: libHit.title,
            source_url: "",
            snippet: libHit.snippet,
            score: fusedEntry.score,
            legs: fusedEntry.legs as LegName[],
            kind: libHit.kind,
          } satisfies SearchResult,
        ];
      }

      // Corpus hit.
      const row = hydrated.get(id);
      if (!row) return [];
      return [
        {
          doc_id: id,
          title: row.title,
          source_url: row.source_url,
          snippet: row.body.slice(0, 300).replace(/\s+/g, " "),
          score: fusedEntry.score,
          legs: fusedEntry.legs as LegName[],
          // Surface body_kind on every corpus hit so the QA route, Library
          // page, and command palette can badge partial-trust sources and
          // never render blocked/degraded bodies. NULL = back-compat
          // full_text; consumers normalize via lib/corpus/body-kind.ts.
          body_kind: normalizeBodyKind(row.body_kind),
        } satisfies SearchResult,
      ];
    });

  const total_ms = Date.now() - t0;

  // S1: SHA-256 hash of the query (first 16 hex chars) for audit log.
  // We NEVER log raw query content — GDPR + compliance requirement.
  const queryHash = createHash("sha256").update(q).digest("hex").slice(0, 16);

  // Phase 6 — observability writes (best-effort, 100ms budget each):
  //   a) ai_search_queries row (F-31 pattern — existing)
  //   b) audit_events row (S1 — new; only for authed users, synthetic UUIDs
  //      violate the tenants FK so guests are skipped)
  const legCounts = {
    bm25: (bm25Hits as LegHit[]).length,
    vector: (vectorHits as LegHit[]).length,
    kg: (kgHits as LegHit[]).length,
    library: (libraryHits as Array<unknown>).length,
  };

  void logSearch({
    userId,
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

  // S1: audit_events row — authed users only (tenants FK is NOT NULL).
  if (actor) {
    void logAuditEvent({
      userId: actor.userId,
      tenantId: actor.tenantId,
      queryHash,
      legCounts,
      latency_ms: total_ms,
      rerankSource: rerankResult.source,
      degraded: rerankResult.degraded,
      degradedReason: rerankResult.degraded_reason,
    });
  }

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

// S1: Audit event logger for search calls.
// Only called for authed users. Raw query content is NEVER included.
interface AuditSearchInput {
  userId: string;
  tenantId: string;
  queryHash: string;
  legCounts: Record<string, number>;
  latency_ms: number;
  rerankSource: string;
  degraded: boolean;
  degradedReason: string | null;
}

async function logAuditEvent(input: AuditSearchInput): Promise<void> {
  const ABORT = new AbortController();
  const t = setTimeout(() => ABORT.abort(), 100);
  try {
    await Promise.race([
      runWithActor(
        { userId: input.userId, tenantId: input.tenantId },
        async () =>
          withActor(async (tx) =>
            tx.insert(auditEvents).values({
              userId: input.userId,
              tenantId: input.tenantId,
              action: "search.call",
              metadata: {
                query_hash: input.queryHash,
                leg_counts: input.legCounts,
                latency_ms: input.latency_ms,
                rerank_source: input.rerankSource,
                degraded: input.degraded,
                degraded_reason: input.degradedReason,
              },
            }),
          ),
      ),
      new Promise<never>((_, reject) =>
        ABORT.signal.addEventListener("abort", () =>
          reject(new Error("logAuditEvent timeout")),
        ),
      ),
    ]);
  } catch {
    // Non-fatal. Audit degradation is not a user-facing failure.
  } finally {
    clearTimeout(t);
  }
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
