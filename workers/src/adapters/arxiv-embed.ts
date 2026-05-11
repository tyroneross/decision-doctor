// arxiv-embed pg-boss job handler.
//
// Chained from arxiv-fetch: each successfully-inserted corpus_documents row
// enqueues an arxiv-embed job carrying its UUID. This handler:
//   1. Loads the row.
//   2. Skips if not found OR if chunks already exist with matching content_hash.
//   3. Chunks `body` via tiktoken (500–1000 tok, ~100 overlap).
//   4. Batch-embeds via the worker-local helper (768-dim, content-hash cached).
//   5. INSERTs into corpus_embeddings with ON CONFLICT (document_id, chunk_index)
//      DO UPDATE when content_hash differs, else NOTHING.
//
// Emits one structured log line per completion:
//   {event:'arxiv-embed-complete', documentId, chunks, cached_chunks, fresh_chunks, latency_ms}

import { getPool } from "../db.js";
import { chunkBody } from "../embed-chunker.js";
import {
  getOrCreateEmbeddingsBatch,
  toPgVector,
  type EmbeddingInput,
} from "../embed.js";
import { isFullTextDocument, sha256 } from "../ingestion/quality.js";

export interface ArxivEmbedPayload {
  documentId: string;
}

export interface ArxivEmbedResult {
  documentId: string;
  status:
    | "embedded"
    | "skipped-not-found"
    | "skipped-already-embedded"
    | "skipped-ineligible-body";
  chunks: number;
  cached_chunks: number;
  fresh_chunks: number;
  latency_ms: number;
}

export async function handleArxivEmbed(
  payload: ArxivEmbedPayload,
): Promise<ArxivEmbedResult> {
  const t0 = Date.now();
  const pool = getPool();
  const client = await pool.connect();

  try {
    // 1. Load the row.
    const docQ = await client.query<{
      id: string;
      scope: string;
      body: string;
      content_hash: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, scope, body, content_hash, metadata
         FROM corpus_documents
        WHERE id = $1
        LIMIT 1`,
      [payload.documentId],
    );

    if (docQ.rows.length === 0) {
      return {
        documentId: payload.documentId,
        status: "skipped-not-found",
        chunks: 0,
        cached_chunks: 0,
        fresh_chunks: 0,
        latency_ms: Date.now() - t0,
      };
    }

    const doc = docQ.rows[0]!;
    if (!isFullTextDocument(doc.metadata)) {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [doc.scope],
      );
      await client.query("DELETE FROM corpus_embeddings WHERE document_id = $1", [
        doc.id,
      ]);
      await client.query("COMMIT");
      return {
        documentId: doc.id,
        status: "skipped-ineligible-body",
        chunks: 0,
        cached_chunks: 0,
        fresh_chunks: 0,
        latency_ms: Date.now() - t0,
      };
    }

    // 2. Skip if chunks already exist whose content_hash matches the document's
    //    overall content_hash AND the chunk count matches the chunker's output.
    //    We check chunk count by re-chunking — cheap, deterministic.
    const chunks = chunkBody(doc.body);
    if (chunks.length === 0) {
      return {
        documentId: payload.documentId,
        status: "embedded",
        chunks: 0,
        cached_chunks: 0,
        fresh_chunks: 0,
        latency_ms: Date.now() - t0,
      };
    }

    // 3. Compute per-chunk content hashes (drives cache + ON CONFLICT path).
    const chunkHashes = chunks.map((c) => sha256(c.text));

    // 4. Set RLS scope (matches the parent doc's scope).
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [doc.scope],
    );

    // 5. Cache-aware batch embed. The helper probes corpus_embeddings inside
    //    the same connection, so the txn sees consistent state.
    const inputs: EmbeddingInput[] = chunks.map((c, i) => ({
      documentId: doc.id,
      chunkIndex: i,
      chunkText: c.text,
    }));
    const embeds = await getOrCreateEmbeddingsBatch(inputs, client);

    let cached = 0;
    let fresh = 0;

    // 6. UPSERT each chunk.
    // ON CONFLICT (document_id, chunk_index):
    //   - if content_hash matches: NOTHING.
    //   - else: UPDATE embedding + chunk_text + content_hash.
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]!;
      const h = chunkHashes[i]!;
      const emb = embeds[i]!;
      if (emb.cached) cached++;
      else fresh++;
      await client.query(
        `INSERT INTO corpus_embeddings
            (document_id, chunk_index, chunk_text, embedding, content_hash)
          VALUES ($1, $2, $3, $4::vector, $5)
          ON CONFLICT (document_id, chunk_index)
          DO UPDATE SET
            chunk_text = EXCLUDED.chunk_text,
            embedding  = EXCLUDED.embedding,
            content_hash = EXCLUDED.content_hash
          WHERE corpus_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash`,
        [doc.id, c.index, c.text, toPgVector(emb.embedding), h],
      );
    }

    await client.query("COMMIT");

    const result: ArxivEmbedResult = {
      documentId: doc.id,
      status: "embedded",
      chunks: chunks.length,
      cached_chunks: cached,
      fresh_chunks: fresh,
      latency_ms: Date.now() - t0,
    };

    // Structured log line for ops scanning.
    console.log(
      JSON.stringify({ event: "arxiv-embed-complete", ...result }),
    );

    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
