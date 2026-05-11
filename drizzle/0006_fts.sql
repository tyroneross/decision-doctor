-- F-1: tsvector + GIN full-text search on corpus_documents.body
-- Idempotent; safe to re-run.
--
-- Substituted for paradedb's pg_search (deprecated on Neon as of 2026-05-11).
-- See .build-loop/memory/decision_f1_tsvector_pivot.md for rationale.
--
-- The generated column is STORED so the GIN index has stable, persisted input.
-- F-3 query shape (UI worktree):
--   SELECT id, ts_rank_cd(body_tsv, websearch_to_tsquery('english', $1), 32) AS rank
--   FROM corpus_documents
--   WHERE body_tsv @@ websearch_to_tsquery('english', $1)
--   ORDER BY rank DESC LIMIT $2;

-- Generated column for stable indexing (stored, not virtual)
ALTER TABLE corpus_documents
  ADD COLUMN IF NOT EXISTS body_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

-- GIN index on the generated column
CREATE INDEX IF NOT EXISTS corpus_documents_body_tsv_idx
  ON corpus_documents USING GIN (body_tsv);

-- Verify app_user can write observability rows (ai_search_queries lives in 0005_kg.sql).
-- Idempotent: only grants if the privilege is missing; silent if app_user role is absent.
DO $$
BEGIN
  IF NOT has_table_privilege('app_user', 'ai_search_queries', 'INSERT') THEN
    GRANT INSERT ON ai_search_queries TO app_user;
    RAISE NOTICE 'Granted INSERT on ai_search_queries to app_user';
  END IF;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'app_user role does not exist; skipping grant';
END $$;
