// Smoke test for the backfill-embeddings CLI gap query.
//
// Pattern matches arxiv-embed.test.ts: DB-skip when DATABASE_URL absent, real
// DB when present. Verifies the LEFT JOIN anti-join returns docs without
// embeddings and excludes docs with at least one chunk.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const HAS_DB = !!DB_URL;

const { findGapDocuments } = await import("../src/cli/backfill-embeddings.js");

const describeIfDb = HAS_DB ? describe : describe.skip;

let pool: pg.Pool | null = null;
let gapDocId: string;
let embeddedDocId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  pool = new pg.Pool({ connectionString: DB_URL });
  gapDocId = randomUUID();
  embeddedDocId = randomUUID();

  // Doc 1: no corpus_embeddings rows — should appear in the gap.
  await pool.query(
    `INSERT INTO corpus_documents
       (id, scope, source_type, source_id, source_url, title, body, content_hash)
     VALUES ($1, 'global', 'test-backfill-embeddings', $2, 'https://example.invalid/gap', $3, $4, $5)`,
    [
      gapDocId,
      `backfill-test-gap-${Date.now()}`,
      "Gap doc fixture",
      "body of gap doc",
      "hash-gap-" + Date.now(),
    ],
  );

  // Doc 2: has one corpus_embeddings row — should NOT appear in the gap.
  await pool.query(
    `INSERT INTO corpus_documents
       (id, scope, source_type, source_id, source_url, title, body, content_hash)
     VALUES ($1, 'global', 'test-backfill-embeddings', $2, 'https://example.invalid/embedded', $3, $4, $5)`,
    [
      embeddedDocId,
      `backfill-test-embedded-${Date.now()}`,
      "Embedded doc fixture",
      "body of embedded doc",
      "hash-embedded-" + Date.now(),
    ],
  );
  // Stub embedding row (768 zeros) for embeddedDocId.
  const zeros = `[${Array.from({ length: 768 }, () => 0).join(",")}]`;
  await pool.query(
    `INSERT INTO corpus_embeddings (document_id, chunk_index, chunk_text, embedding, content_hash)
     VALUES ($1, 0, $2, $3::vector, $4)`,
    [embeddedDocId, "stub chunk", zeros, "hash-embedded-chunk"],
  );
});

afterAll(async () => {
  if (pool) {
    if (gapDocId) {
      await pool.query("DELETE FROM corpus_documents WHERE id = $1", [gapDocId]);
    }
    if (embeddedDocId) {
      await pool.query("DELETE FROM corpus_documents WHERE id = $1", [embeddedDocId]);
    }
    await pool.end();
  }
});

describeIfDb("findGapDocuments", () => {
  it("returns rows that have no corpus_embeddings entry", async () => {
    const rows = await findGapDocuments(pool!, null);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(gapDocId);
    expect(ids).not.toContain(embeddedDocId);
  });

  it("honors the limit cap", async () => {
    const rows = await findGapDocuments(pool!, 1);
    expect(rows.length).toBeLessThanOrEqual(1);
  });
});

// When DB is absent, still verify the function is exported and a callable.
describe("backfill-embeddings module exports", () => {
  it("exports findGapDocuments", () => {
    expect(typeof findGapDocuments).toBe("function");
  });
});
