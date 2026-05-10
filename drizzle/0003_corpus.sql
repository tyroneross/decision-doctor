-- 0003 — Corpus documents + embeddings for hybrid search (F-30 wave).
--
-- Scope-based RLS: rows are either:
--   - global  (visible to all authenticated users; written by ingest workers)
--   - <user_id::text> (visible only to that user; for user-specific saves)
--
-- This is intentionally narrower than the tenant-keyed RLS on `decisions`:
-- the corpus is shared infrastructure, with optional per-user overlays.
--
-- ADR refs:
--   ADR-007 — text-embedding-3-small @ 768 dims (Matryoshka truncation)
--   ADR-008 — HNSW index, m=16, ef_construction=200 (cosine)
--   F-30    — chat-first corpus ingest

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- corpus_documents ----------
CREATE TABLE corpus_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL,                       -- 'global' or user_id::text
  source_type   text NOT NULL,                       -- 'arxiv' | 'anthropic' | 'openai' | 'perplexity' | 'rss' | 'url'
  source_id     text NOT NULL,                       -- arxiv_id, blog post slug, etc.
  source_url    text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  content_hash  text NOT NULL,                       -- sha256(body)
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_type, source_id, scope)
);

CREATE INDEX corpus_documents_scope_idx        ON corpus_documents (scope);
CREATE INDEX corpus_documents_source_idx       ON corpus_documents (source_type, fetched_at DESC);
CREATE INDEX corpus_documents_title_trgm_idx   ON corpus_documents USING gin (title gin_trgm_ops);

-- FTS companion column (generated; stays in sync with title+body)
ALTER TABLE corpus_documents ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;

CREATE INDEX corpus_documents_search_idx ON corpus_documents USING gin (search_tsv);

-- ---------- corpus_embeddings ----------
-- 768 dims = text-embedding-3-small truncated via Matryoshka (ADR-007).
-- Storage cost: ~3KB/row (768 × 4B). 1M rows ≈ 3 GB before index.
CREATE TABLE corpus_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES corpus_documents(id) ON DELETE CASCADE,
  chunk_index   int  NOT NULL,
  chunk_text    text NOT NULL,
  embedding     vector(768) NOT NULL,
  content_hash  text NOT NULL,                       -- sha256(chunk_text)
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX corpus_embeddings_doc_idx ON corpus_embeddings (document_id);

-- HNSW per ADR-008. Cosine = the right metric for OpenAI's normalized embeddings.
-- m=16, ef_construction=200 → balanced build-time / recall.
-- Build cost: rough ~1s/10k rows on Neon (single-node).
CREATE INDEX corpus_embeddings_hnsw_idx
  ON corpus_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- ---------- RLS ----------
-- Scope-based, not tenant-based. The `set_config('app.current_user_id', …, true)`
-- GUC pattern is reused from decisions/tenants (lib/db/actor.ts §withActor()).
-- Ingest workers run as `app_user` but explicitly set the GUC to a service marker
-- — or operate via a separate dedicated role (workers/src/queue.ts §bypass note).

ALTER TABLE corpus_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE corpus_documents  FORCE  ROW LEVEL SECURITY;
ALTER TABLE corpus_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE corpus_embeddings FORCE  ROW LEVEL SECURITY;

-- Read: global rows are visible to everyone; user-scoped rows only to that user.
CREATE POLICY corpus_docs_scope_read ON corpus_documents
  FOR SELECT
  USING (
    scope = 'global'
    OR scope = current_setting('app.current_user_id', true)
  );

-- Write: ingest workers write 'global'; users may write their own scope.
-- Workers must `SET LOCAL app.current_user_id = 'global'` inside their tx to
-- pass this check, OR run under a service role that bypasses RLS (do NOT do this
-- without a dedicated role — neondb_owner has BYPASSRLS but app_user does not).
CREATE POLICY corpus_docs_scope_write ON corpus_documents
  FOR INSERT
  WITH CHECK (
    scope = 'global'
    OR scope = current_setting('app.current_user_id', true)
  );

CREATE POLICY corpus_docs_scope_update ON corpus_documents
  FOR UPDATE
  USING (
    scope = 'global'
    OR scope = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    scope = 'global'
    OR scope = current_setting('app.current_user_id', true)
  );

CREATE POLICY corpus_docs_scope_delete ON corpus_documents
  FOR DELETE
  USING (
    scope = 'global'
    OR scope = current_setting('app.current_user_id', true)
  );

-- Embeddings inherit visibility from their parent document.
CREATE POLICY corpus_embeds_via_doc_read ON corpus_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM corpus_documents d
       WHERE d.id = corpus_embeddings.document_id
         AND (d.scope = 'global' OR d.scope = current_setting('app.current_user_id', true))
    )
  );

CREATE POLICY corpus_embeds_via_doc_write ON corpus_embeddings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM corpus_documents d
       WHERE d.id = corpus_embeddings.document_id
         AND (d.scope = 'global' OR d.scope = current_setting('app.current_user_id', true))
    )
  );

CREATE POLICY corpus_embeds_via_doc_update ON corpus_embeddings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM corpus_documents d
       WHERE d.id = corpus_embeddings.document_id
         AND (d.scope = 'global' OR d.scope = current_setting('app.current_user_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM corpus_documents d
       WHERE d.id = corpus_embeddings.document_id
         AND (d.scope = 'global' OR d.scope = current_setting('app.current_user_id', true))
    )
  );

CREATE POLICY corpus_embeds_via_doc_delete ON corpus_embeddings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM corpus_documents d
       WHERE d.id = corpus_embeddings.document_id
         AND (d.scope = 'global' OR d.scope = current_setting('app.current_user_id', true))
    )
  );

-- Grants for app_user (created in 0002).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON corpus_documents TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON corpus_embeddings TO app_user;
  END IF;
END $$;
