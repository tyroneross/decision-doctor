-- 0009 — Plugin & Skill Library tables.
--
-- New surface (separate from library_* in 0007_library.sql):
--   - plugins         — top-level plugin assets
--   - skills          — skills (can be standalone OR attached to plugins via M:N)
--   - plugin_skills   — M:N join (a skill can appear in multiple plugins)
--   - asset_files     — file rows belonging to either a plugin OR a skill (XOR)
--   - user_dismissals — hide-from-my-view (separate from fork; not a copy)
--
-- Scope-based RLS mirrors drizzle/0007_library.sql §"RLS" exactly:
--   - scope = 'global'           → readable by all
--   - scope = current_user_id    → readable by that user only
-- Plus user_dismissals.user_id = current_user_id for ALL operations.
--
-- Idempotent (CREATE TABLE / CREATE INDEX / DROP POLICY IF EXISTS, DO blocks for
-- constraints). Safe to re-run.

-- ---------- plugins ----------
CREATE TABLE IF NOT EXISTS plugins (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope             text NOT NULL,                       -- 'global' | user_id::text
  owner_user_id     uuid REFERENCES users(id) ON DELETE CASCADE, -- NULL for global rows
  slug              text NOT NULL,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  version           text NOT NULL DEFAULT '0.0.0',
  source_url        text,
  forked_from_id    uuid REFERENCES plugins(id) ON DELETE SET NULL,
  forked_at         timestamptz,
  upstream_version  text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- includes audience: string[]
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS plugins_scope_slug_uniq  ON plugins (scope, slug);
CREATE INDEX        IF NOT EXISTS plugins_scope_idx        ON plugins (scope);
CREATE INDEX        IF NOT EXISTS plugins_owner_idx        ON plugins (owner_user_id);
CREATE INDEX        IF NOT EXISTS plugins_forked_from_idx  ON plugins (forked_from_id);

-- ---------- skills ----------
CREATE TABLE IF NOT EXISTS skills (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope             text NOT NULL,
  owner_user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  slug              text NOT NULL,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  version           text NOT NULL DEFAULT '0.0.0',
  source_url        text,
  forked_from_id    uuid REFERENCES skills(id) ON DELETE SET NULL,
  forked_at         timestamptz,
  upstream_version  text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS skills_scope_slug_uniq   ON skills (scope, slug);
CREATE INDEX        IF NOT EXISTS skills_scope_idx         ON skills (scope);
CREATE INDEX        IF NOT EXISTS skills_owner_idx         ON skills (owner_user_id);
CREATE INDEX        IF NOT EXISTS skills_forked_from_idx   ON skills (forked_from_id);

-- ---------- plugin_skills (M:N) ----------
CREATE TABLE IF NOT EXISTS plugin_skills (
  plugin_id  uuid NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES skills(id)  ON DELETE CASCADE,
  position   integer NOT NULL DEFAULT 0,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plugin_id, skill_id)
);
CREATE INDEX IF NOT EXISTS plugin_skills_skill_idx  ON plugin_skills (skill_id);
CREATE INDEX IF NOT EXISTS plugin_skills_plugin_idx ON plugin_skills (plugin_id);

-- ---------- asset_files ----------
-- One row per file. CHECK (num_nonnulls(plugin_id, skill_id) = 1) enforces XOR.
CREATE TABLE IF NOT EXISTS asset_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id     uuid REFERENCES plugins(id) ON DELETE CASCADE,
  skill_id      uuid REFERENCES skills(id)  ON DELETE CASCADE,
  path          text NOT NULL,
  content       text NOT NULL DEFAULT '',
  content_type  text NOT NULL DEFAULT 'text/plain',
  sha256        text NOT NULL,
  size_bytes    integer NOT NULL DEFAULT 0,
  storage_kind  text NOT NULL DEFAULT 'inline',
  r2_key        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asset_files_xor_parent'
  ) THEN
    EXECUTE 'ALTER TABLE asset_files ADD CONSTRAINT asset_files_xor_parent
             CHECK (num_nonnulls(plugin_id, skill_id) = 1)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asset_files_storage_kind_check'
  ) THEN
    EXECUTE 'ALTER TABLE asset_files ADD CONSTRAINT asset_files_storage_kind_check
             CHECK (storage_kind IN (''inline'', ''r2''))';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS asset_files_plugin_path_uniq
  ON asset_files (plugin_id, path) WHERE plugin_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS asset_files_skill_path_uniq
  ON asset_files (skill_id, path) WHERE skill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_files_plugin_idx ON asset_files (plugin_id);
