// app/api/ai-adoption-qa/route.ts — Q1: AI-adoption conversational Q&A.
//
// POST /api/ai-adoption-qa
// Body: { question: string, mode?: "answer" | "results-only" }
//
// Pipeline:
//   1. Resolve actor (authed OR guest)
//   2. checkRateLimit
//   3. Zod-validate body
//   4. detectPHI — hard block before any LLM call
//   5. Retrieval via /api/search (internal function call via library module)
//   6. Rerank already done inside /api/search; pull top 5 for synthesis
//   7. Authed only: getPersonalizationContext (graceful no-op if E3 not landed)
//   8. shouldEmitEmptyGrounding — guard against zero-shot answers
//   9. synthesizeAnswer — Groq streaming with grounding prompt + citation events
//  10. SSE response via createSSEResponse
//  11. Audit row (authed only — tenants FK is NOT NULL)
//  12. ai_search_queries row for observability (guest + authed)
//
// runtime = 'nodejs' mandatory: Neon WebSocket pool + Groq streaming both
// require Node.js APIs.

import "server-only";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { checkRateLimit } from "@/lib/ratelimit";
import { detectPHI } from "@/lib/phi-guard";
import { runWithActor, withActor, db } from "@/lib/db/actor";
import { auditEvents } from "@/lib/db/schema";
import { shouldEmitEmptyGrounding } from "@/lib/qa/grounding";
import { synthesizeAnswer } from "@/lib/qa/synthesizer";
import {
  getPersonalizationContext,
  formatPersonalization,
} from "@/lib/qa/personalizer";
import { createSSEResponse } from "@/lib/qa/stream";
import type { SourceForGrounding } from "@/lib/qa/grounding";
import type { BodyKind } from "@/lib/corpus/body-kind";
import { isBlockedBodyKind } from "@/lib/corpus/body-kind";

export const runtime = "nodejs";

// Feature flags
const FULL_VALIDATION = process.env.FEATURE_FULL_VALIDATION !== "false";
const ASYNC_PROCESSING = process.env.FEATURE_ASYNC_PROCESSING === "true";
const CACHING = process.env.FEATURE_CACHING === "true";
const RATE_LIMITING = process.env.FEATURE_RATE_LIMITING !== "false";

void ASYNC_PROCESSING; // reserved for future async-with-polling mode
void CACHING; // reserved for future answer cache

const RequestSchema = z.object({
  question: z.string().min(1).max(2000),
  mode: z.enum(["answer", "results-only"]).optional().default("answer"),
});

