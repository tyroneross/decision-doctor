// F-8 — BGE cross-encoder rerank client (Xenova/bge-reranker-base) hosted
// on Railway. Falls back to gpt4o-fallback.ts on timeout / non-200 / disabled.
//
// Feature flags:
//   BGE_ENABLED         — default false. Flip to "true" only after a warm
//                          health-check confirms the /rerank endpoint is up.
//   BGE_RERANK_URL      — default https://decision-doctor-workers-production
//                          .up.railway.app/rerank.
//   BGE_FORCE_TIMEOUT   — test hook. When "true", we abort before the request
//                          fires so F-12 can assert the fallback path.
//
// Per .build-loop/memory/pattern_huggingface_transformers_cold_start.md:
//   cold call ~509ms, warm call ~57ms for 5 docs. 3000ms accommodates
//   Railway pod cold-restart + first-rerank model load.

import "server-only";
import type { RerankFn, RerankInput, RerankResult } from "./types";

const DEFAULT_URL =
  "https://decision-doctor-workers-production.up.railway.app/rerank";
const TIMEOUT_MS = 3000;

export interface BGERerankResponse {
  ok: boolean;
  results: Array<{ id: string; score: number }>;
  error?: string;
}

/**
 * BGE rerank attempt. Returns null on any non-success path (timeout, non-200,
 * disabled, malformed payload). Caller composes with the fallback.
 */
export async function bgeRerank(input: RerankInput): Promise<RerankResult | null> {
  if (process.env.BGE_ENABLED !== "true") return null;
  if (process.env.BGE_FORCE_TIMEOUT === "true") {
    return null;
  }
  const url = process.env.BGE_RERANK_URL ?? DEFAULT_URL;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        docs: input.docs.map((d) => ({ id: d.id, text: d.text })),
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as BGERerankResponse;
    if (!json.ok || !Array.isArray(json.results)) return null;
    // Sort by score descending, return doc ids in rerank order.
    const ranked = json.results
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);
    return {
      doc_ids: ranked,
      degraded: false,
      degraded_reason: null,
      rerank_ms: Date.now() - start,
      source: "bge",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Composed rerank: BGE first, then fallback. The shape the F-9 route handler
 * consumes.
 */
export async function rerank(
  input: RerankInput,
  fallback: RerankFn,
): Promise<RerankResult> {
  const bge = await bgeRerank(input);
  if (bge) return bge;
  // Determine the WHY for the observability row.
  let reason: RerankResult["degraded_reason"] = "bge_disabled";
  if (process.env.BGE_ENABLED === "true") {
    reason =
      process.env.BGE_FORCE_TIMEOUT === "true" ? "bge_timeout" : "bge_unavailable";
  }
  const fb = await fallback(input);
  return { ...fb, degraded: true, degraded_reason: reason };
}
