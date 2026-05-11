// F-4 — Query embedding helper for the hybrid-search vector leg.
//
// Distinct from lib/embeddings.ts, which is the DOCUMENT ingest helper
// (content-hash cached, batched, persisted to corpus_embeddings). Query
// embeddings are one-shot, not cached, not persisted — so we keep them
// in their own module to make the call-graph obvious.
//
// Uses the same model + dimensions (text-embedding-3-small, 768-dim
// Matryoshka per ADR-007) as the document helper so cosine distance
// against corpus_embeddings is well-defined.

import "server-only";
import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 768; // ADR-007 — Matryoshka truncation to match corpus_embeddings

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY missing. Set it in .env.local (or Vercel env) before " +
        "calling embedQuery().",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Embed a single search query. Returns a 768-dim Float vector (number[]).
 * Throws on empty input — callers should short-circuit before this point
 * for empty-string queries.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("embedQuery(): empty query");
  }
  const resp = await client().embeddings.create({
    model: EMBED_MODEL,
    input: trimmed,
    dimensions: EMBED_DIMS,
  });
  const vec = resp.data[0]?.embedding;
  if (!vec || vec.length !== EMBED_DIMS) {
    throw new Error(
      `embedQuery(): expected ${EMBED_DIMS}-dim embedding, got ${vec?.length ?? 0}`,
    );
  }
  return vec;
}
