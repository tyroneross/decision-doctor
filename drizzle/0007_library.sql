-- 0007 — Library tables (V2 P0: pain-to-AI-recommendation).
--
-- Scope-based RLS mirrors drizzle/0003_corpus.sql §"RLS" (lines 71-135):
--   - scope = 'global' rows visible to all signed-in actors (curated content)
--   - scope = user_id::text rows visible only to that user (saved/promoted artifacts)
-- The GUC is `app.current_user_id`, set per-transaction by lib/db/actor.ts §withActor().
--
-- pain_path enum is CHECK-constrained to the 6 P0 paths from the V2 PRD. Adding a
-- new path requires a migration; this is intentional — surfaces orphan content at
-- migration-time rather than runtime.
--
-- Hardening checklist (~/.build-loop/memory/pattern_hybrid_search_hardening_checklist.md):
--   - Item 2a: idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.)
--   - Item 9f: search_tsv concatenates title+body so stub bodies still get title signal
--   - Item 12: CHECK constraints encoded directly so downstream chunks (L3 seeder,
--              E2 classifier output, U4 promotion) hit a deterministic boundary
--
-- runs against the OWNER pool (drizzle-kit migrate). Re-running is a no-op.

-- ---------- library_use_cases ----------
-- Curated use cases per pain path. Each row describes an AI task a practitioner
-- could try. `starting_level` is what the engine treats as the natural first rung
-- of the adoption pathway (Stage 8 may override per-task).
CREATE TABLE IF NOT EXISTS library_use_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL,                       -- 'global' | user_id::text
  pain_path       text NOT NULL,
  starting_level  text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,                       -- description; markdown allowed
  rationale       text NOT NULL DEFAULT '',
  estimated_minutes_saved_per_week integer,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (pain_path IN ('referrals','research','admin','capacity_growth','follow_up','custom')),
  CHECK (starting_level IN ('prompt','checklist','skill','plugin','agent'))
);

CREATE INDEX IF NOT EXISTS library_use_cases_scope_idx     ON library_use_cases (scope);
CREATE INDEX IF NOT EXISTS library_use_cases_path_idx      ON library_use_cases (pain_path);
CREATE INDEX IF NOT EXISTS library_use_cases_path_scope_idx ON library_use_cases (pain_path, scope);

ALTER TABLE library_use_cases ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS library_use_cases_search_idx ON library_use_cases USING gin (search_tsv);

-- ---------- library_prompts ----------
-- Prompt templates per pain path. Body is the prompt text; metadata.variables[]
-- holds placeholder names the UI should surface as fill-in fields.
CREATE TABLE IF NOT EXISTS library_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL,
  pain_path       text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (pain_path IN ('referrals','research','admin','capacity_growth','follow_up','custom'))
);

CREATE INDEX IF NOT EXISTS library_prompts_scope_idx ON library_prompts (scope);
CREATE INDEX IF NOT EXISTS library_prompts_path_idx  ON library_prompts (pain_path);

ALTER TABLE library_prompts ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS library_prompts_search_idx ON library_prompts USING gin (search_tsv);

-- ---------- library_skills ----------
-- Promoted skill artifacts. source_recommendation_id is a soft reference to the
-- (yet-unbuilt) recommendations table (E3 ships it). Plain uuid with no FK to avoid
-- ordering coupling between L1 and E3; route handler is responsible for validity.
CREATE TABLE IF NOT EXISTS library_skills (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                    text NOT NULL,
  pain_path                text NOT NULL,
  title                    text NOT NULL,
  body                     text NOT NULL,             -- skill prompt / instructions
  source_recommendation_id uuid,                       -- soft FK to recommendations(id)
  quality_diagnostic       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- output of lib/builders/quality-gate.ts
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (pain_path IN ('referrals','research','admin','capacity_growth','follow_up','custom'))
);

CREATE INDEX IF NOT EXISTS library_skills_scope_idx       ON library_skills (scope);
CREATE INDEX IF NOT EXISTS library_skills_path_idx        ON library_skills (pain_path);
CREATE INDEX IF NOT EXISTS library_skills_source_rec_idx  ON library_skills (source_recommendation_id);

ALTER TABLE library_skills ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS library_skills_search_idx ON library_skills USING gin (search_tsv);

