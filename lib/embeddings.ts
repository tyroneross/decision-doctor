// Move 3 — embedding helper. Content-hash cached.
//
// THIS IS THE ONLY EMBEDDING CALLSITE IN THE CODEBASE.
// Do not call OpenAI's embeddings API directly from anywhere else.
// All embedding work routes through getOrCreateEmbedding() or
// getOrCreateEmbeddingsBatch() so that:
//   1. Content-hash caching prevents duplicate spend on identical chunks.
//   2. The 768-dim Matryoshka truncation (ADR-007) is enforced.
//   3. Future model swaps require touching exactly one file.
//
// If you find yourself wanting to import `openai` directly for embeddings,
// don't. Add a new helper here instead.
import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/actor";
import { corpusEmbeddings } from "@/lib/db/schema";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 768; // ADR-007 — Matryoshka truncation
const BATCH_MAX = 100;  // OpenAI hard limit per /v1/embeddings call

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY missing. Set it in .env.local (or Vercel / Railway env) " +
        "before calling getOrCreateEmbedding().",
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

function sha256(text: string): string {
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
 * Look up or compute the 768-dim embedding for a single chunk.
 *
 * Cache key: (documentId, chunkIndex, contentHash). The hash is the SHA-256 of
 * chunkText; if a row exists with the same hash the stored vector is returned
 * without an OpenAI call. If chunkText has changed, contentHash differs and a
 * new embedding is fetched.
 */
export async function getOrCreateEmbedding(
  opts: EmbeddingInput,
): Promise<EmbeddingResult> {
  const contentHash = sha256(opts.chunkText);

  const existing = await db
    .select({
      embedding: corpusEmbeddings.embedding,
    })
    .from(corpusEmbeddings)
    .where(
      and(
        eq(corpusEmbeddings.documentId, opts.documentId),
        eq(corpusEmbeddings.chunkIndex, opts.chunkIndex),
        eq(corpusEmbeddings.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return {
      embedding: existing[0].embedding,
      cached: true,
      contentHash,
    };
  }

  const res = await client().embeddings.create({
    model: EMBED_MODEL,
    input: opts.chunkText,
    dimensions: EMBED_DIMS,
  });
  const embedding = res.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBED_DIMS) {
    throw new Error(
      `OpenAI returned embedding with unexpected shape: got ${embedding?.length} dims, want ${EMBED_DIMS}`,
    );
  }
  return { embedding, cached: false, contentHash };
}

/**
 * Batch variant. Up to 100 chunks per OpenAI call. Returns results in input
 * order. Cache hits are interleaved with fresh fetches transparently — caller
 * does not need to dedupe.
 *
 * NOTE: this does NOT itself write to corpus_embeddings. The caller decides
 * when to persist (typically inside the same transaction that inserts the
 * parent corpus_documents row, for atomicity).
 */
export async function getOrCreateEmbeddingsBatch(
  items: EmbeddingInput[],
): Promise<EmbeddingResult[]> {
  if (items.length === 0) return [];
  if (items.length > BATCH_MAX) {
    // Recursive split — preserves order.
    const head = items.slice(0, BATCH_MAX);
    const tail = items.slice(BATCH_MAX);
    const [a, b] = await Promise.all([
      getOrCreateEmbeddingsBatch(head),
      getOrCreateEmbeddingsBatch(tail),
    ]);
    return [...a, ...b];
  }

  // Per-item hashes
  const hashes = items.map((i) => sha256(i.chunkText));

  // One round-trip cache probe across all candidates.
  // We can't compose AND across rows in a single WHERE — instead, fetch all
  // rows matching any documentId in our set + IN(hashes) and reconcile in
  // memory. Cheap because content_hash is the discriminator.
  const docIds = Array.from(new Set(items.map((i) => i.documentId)));
  const candidateRows = await db
    .select({
      documentId: corpusEmbeddings.documentId,
      chunkIndex: corpusEmbeddings.chunkIndex,
      contentHash: corpusEmbeddings.contentHash,
      embedding: corpusEmbeddings.embedding,
    })
    .from(corpusEmbeddings)
    .where(
      and(
        inArray(corpusEmbeddings.documentId, docIds),
        inArray(corpusEmbeddings.contentHash, hashes),
      ),
    );

  const cache = new Map<string, number[]>();
  for (const row of candidateRows) {
    cache.set(
      `${row.documentId}:${row.chunkIndex}:${row.contentHash}`,
      row.embedding,
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
          `OpenAI returned embedding with unexpected shape at index ${j}`,
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

// Exports for tests + the rare reflection caller.
export const __TEST = { sha256, EMBED_MODEL, EMBED_DIMS, BATCH_MAX };
