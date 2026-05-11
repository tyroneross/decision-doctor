// Worker-side embedding helper.
//
// THIS IS THE ONLY EMBEDDING CALLSITE IN THE WORKER PROCESS. Don't call
// OpenAI's embeddings API directly anywhere else under workers/src/. This
// mirrors the Next.js-side rule in lib/embeddings.ts but is duplicated here
// because the worker tsconfig has rootDir: ./src and can't import from the
// parent project. Both helpers preserve the same invariants:
//
//   1. Content-hash caching prevents duplicate spend on identical chunks
//      (cache key = (documentId, chunkIndex, contentHash)).
//   2. 768-dim Matryoshka truncation per ADR-007.
//   3. Future model swaps require touching exactly two files (here +
//      lib/embeddings.ts).
//
// If you find yourself wanting to import `openai` directly for embeddings
// from another worker file, don't — add a helper here instead.

import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { Pool, PoolClient } from "pg";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 768; // ADR-007 — Matryoshka truncation
const BATCH_MAX = 100; // OpenAI hard limit per /v1/embeddings call

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY missing. Set it in workers/.env (or Railway env) " +
        "before calling getOrCreateEmbedding* in the worker.",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface EmbeddingInput {
  documentId: string;
  chunkIndex: number;
  chunkText: string;
}

export interface EmbeddingResult {
  embedding: number[];
  cached: boolean;
  contentHash: string;
}

/**
 * Batch embed. Up to 100 chunks per OpenAI call. Cache probe issued via the
 * provided pg client (so callers can scope it to a transaction). Returns
 * results in input order. Cache hits are interleaved with fresh fetches
 * transparently.
 *
 * NOTE: this does NOT itself write to corpus_embeddings — the caller decides
 * when to persist (the arxiv-embed handler INSERTs as the final step of the
 * chunk loop).
 */
export async function getOrCreateEmbeddingsBatch(
  items: EmbeddingInput[],
  pgClient: PoolClient | Pool,
): Promise<EmbeddingResult[]> {
  if (items.length === 0) return [];
  if (items.length > BATCH_MAX) {
    const head = items.slice(0, BATCH_MAX);
    const tail = items.slice(BATCH_MAX);
    const [a, b] = await Promise.all([
      getOrCreateEmbeddingsBatch(head, pgClient),
      getOrCreateEmbeddingsBatch(tail, pgClient),
    ]);
    return [...a, ...b];
  }

  const hashes = items.map((i) => sha256(i.chunkText));
  const docIds = Array.from(new Set(items.map((i) => i.documentId)));

  // One round-trip probe across all candidates.
  const probe = await pgClient.query<{
    document_id: string;
    chunk_index: number;
    content_hash: string;
    embedding: string; // pgvector returns "[v1,v2,...]" as text
  }>(
    `SELECT document_id, chunk_index, content_hash, embedding::text AS embedding
       FROM corpus_embeddings
      WHERE document_id = ANY($1::uuid[])
        AND content_hash = ANY($2::text[])`,
    [docIds, hashes],
  );

  const cache = new Map<string, number[]>();
  for (const row of probe.rows) {
    cache.set(
      `${row.document_id}:${row.chunk_index}:${row.content_hash}`,
      parsePgVector(row.embedding),
    );
  }

  const results: EmbeddingResult[] = new Array(items.length);
  const toFetch: { index: number; text: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const h = hashes[i]!;
    const key = `${it.documentId}:${it.chunkIndex}:${h}`;
    const hit = cache.get(key);
    if (hit) {
      results[i] = { embedding: hit, cached: true, contentHash: h };
    } else {
      toFetch.push({ index: i, text: it.chunkText });
    }
  }

  if (toFetch.length > 0) {
    const res = await client().embeddings.create({
      model: EMBED_MODEL,
      input: toFetch.map((t) => t.text),
      dimensions: EMBED_DIMS,
    });
    if (res.data.length !== toFetch.length) {
      throw new Error(
        `OpenAI returned ${res.data.length} embeddings, expected ${toFetch.length}`,
      );
    }
    for (let j = 0; j < toFetch.length; j++) {
      const slot = toFetch[j]!.index;
      const emb = res.data[j]?.embedding;
      if (!emb || emb.length !== EMBED_DIMS) {
        throw new Error(
          `OpenAI returned embedding with unexpected shape at index ${j}: got ${emb?.length} dims, want ${EMBED_DIMS}`,
        );
      }
      results[slot] = {
        embedding: emb,
        cached: false,
        contentHash: hashes[slot]!,
      };
    }
  }

  return results;
}

/**
 * Convert pgvector's text representation "[v1,v2,...]" → number[].
 * Cheaper than a JSON.parse because the input is guaranteed bracketed CSV.
 */
function parsePgVector(text: string): number[] {
  // Strip surrounding brackets and split.
  const inner = text.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (inner === "") return [];
  return inner.split(",").map((s) => Number(s));
}

/**
 * Convert number[] → pgvector wire format "[v1,v2,...]". The pg driver
 * passes this through as text on INSERT and Postgres parses it server-side.
 */
export function toPgVector(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

// Reflective exports for tests.
export const __TEST = { EMBED_MODEL, EMBED_DIMS, BATCH_MAX, parsePgVector };