-- ---------- library_plugins ----------
-- Promoted plugin artifacts. Mirrors library_skills shape; body is the plugin
-- scaffold (JSON-stringified manifest + entry-point source).
CREATE TABLE IF NOT EXISTS library_plugins (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                    text NOT NULL,
  pain_path                text NOT NULL,
  title                    text NOT NULL,
  body                     text NOT NULL,
  source_recommendation_id uuid,
  quality_diagnostic       jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (pain_path IN ('referrals','research','admin','capacity_growth','follow_up','custom'))
);

CREATE INDEX IF NOT EXISTS library_plugins_scope_idx       ON library_plugins (scope);
CREATE INDEX IF NOT EXISTS library_plugins_path_idx        ON library_plugins (pain_path);
CREATE INDEX IF NOT EXISTS library_plugins_source_rec_idx  ON library_plugins (source_recommendation_id);

ALTER TABLE library_plugins ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS library_plugins_search_idx ON library_plugins USING gin (search_tsv);

-- ---------- RLS ----------
-- All four tables: same scope-based pattern as corpus_documents.
ALTER TABLE library_use_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_use_cases FORCE  ROW LEVEL SECURITY;
ALTER TABLE library_prompts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_prompts   FORCE  ROW LEVEL SECURITY;
ALTER TABLE library_skills    ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_skills    FORCE  ROW LEVEL SECURITY;
ALTER TABLE library_plugins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_plugins   FORCE  ROW LEVEL SECURITY;

-- Drop-and-recreate the policies so the migration is idempotent across re-runs.
-- (Postgres has no CREATE POLICY IF NOT EXISTS as of pg 16.)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS library_use_cases_scope_read   ON library_use_cases';
  EXECUTE 'DROP POLICY IF EXISTS library_use_cases_scope_write  ON library_use_cases';
  EXECUTE 'DROP POLICY IF EXISTS library_use_cases_scope_update ON library_use_cases';
  EXECUTE 'DROP POLICY IF EXISTS library_use_cases_scope_delete ON library_use_cases';
  EXECUTE 'DROP POLICY IF EXISTS library_prompts_scope_read     ON library_prompts';
  EXECUTE 'DROP POLICY IF EXISTS library_prompts_scope_write    ON library_prompts';
  EXECUTE 'DROP POLICY IF EXISTS library_prompts_scope_update   ON library_prompts';
  EXECUTE 'DROP POLICY IF EXISTS library_prompts_scope_delete   ON library_prompts';
  EXECUTE 'DROP POLICY IF EXISTS library_skills_scope_read      ON library_skills';
  EXECUTE 'DROP POLICY IF EXISTS library_skills_scope_write     ON library_skills';
  EXECUTE 'DROP POLICY IF EXISTS library_skills_scope_update    ON library_skills';
  EXECUTE 'DROP POLICY IF EXISTS library_skills_scope_delete    ON library_skills';
  EXECUTE 'DROP POLICY IF EXISTS library_plugins_scope_read     ON library_plugins';
  EXECUTE 'DROP POLICY IF EXISTS library_plugins_scope_write    ON library_plugins';
  EXECUTE 'DROP POLICY IF EXISTS library_plugins_scope_update   ON library_plugins';
  EXECUTE 'DROP POLICY IF EXISTS library_plugins_scope_delete   ON library_plugins';
END $$;

-- library_use_cases policies
CREATE POLICY library_use_cases_scope_read ON library_use_cases
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_use_cases_scope_write ON library_use_cases
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_use_cases_scope_update ON library_use_cases
  FOR UPDATE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_use_cases_scope_delete ON library_use_cases
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- library_prompts policies
CREATE POLICY library_prompts_scope_read ON library_prompts
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_prompts_scope_write ON library_prompts
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_prompts_scope_update ON library_prompts
  FOR UPDATE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_prompts_scope_delete ON library_prompts
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- library_skills policies
CREATE POLICY library_skills_scope_read ON library_skills
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_skills_scope_write ON library_skills
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_skills_scope_update ON library_skills
  FOR UPDATE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_skills_scope_delete ON library_skills
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- library_plugins policies
CREATE POLICY library_plugins_scope_read ON library_plugins
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_plugins_scope_write ON library_plugins
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_plugins_scope_update ON library_plugins
  FOR UPDATE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY library_plugins_scope_delete ON library_plugins
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- ---------- Grants (app_user) ----------
-- Per hardening checklist item 3: app_user explicit grants on each table.
-- The role-creation lives in 0002_app_role.sql; this just GRANTs on the new tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_use_cases TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_prompts   TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_skills    TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON library_plugins   TO app_user';
  END IF;
END $$;
