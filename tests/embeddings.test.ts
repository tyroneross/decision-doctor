/**
 * Move 3 — embedding helper cache behavior.
 *
 * Verifies:
 *   - First call for (documentId, chunkIndex, contentHash) hits OpenAI.
 *   - Second call with identical chunkText returns cached=true and skips OpenAI.
 *   - Changing chunkText (different hash) bypasses cache.
 *   - Batch variant interleaves cache hits with fresh fetches correctly.
 *
 * Strategy: mock the OpenAI client; use the real DB for the cache lookup so
 * the Drizzle wiring is exercised end-to-end. Test rows are written under a
 * synthetic `corpus_documents` parent then cleaned up.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql, eq, inArray } from "drizzle-orm";
import { corpusDocuments, corpusEmbeddings } from "@/lib/db/schema";

// Ensure the helper's env-gate passes even when the dev shell has no real key.
// The mocked OpenAI class never reads it, but lib/embeddings.ts gates on presence.
process.env.OPENAI_API_KEY ??= "sk-test-mock-key-not-real";

// ---- Mock OpenAI SDK -------------------------------------------------------
const mockCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class {
      embeddings = { create: mockCreate };
    },
  };
});

// Re-import AFTER mock is registered.
const { getOrCreateEmbedding, getOrCreateEmbeddingsBatch, __TEST } =
  await import("@/lib/embeddings");

// ---- Setup: a fixture document so the FK in corpus_embeddings holds --------
const setupPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  max: 2,
});
const setupDb = drizzle(setupPool);

let fixtureDocId: string;

beforeAll(async () => {
  fixtureDocId = randomUUID();
  await setupDb.insert(corpusDocuments).values({
    id: fixtureDocId,
    scope: "global",
    sourceType: "test",
    sourceId: `embedding-test-${Date.now()}`,
    sourceUrl: "https://example.invalid/test",
    title: "Embedding test fixture",
    body: "fixture body — not embedded",
    contentHash: "fixture",
  });
});

afterAll(async () => {
  // Cascade-deletes corpus_embeddings via FK
  await setupDb.delete(corpusDocuments).where(eq(corpusDocuments.id, fixtureDocId));
  await setupPool.end();
});

// ---- Helpers ---------------------------------------------------------------
function fakeEmbedding(seed: number): number[] {
  // Deterministic 768-dim vector for the mock.
  const v = new Array(__TEST.EMBED_DIMS);
  for (let i = 0; i < v.length; i++) v[i] = ((seed + i) % 1000) / 1000;
  return v;
}

// ---- Tests -----------------------------------------------------------------
describe("getOrCreateEmbedding", () => {
  it("calls OpenAI on first invocation and caches via persisted row on second", async () => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValueOnce({
      data: [{ embedding: fakeEmbedding(1) }],
    });

    const chunkText = "The patient presents with chest pain and dyspnea.";
    const r1 = await getOrCreateEmbedding({
      documentId: fixtureDocId,
      chunkIndex: 0,
      chunkText,
    });
    expect(r1.cached).toBe(false);
    expect(r1.embedding.length).toBe(768);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Persist so the second lookup can hit the cache.
    await setupDb.insert(corpusEmbeddings).values({
      documentId: fixtureDocId,
      chunkIndex: 0,
      chunkText,
      embedding: r1.embedding,
      contentHash: r1.contentHash,
    });

    // Second invocation: same input → cached, no OpenAI call.
    const r2 = await getOrCreateEmbedding({
      documentId: fixtureDocId,
      chunkIndex: 0,
      chunkText,
    });
    expect(r2.cached).toBe(true);
    expect(r2.embedding.length).toBe(768);
    expect(mockCreate).toHaveBeenCalledTimes(1); // no new call
    expect(r2.contentHash).toBe(r1.contentHash);
  });

  it("treats different chunkText as cache miss even for same (docId, chunkIndex)", async () => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValueOnce({
      data: [{ embedding: fakeEmbedding(2) }],
    });
    const r = await getOrCreateEmbedding({
      documentId: fixtureDocId,
      chunkIndex: 0,
      chunkText: "Completely different chunk content — patient is stable.",
    });
    expect(r.cached).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateEmbeddingsBatch", () => {
  it("returns empty array for empty input without calling OpenAI", async () => {
    mockCreate.mockReset();
    const out = await getOrCreateEmbeddingsBatch([]);
    expect(out).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("interleaves cached hits with fresh fetches and preserves order", async () => {
    // Seed one cache entry; the other two are fresh.
    const cachedText = "BATCH cached chunk — already embedded.";
    const cachedHash = __TEST.sha256(cachedText);
    const cachedVec = fakeEmbedding(7);
    await setupDb.insert(corpusEmbeddings).values({
      documentId: fixtureDocId,
      chunkIndex: 50,
      chunkText: cachedText,
      embedding: cachedVec,
      contentHash: cachedHash,
    });

    mockCreate.mockReset();
    mockCreate.mockResolvedValueOnce({
      data: [{ embedding: fakeEmbedding(8) }, { embedding: fakeEmbedding(9) }],
    });

    const out = await getOrCreateEmbeddingsBatch([
      { documentId: fixtureDocId, chunkIndex: 49, chunkText: "BATCH fresh A" },
      { documentId: fixtureDocId, chunkIndex: 50, chunkText: cachedText },
      { documentId: fixtureDocId, chunkIndex: 51, chunkText: "BATCH fresh B" },
    ]);

    expect(out).toHaveLength(3);
    expect(out[0]!.cached).toBe(false);
    expect(out[1]!.cached).toBe(true);
    expect(out[2]!.cached).toBe(false);
    // Exactly two fresh fetches in ONE OpenAI call
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0].input).toEqual(["BATCH fresh A", "BATCH fresh B"]);
    // Middle slot's vector must equal what we seeded
    expect(out[1]!.embedding).toEqual(cachedVec);
  });
});