// Top-K hits to request from /api/search — wider candidates, top 5 for synthesis.
const RETRIEVAL_LIMIT = 20;
const SYNTHESIS_TOP_K = 5;

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // --- 1. Resolve actor ---
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

  // --- 2. Rate limit ---
  if (RATE_LIMITING) {
    const rl = await checkRateLimit(userId);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Q&A rate limit reached. Try again shortly.",
          retry_after: Math.ceil((rl.resetAt - Date.now()) / 1000),
          resetAt: new Date(rl.resetAt).toISOString(),
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // --- 3. Parse body ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = FULL_VALIDATION
    ? RequestSchema.safeParse(body)
    : RequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        detail: parsed.error.flatten(),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { question, mode } = parsed.data;

  // --- 4. PHI guard (hard block before any LLM or search call) ---
  const phi = detectPHI(question);
  if (phi.hasPHI) {
    const questionHash = createHash("sha256")
      .update(question)
      .digest("hex")
      .slice(0, 16);

    // Best-effort audit row — authed users only.
    if (actor) {
      void runWithActor({ userId: actor.userId, tenantId: actor.tenantId }, () =>
        withActor(async (tx) => {
          await tx.insert(auditEvents).values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            action: "qa.phi_blocked",
            metadata: {
              question_hash: questionHash,
              reasons: phi.reasons,
            },
          });
        }),
      ).catch(() => {
        // Audit failure is non-fatal.
      });
    }

    return new Response(
      JSON.stringify({
        phiBlocked: true,
        reasons: phi.reasons,
        message:
          "We don't process protected health information (PHI). Please remove patient identifiers and try again.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 5. Retrieval via /api/search (same-process function call) ---
  // We call the search route internally by constructing an internal URL.
  // This reuses the full hybrid search pipeline (bm25 + vector + kg + library)
  // without code duplication. The search route handles its own rate limit
  // and RLS — we pass our actor context via headers.
  let searchHits: SearchHit[] = [];
  try {
    const searchUrl = new URL(
      `/api/search?q=${encodeURIComponent(question)}&limit=${RETRIEVAL_LIMIT}`,
      req.url,
    );

    // Forward auth cookie so the search route resolves the same actor.
    const searchResp = await fetch(searchUrl.toString(), {
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
      },
    });

    if (searchResp.ok) {
      const searchData = (await searchResp.json()) as {
        results?: SearchHit[];
      };
      searchHits = searchData.results ?? [];
    } else {
      console.warn("[qa-route] search returned", searchResp.status);
    }
  } catch (err) {
    // Non-fatal: proceed with empty grounding (will trigger empty-grounding state).
    console.warn("[qa-route] search fetch failed:", err);
  }

  // --- 6. Take top 5 for synthesis (after dropping any blocked/degraded
  //         corpus hits that slipped past the upstream filter — defense in
  //         depth before we hand sources to the LLM). ---
  const trustedHits = searchHits.filter((h) => !isBlockedBodyKind(h.body_kind));
  const topHits = trustedHits.slice(0, SYNTHESIS_TOP_K);
  const sources: SourceForGrounding[] = topHits.map((h) => ({
    uuid: h.doc_id,
    kind: normalizeKind(h.kind),
    title: h.title,
    body: h.snippet,
    score: h.score,
    body_kind: h.body_kind ?? null,
  }));

  // --- 7. Personalization (authed only) ---
  let personalizationText: string | undefined;
  let wasPersonalized = false;
  if (actor) {
    try {
      const ctx = await getPersonalizationContext(actor);
      if (ctx) {
        personalizationText = formatPersonalization(ctx);
        wasPersonalized = true;
      }
    } catch (err) {
      // Non-fatal — personalization is best-effort.
      console.warn("[qa-route] personalization failed:", err);
    }
  }

  // --- 8. Empty grounding check ---
  const emptyGrounding = shouldEmitEmptyGrounding(sources);

  // mode="results-only" returns JSON, not SSE.
  if (mode === "results-only") {
    return new Response(
      JSON.stringify({
        sources,
        wasGrounded: !emptyGrounding,
        wasPersonalized,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 9 + 10. SSE synthesis stream ---
  const questionHash = createHash("sha256")
    .update(question)
    .digest("hex")
    .slice(0, 16);

  const abortController = new AbortController();

  async function* buildStream() {
    if (emptyGrounding) {
      // Emit an empty-grounding done event — no synthesis call.
      yield {
        type: "done",
        wasGrounded: false,
        wasPersonalized,
        emptyGrounding: true,
      };
      return;
    }

    // Collect citation UUIDs as they arrive (for the final done event).
    const citedUuids = new Set<string>();
    const citationMeta: Array<{
      uuid: string;
      kind: string;
      title: string;
    }> = [];

    const sourceByUuid = new Map(sources.map((s) => [s.uuid, s]));

    for await (const event of synthesizeAnswer(question, sources, {
      personalization: personalizationText,
      abortSignal: abortController.signal,
    })) {
      if (event.type === "token") {
        yield { type: "token", text: event.text };
      } else if (event.type === "citation") {
        if (!citedUuids.has(event.uuid)) {
          citedUuids.add(event.uuid);
          const src = sourceByUuid.get(event.uuid);
          citationMeta.push({
            uuid: event.uuid,
            kind: src?.kind ?? "corpus",
            title: src?.title ?? "",
          });
        }
        yield { type: "citation", uuid: event.uuid };
      }
    }

    yield {
      type: "done",
      wasGrounded: !emptyGrounding,
      wasPersonalized,
      citations: citationMeta,
    };
  }

  // Fire observability writes after streaming completes (best-effort).
  // We can't await them here since the SSE stream takes over the response.
  // Use a void promise that runs after the generator exhausts.
  const latency_ms = Date.now() - t0;
  void writeObservability({
    actor,
    userId,
    tenantId,
    questionHash,
    question,
    retrievalCount: searchHits.length,
    wasGrounded: !emptyGrounding,
    wasPersonalized,
    latency_ms,
  });

  return createSSEResponse(buildStream(), abortController.signal);
}

// --- Internal types ---

interface SearchHit {
  doc_id: string;
  title: string;
  snippet: string;
  score: number;
  kind?: string;
  body_kind?: BodyKind | null;
}

function normalizeKind(
  kind: string | undefined,
): SourceForGrounding["kind"] {
  if (!kind) return "corpus";
  if (kind.startsWith("library:")) {
    const sub = kind.replace("library:", "");
    if (sub === "use_cases") return "use_case";
    if (sub === "prompts") return "prompt";
    if (sub === "skills") return "skill";
    if (sub === "plugins") return "plugin";
  }
  // library-leg hits arrive as kind strings like "use_case", "prompt" etc too.
  const direct = kind as SourceForGrounding["kind"];
  if (
    direct === "use_case" ||
    direct === "prompt" ||
    direct === "skill" ||
    direct === "plugin" ||
    direct === "corpus"
  ) {
    return direct;
  }
  return "corpus";
}

// --- Observability helpers ---

interface ObservabilityInput {
  actor: { userId: string; tenantId: string } | null;
  userId: string;
  tenantId: string;
  questionHash: string;
  question: string;
  retrievalCount: number;
  wasGrounded: boolean;
  wasPersonalized: boolean;
  latency_ms: number;
}

async function writeObservability(input: ObservabilityInput): Promise<void> {
  const { actor, userId, tenantId, questionHash, question, retrievalCount, wasGrounded, wasPersonalized, latency_ms } = input;

  // ai_search_queries row — guest + authed (no tenant FK).
  void db
    .execute(
      sql`
        INSERT INTO ai_search_queries
          (user_id, query_text, result_count, lexical_ms, vector_ms, kg_ms,
           rerank_ms, total_ms, degraded, degraded_reason)
        VALUES
          (${userId}::uuid, ${question}, ${retrievalCount},
           0, 0, 0, 0, ${latency_ms}, false, null)
      `,
    )
    .catch(() => {
      // Non-fatal.
    });

  // audit_events row — authed users only (tenants FK is NOT NULL).
  if (actor) {
    void runWithActor({ userId: actor.userId, tenantId: actor.tenantId }, () =>
      withActor(async (tx) => {
        await tx.insert(auditEvents).values({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action: "qa.call",
          metadata: {
            question_hash: questionHash,
            retrieval_count: retrievalCount,
            model: process.env.GROQ_MODEL ?? "groq",
            latency_ms,
            was_grounded: wasGrounded,
            was_personalized: wasPersonalized,
            was_phi_blocked: false,
          },
        });
      }),
    ).catch(() => {
      // Non-fatal.
    });
  }
}