CREATE INDEX IF NOT EXISTS asset_files_skill_idx  ON asset_files (skill_id);

-- ---------- user_dismissals ----------
CREATE TABLE IF NOT EXISTS user_dismissals (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_kind    text NOT NULL,
  asset_id      uuid NOT NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset_kind, asset_id)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_dismissals_kind_check'
  ) THEN
    EXECUTE 'ALTER TABLE user_dismissals ADD CONSTRAINT user_dismissals_kind_check
             CHECK (asset_kind IN (''plugin'', ''skill''))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_dismissals_user_idx ON user_dismissals (user_id);

-- ---------- RLS ----------
ALTER TABLE plugins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugins          FORCE  ROW LEVEL SECURITY;
ALTER TABLE skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills           FORCE  ROW LEVEL SECURITY;
ALTER TABLE plugin_skills    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_skills    FORCE  ROW LEVEL SECURITY;
ALTER TABLE asset_files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_files      FORCE  ROW LEVEL SECURITY;
ALTER TABLE user_dismissals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_dismissals  FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS plugins_scope_read   ON plugins';
  EXECUTE 'DROP POLICY IF EXISTS plugins_scope_write  ON plugins';
  EXECUTE 'DROP POLICY IF EXISTS plugins_scope_update ON plugins';
  EXECUTE 'DROP POLICY IF EXISTS plugins_scope_delete ON plugins';
  EXECUTE 'DROP POLICY IF EXISTS skills_scope_read    ON skills';
  EXECUTE 'DROP POLICY IF EXISTS skills_scope_write   ON skills';
  EXECUTE 'DROP POLICY IF EXISTS skills_scope_update  ON skills';
  EXECUTE 'DROP POLICY IF EXISTS skills_scope_delete  ON skills';
  EXECUTE 'DROP POLICY IF EXISTS plugin_skills_read   ON plugin_skills';
  EXECUTE 'DROP POLICY IF EXISTS plugin_skills_write  ON plugin_skills';
  EXECUTE 'DROP POLICY IF EXISTS plugin_skills_update ON plugin_skills';
  EXECUTE 'DROP POLICY IF EXISTS plugin_skills_delete ON plugin_skills';
  EXECUTE 'DROP POLICY IF EXISTS asset_files_read     ON asset_files';
  EXECUTE 'DROP POLICY IF EXISTS asset_files_write    ON asset_files';
  EXECUTE 'DROP POLICY IF EXISTS asset_files_update   ON asset_files';
  EXECUTE 'DROP POLICY IF EXISTS asset_files_delete   ON asset_files';
  EXECUTE 'DROP POLICY IF EXISTS user_dismissals_read   ON user_dismissals';
  EXECUTE 'DROP POLICY IF EXISTS user_dismissals_write  ON user_dismissals';
  EXECUTE 'DROP POLICY IF EXISTS user_dismissals_update ON user_dismissals';
  EXECUTE 'DROP POLICY IF EXISTS user_dismissals_delete ON user_dismissals';
END $$;

