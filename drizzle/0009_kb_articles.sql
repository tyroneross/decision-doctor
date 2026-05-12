-- 0009 — Knowledge Base articles (V2: /app/learn KB section).
--
-- Top-level KB section so practitioners can *understand* primitives (skills,
-- commands, hooks, MCP, scaffolding) before consuming actionable artifacts
-- in /app/library. Extensible from day 1 — adding a new article is a
-- seed-script line, not a code change.
--
-- Scope-based RLS mirrors drizzle/0007_library.sql §"RLS":
--   - scope = 'global' rows visible to all signed-in actors (curated content)
--   - scope = user_id::text rows visible only to that user (user-saved KB articles, future)
-- GUC: `app.current_user_id`, set per-transaction by lib/db/actor.ts §withActor().
--
-- Hardening checklist (~/.build-loop/memory/pattern_hybrid_search_hardening_checklist.md):
--   - Item 2a: idempotent (CREATE TABLE IF NOT EXISTS, IF NOT EXISTS indexes, DROP+CREATE policies)
--   - Item 9f: search_tsv concatenates title+summary+body so short rows still get title+summary signal
--   - Item 12: UNIQUE (scope, slug) encoded directly so seed-kb.ts ON CONFLICT is deterministic
--
-- Runs against the OWNER pool (drizzle-kit migrate / db:push). Re-runs are no-ops.

-- ---------- kb_articles ----------
-- Knowledge-base articles. `body` is markdown, rendered server-side by an
-- in-house parser in app/app/learn/[slug]/ArticleView.tsx (no new runtime dep).
CREATE TABLE IF NOT EXISTS kb_articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL,                       -- 'global' | user_id::text (mirrors library_use_cases convention)
  slug            text NOT NULL,                       -- url-safe; e.g. 'ai-plugin-architecture'
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',            -- one-paragraph intro for the index card
  body            text NOT NULL,                       -- markdown
  reading_minutes integer,
  display_order   integer NOT NULL DEFAULT 100,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, slug)
);

CREATE INDEX IF NOT EXISTS kb_articles_scope_idx  ON kb_articles (scope);
CREATE INDEX IF NOT EXISTS kb_articles_order_idx  ON kb_articles (display_order);

-- Full-text search vector — weights: title=A, summary=B, body=C. Hardening 9f.
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,   '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body,    '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS kb_articles_search_idx ON kb_articles USING gin (search_tsv);

-- ---------- RLS ----------
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles FORCE  ROW LEVEL SECURITY;

-- Drop-and-recreate policies so the migration is idempotent across re-runs.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS kb_articles_scope_read   ON kb_articles';
  EXECUTE 'DROP POLICY IF EXISTS kb_articles_scope_write  ON kb_articles';
  EXECUTE 'DROP POLICY IF EXISTS kb_articles_scope_update ON kb_articles';
  EXECUTE 'DROP POLICY IF EXISTS kb_articles_scope_delete ON kb_articles';
END $$;

CREATE POLICY kb_articles_scope_read ON kb_articles
  FOR SELECT USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY kb_articles_scope_write ON kb_articles
  FOR INSERT WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY kb_articles_scope_update ON kb_articles
  FOR UPDATE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true))
              WITH CHECK (scope = 'global' OR scope = current_setting('app.current_user_id', true));
CREATE POLICY kb_articles_scope_delete ON kb_articles
  FOR DELETE USING (scope = 'global' OR scope = current_setting('app.current_user_id', true));

-- ---------- Grants (app_user) ----------
-- Per hardening item 3: app_user explicit grants on each table.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON kb_articles TO app_user';
  END IF;
END $$;
