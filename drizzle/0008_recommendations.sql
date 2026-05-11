-- 0008 — Recommendations table (V2 E3: pain-to-AI-recommendation route).
--
-- User-scoped RLS mirrors drizzle/0001_enable_rls.sql (decisions table pattern):
--   - user_id::text = current_setting('app.current_user_id', true)
-- No 'global' scope: recommendations are always personal.
--
-- pain_path CHECK constraint MUST match library_use_cases.pain_path verbatim
-- (hardening item 12). Verified against drizzle/0007_library.sql §library_use_cases.
--
-- Resolves the soft FKs in library_skills.source_recommendation_id and
-- library_plugins.source_recommendation_id (both created in 0007_library.sql
-- as plain uuid columns; this migration upgrades them to real FKs).
-- We add the FKs at end of file so if 0007 was applied first, 0008 can run
-- safely in any order — the FKs are added with IF NOT EXISTS via a DO block.
--
-- Hardening checklist item 2a: idempotent (IF NOT EXISTS everywhere; policy
-- drop-and-recreate inside DO block because Postgres lacks CREATE POLICY IF NOT EXISTS).
--
-- runs against the OWNER pool (drizzle-kit migrate). Re-running is a no-op.

-- ---------- recommendations ----------
CREATE TABLE IF NOT EXISTS recommendations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pain_path                text NOT NULL,
  challenge_summary        text NOT NULL,
  goal                     text,
  intake                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_tasks          jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_task         jsonb,
  starter_solution         jsonb,
  guardrails               jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_metric           text,
  adoption_pathway         jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_trace             jsonb,
  baseline                 jsonb,
  status                   text NOT NULL DEFAULT 'planned',
  confidence               numeric(3,2),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (pain_path IN ('referrals','research','admin','capacity_growth','follow_up','custom')),
  CHECK (status IN ('planned','tried','active','improve','retired'))
);

CREATE INDEX IF NOT EXISTS recommendations_user_idx      ON recommendations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendations_pain_path_idx ON recommendations (pain_path);
CREATE INDEX IF NOT EXISTS recommendations_status_idx    ON recommendations (status);

-- ---------- RLS ----------
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations FORCE  ROW LEVEL SECURITY;

-- Drop-and-recreate for idempotency (Postgres lacks CREATE POLICY IF NOT EXISTS as of pg16).
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS recommendations_select ON recommendations';
  EXECUTE 'DROP POLICY IF EXISTS recommendations_insert ON recommendations';
  EXECUTE 'DROP POLICY IF EXISTS recommendations_update ON recommendations';
  EXECUTE 'DROP POLICY IF EXISTS recommendations_delete ON recommendations';
END $$;

CREATE POLICY recommendations_select ON recommendations
  FOR SELECT USING (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY recommendations_update ON recommendations
  FOR UPDATE
  USING (user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY recommendations_delete ON recommendations
  FOR DELETE USING (user_id::text = current_setting('app.current_user_id', true));

-- ---------- Grants (app_user) ----------
-- Per hardening checklist item 3: explicit grants on the new table.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON recommendations TO app_user';
  END IF;
END $$;

-- ---------- Upgrade soft FKs in library tables (idempotent) ----------
-- library_skills.source_recommendation_id and library_plugins.source_recommendation_id
-- were created in 0007 as plain uuid columns (no FK constraint) to avoid ordering
-- coupling. Now that recommendations exists, wire the real FKs.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_skills_source_recommendation_id_fkey'
  ) THEN
    ALTER TABLE library_skills
      ADD CONSTRAINT library_skills_source_recommendation_id_fkey
      FOREIGN KEY (source_recommendation_id)
      REFERENCES recommendations(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_plugins_source_recommendation_id_fkey'
  ) THEN
    ALTER TABLE library_plugins
      ADD CONSTRAINT library_plugins_source_recommendation_id_fkey
      FOREIGN KEY (source_recommendation_id)
      REFERENCES recommendations(id)
      ON DELETE SET NULL;
  END IF;
END $$;