-- plugins
CREATE POLICY plugins_scope_read   ON plugins
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY plugins_scope_write  ON plugins
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY plugins_scope_update ON plugins
  FOR UPDATE USING       (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY plugins_scope_delete ON plugins
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- skills
CREATE POLICY skills_scope_read   ON skills
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY skills_scope_write  ON skills
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY skills_scope_update ON skills
  FOR UPDATE USING       (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY skills_scope_delete ON skills
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- plugin_skills — readable if BOTH ends are readable. Postgres applies the
-- per-table RLS on the join targets automatically; for the join row itself we
-- gate via EXISTS against parent visibility.
CREATE POLICY plugin_skills_read ON plugin_skills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM plugins p WHERE p.id = plugin_skills.plugin_id)
    AND
    EXISTS (SELECT 1 FROM skills  s WHERE s.id = plugin_skills.skill_id)
  );
CREATE POLICY plugin_skills_write ON plugin_skills
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM plugins p WHERE p.id = plugin_skills.plugin_id)
    AND
    EXISTS (SELECT 1 FROM skills  s WHERE s.id = plugin_skills.skill_id)
  );
CREATE POLICY plugin_skills_update ON plugin_skills
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM plugins p WHERE p.id = plugin_skills.plugin_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM plugins p WHERE p.id = plugin_skills.plugin_id)
  );
CREATE POLICY plugin_skills_delete ON plugin_skills
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM plugins p WHERE p.id = plugin_skills.plugin_id)
  );

-- asset_files — reachable via parent visibility
CREATE POLICY asset_files_read ON asset_files
  FOR SELECT USING (
    (plugin_id IS NOT NULL AND EXISTS (SELECT 1 FROM plugins p WHERE p.id = asset_files.plugin_id))
    OR
    (skill_id  IS NOT NULL AND EXISTS (SELECT 1 FROM skills  s WHERE s.id = asset_files.skill_id))
  );
CREATE POLICY asset_files_write ON asset_files
  FOR INSERT WITH CHECK (
    (plugin_id IS NOT NULL AND EXISTS (SELECT 1 FROM plugins p WHERE p.id = asset_files.plugin_id))
    OR
    (skill_id  IS NOT NULL AND EXISTS (SELECT 1 FROM skills  s WHERE s.id = asset_files.skill_id))
  );
CREATE POLICY asset_files_update ON asset_files
  FOR UPDATE USING (
    (plugin_id IS NOT NULL AND EXISTS (SELECT 1 FROM plugins p WHERE p.id = asset_files.plugin_id))
    OR
    (skill_id  IS NOT NULL AND EXISTS (SELECT 1 FROM skills  s WHERE s.id = asset_files.skill_id))
  ) WITH CHECK (
    (plugin_id IS NOT NULL AND EXISTS (SELECT 1 FROM plugins p WHERE p.id = asset_files.plugin_id))
    OR
    (skill_id  IS NOT NULL AND EXISTS (SELECT 1 FROM skills  s WHERE s.id = asset_files.skill_id))
  );
CREATE POLICY asset_files_delete ON asset_files
  FOR DELETE USING (
    (plugin_id IS NOT NULL AND EXISTS (SELECT 1 FROM plugins p WHERE p.id = asset_files.plugin_id))
    OR
    (skill_id  IS NOT NULL AND EXISTS (SELECT 1 FROM skills  s WHERE s.id = asset_files.skill_id))
  );

-- user_dismissals — strictly user-scoped (no 'global' notion)
CREATE POLICY user_dismissals_read ON user_dismissals
  FOR SELECT USING (user_id::text = current_setting('app.current_user_id', true));
CREATE POLICY user_dismissals_write ON user_dismissals
  FOR INSERT WITH CHECK (user_id::text = current_setting('app.current_user_id', true));
CREATE POLICY user_dismissals_update ON user_dismissals
  FOR UPDATE USING       (user_id::text = current_setting('app.current_user_id', true))
              WITH CHECK (user_id::text = current_setting('app.current_user_id', true));
CREATE POLICY user_dismissals_delete ON user_dismissals
  FOR DELETE USING (user_id::text = current_setting('app.current_user_id', true));

-- ---------- Grants (app_user) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON plugins         TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON skills          TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON plugin_skills   TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON asset_files     TO app_user';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON user_dismissals TO app_user';
  END IF;
END $$;
