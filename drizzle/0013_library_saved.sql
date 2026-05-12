-- 0013 — Library saved searches + saved responses (Library upgrades P0).
--
-- Two new user-scoped tables for personal artifacts:
--   - library_saved_searches  : pinned query + filters (no 'global' rows in practice)
--   - library_saved_responses : pinned /app/ask answer + citations
--
-- Scope-based RLS mirrors drizzle/0007_library.sql §"RLS":
--   - scope = user_id::text rows visible only to that user
-- The GUC is `app.current_user_id`, set per-transaction by lib/db/actor.ts §withActor().
-- These tables have no curated/global content — every row is a personal artifact.
--
-- Hardening checklist (~/.build-loop/memory/pattern_hybrid_search_hardening_checklist.md):
--   - Item 2a: idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.)
--   - Item 9f: library_saved_responses.search_tsv concatenates question+answer
--   - Item 12: no CHECK constraints needed (no enums); FK constraints would couple to users
--             which we deliberately avoid (scope is text, mirroring 0007's pattern).
--
-- Runs against the OWNER pool (drizzle-kit migrate / db:push). Re-runs are no-ops.

-- ---------- library_saved_searches ----------
-- Pinned search across the library. Captures query text + active filters so a
-- click in the saved-searches strip re-applies the same view.
CREATE TABLE IF NOT EXISTS library_saved_searches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL,                       -- user_id::text (RLS-scoped)
  name         text,                                -- optional user label
  query        text NOT NULL DEFAULT '',
  kind_filter  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- string[] of LibraryKind values
  path_filter  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- string[] of PainPath values
  only_mine    boolean NOT NULL DEFAULT false,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_saved_searches_scope_idx
  ON library_saved_searches (scope);
CREATE INDEX IF NOT EXISTS library_saved_searches_scope_created_idx
  ON library_saved_searches (scope, created_at);

-- ---------- library_saved_responses ----------
-- Pinned /app/ask answer. answer is markdown; citations is QACitation[].
CREATE TABLE IF NOT EXISTS library_saved_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL,                       -- user_id::text
  question      text NOT NULL,
  answer        text NOT NULL,
  citations     jsonb NOT NULL DEFAULT '[]'::jsonb,
  was_grounded  boolean NOT NULL DEFAULT true,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_saved_responses_scope_idx
  ON library_saved_responses (scope);
CREATE INDEX IF NOT EXISTS library_saved_responses_scope_created_idx
  ON library_saved_responses (scope, created_at);

-- FTS over question + answer (weights: question=A, answer=B). Hardening 9f.
ALTER TABLE library_saved_responses ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(answer,   '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS library_saved_responses_search_idx
  ON library_saved_responses USING gin (search_tsv);

-- ---------- RLS ----------
ALTER TABLE library_saved_searches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_saved_searches  FORCE  ROW LEVEL SECURITY;
ALTER TABLE library_saved_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_saved_responses FORCE  ROW LEVEL SECURITY;

-- Drop-and-recreate policies for idempotent re-runs.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS library_saved_searches_scope_read    ON library_saved_searches';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_searches_scope_write   ON library_saved_searches';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_searches_scope_update  ON library_saved_searches';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_searches_scope_delete  ON library_saved_searches';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_responses_scope_read   ON library_saved_responses';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_responses_scope_write  ON library_saved_responses';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_responses_scope_update ON library_saved_responses';
  EXECUTE 'DROP POLICY IF EXISTS library_saved_responses_scope_delete ON library_saved_responses';
END $$;

-- Saved searches policies (scope-only — no 'global' content).
CREATE POLICY library_saved_searches_scope_read ON library_saved_searches
  FOR SELECT USING (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_searches_scope_write ON library_saved_searches
  FOR INSERT WITH CHECK (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_searches_scope_update ON library_saved_searches
  FOR UPDATE USING (scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_searches_scope_delete ON library_saved_searches
  FOR DELETE USING (scope = current_setting('app.current_user_id', true));

-- Saved responses policies (scope-only).
CREATE POLICY library_saved_responses_scope_read ON library_saved_responses
  FOR SELECT USING (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_responses_scope_write ON library_saved_responses
  FOR INSERT WITH CHECK (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_responses_scope_update ON library_saved_responses
  FOR UPDATE USING (scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = current_setting('app.current_user_id', true));
CREATE POLICY library_saved_responses_scope_delete ON library_saved_responses
  FOR DELETE USING (scope = current_setting('app.current_user_id', true));

-- ---------- Grants (app_user) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_saved_searches  TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_saved_responses TO app_user';
  END IF;
END $$;
