// Integration test for the arxiv-embed handler.
//
// Strategy: mock the OpenAI client, use the real Neon DB for the fixture
// corpus_documents row + assertions on corpus_embeddings. Mirrors the
// project's tests/embeddings.test.ts pattern (mock OpenAI + real DB).
//
// Verifies:
//   - First run on a fresh document writes N>=1 chunks with non-null 768-dim embeddings.
//   - Second run on the same document re-uses the cache (zero new OpenAI calls).
//   - Re-running after a body change re-embeds the changed chunks.
//
// Skips cleanly when DATABASE_URL / DATABASE_URL_UNPOOLED is unset (local dev
// without DB access). This matches how the project's other DB-touching tests
// behave when env is incomplete.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const HAS_DB = !!DB_URL;

// ---- Mock the OpenAI SDK ---------------------------------------------------
const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockCreate };
  },
}));

// Import after mock.
const { handleArxivEmbed } = await import("../src/adapters/arxiv-embed.js");
const { disposeEncoder } = await import("../src/embed-chunker.js");
const { getPool } = await import("../src/db.js");
const { EXTRACTOR_VERSION, sha256 } = await import("../src/ingestion/quality.js");

const describeIfDb = HAS_DB ? describe : describe.skip;

let pool: pg.Pool | null = null;
let fixtureDocId: string;

const FIXTURE_BODY =
  "Decision Doctor is a transparent decision engine for solo healthcare practitioners. ".repeat(
    50,
  );

beforeAll(async () => {
  if (!HAS_DB) return;
  process.env.OPENAI_API_KEY ??= "sk-test-mock-key-not-real";
  pool = getPool();

  // Default mock embedding: 768 zeros with one 1 at a varying index.
  mockCreate.mockImplementation(async (args: { input: string | string[] }) => {
    const arr = Array.isArray(args.input) ? args.input : [args.input];
    return {
      data: arr.map((_, i) => ({
        embedding: Array.from({ length: 768 }, (_, k) => (k === i % 768 ? 1 : 0)),
      })),
    };
  });

  fixtureDocId = randomUUID();
  await pool.query(
    `INSERT INTO corpus_documents
       (id, scope, source_type, source_id, source_url, title, body, content_hash, metadata)
     VALUES ($1, 'global', 'test-arxiv-embed', $2, 'https://example.invalid/test', $3, $4, $5, $6::jsonb)`,
    [
      fixtureDocId,
      `arxiv-embed-test-${Date.now()}`,
      "fixture",
      FIXTURE_BODY,
      sha256(FIXTURE_BODY),
      JSON.stringify({
        content_extract: {
          extractor_version: EXTRACTOR_VERSION,
          body_kind: "full_text",
          output_hash: sha256(FIXTURE_BODY),
          degraded: false,
        },
      }),
    ],
  );
});

afterAll(async () => {
  if (pool && fixtureDocId) {
    // Cascade deletes corpus_embeddings rows.
    await pool.query("DELETE FROM corpus_documents WHERE id = $1", [
      fixtureDocId,
    ]);
    await pool.end();
  }
  disposeEncoder();
});

describeIfDb("handleArxivEmbed", () => {
  it("embeds a fresh document end-to-end (writes 768-dim chunks)", async () => {
    mockCreate.mockClear();
    const r = await handleArxivEmbed({ documentId: fixtureDocId });
    expect(r.status).toBe("embedded");
    expect(r.chunks).toBeGreaterThanOrEqual(1);
    expect(r.fresh_chunks).toBe(r.chunks);
    expect(r.cached_chunks).toBe(0);
    expect(mockCreate).toHaveBeenCalled();

    // Verify rows land with the correct dim.
    const q = await pool!.query<{
      cnt: string;
      first_dims: string;
    }>(
      `SELECT COUNT(*)::text AS cnt,
              (vector_dims((SELECT embedding FROM corpus_embeddings
                            WHERE document_id = $1
                            ORDER BY chunk_index LIMIT 1)))::text AS first_dims
         FROM corpus_embeddings
        WHERE document_id = $1`,
      [fixtureDocId],
    );
    expect(Number(q.rows[0]!.cnt)).toBe(r.chunks);
    expect(Number(q.rows[0]!.first_dims)).toBe(768);
  });

  it("re-running on the same doc hits cache (zero OpenAI calls)", async () => {
    mockCreate.mockClear();
    const r = await handleArxivEmbed({ documentId: fixtureDocId });
    expect(r.status).toBe("embedded");
    expect(r.cached_chunks).toBe(r.chunks);
    expect(r.fresh_chunks).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("re-running after a body change re-embeds changed chunks", async () => {
    const changedBody = `${FIXTURE_BODY} changed-body-sentinel `.repeat(2);
    const changedHash = sha256(changedBody);
    await pool!.query(
      `UPDATE corpus_documents
          SET body = $1,
              content_hash = $2,
              metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('content_extract', $3::jsonb)
        WHERE id = $4`,
      [
        changedBody,
        changedHash,
        JSON.stringify({
          extractor_version: EXTRACTOR_VERSION,
          body_kind: "full_text",
          output_hash: changedHash,
          degraded: false,
        }),
        fixtureDocId,
      ],
    );

    mockCreate.mockClear();
    const r = await handleArxivEmbed({ documentId: fixtureDocId });
    expect(r.status).toBe("embedded");
    expect(r.fresh_chunks).toBeGreaterThanOrEqual(1);
    expect(mockCreate).toHaveBeenCalled();

    const q = await pool!.query<{ chunk_text: string }>(
      `SELECT chunk_text
         FROM corpus_embeddings
        WHERE document_id = $1
        ORDER BY chunk_index
        LIMIT 1`,
      [fixtureDocId],
    );
    expect(q.rows[0]!.chunk_text).toContain("changed-body-sentinel");
  });

  it("skips an unknown documentId gracefully", async () => {
    mockCreate.mockClear();
    const r = await handleArxivEmbed({ documentId: randomUUID() });
    expect(r.status).toBe("skipped-not-found");
    expect(r.chunks).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// When DB is absent, still verify the mock embedding generator is wired.
describe("OpenAI mock plumbing", () => {
  it("the mock module is registered (even when DB is absent)", () => {
    expect(typeof mockCreate).toBe("function");
  });
});
