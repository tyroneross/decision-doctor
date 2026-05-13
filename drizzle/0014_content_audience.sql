-- 0014 — Audience-scope tagging (Track A: retrieval scope).
--
-- Two changes:
--   1. ALTER users to add `search_scope_default text NOT NULL DEFAULT 'focused'`
--      with a CHECK constraint on the {focused, broad} enum.
--   2. CREATE content_audience junction table tagging each curated content row
--      with one or more audiences ('ai-adoption-solo' | 'ai-research-general').
--
-- Idempotent — re-runs are no-ops. Designed to be applied via drizzle-kit
-- migrate AND replayable via the dry-run / live backfill script
-- (scripts/backfill-content-audience.ts) once the table exists.
--
-- RLS posture: content_audience is RLS-free. The table is a tag overlay on
-- curated content; readers already scope by content_type's own RLS. Adding
-- RLS here would mean two layers of filtering with no security benefit
-- (an attacker who could read corpus_documents already has the doc_id, and
-- a tag-only table reveals nothing else). If multi-tenant audience policies
-- ever land, RLS gets added then.
--
-- See:
--   - lib/audience/classify.ts   — deterministic audience rules
--   - lib/audience/filter.ts     — SQL helper used by retrieval legs
--   - scripts/backfill-content-audience.ts — idempotent backfill (dry-run capable)

-- ---------- users.search_scope_default ----------
-- Persistent server-side state for the toggle. localStorage on the client mirrors
-- this value for guest sessions; on sign-in, server-truth wins.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS search_scope_default text NOT NULL DEFAULT 'focused';

-- CHECK constraint added separately so the ADD COLUMN remains a no-op on re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_search_scope_default_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_search_scope_default_check
      CHECK (search_scope_default IN ('focused', 'broad'));
  END IF;
END $$;

-- ---------- content_audience junction table ----------
CREATE TABLE IF NOT EXISTS content_audience (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  text NOT NULL,
  content_id    uuid NOT NULL,
  audience      text NOT NULL,
  source        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- CHECK constraints idempotent via DO blocks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'content_audience_content_type_check'
  ) THEN
    ALTER TABLE content_audience
      ADD CONSTRAINT content_audience_content_type_check
      CHECK (content_type IN (
        'corpus_document',
        'library_use_case',
        'library_prompt',
        'library_skill',
        'library_plugin',
        'kb_article',
        'plugin',
        'skill'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'content_audience_audience_check'
  ) THEN
    ALTER TABLE content_audience
      ADD CONSTRAINT content_audience_audience_check
      CHECK (audience IN ('ai-adoption-solo', 'ai-research-general'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'content_audience_source_check'
  ) THEN
    ALTER TABLE content_audience
      ADD CONSTRAINT content_audience_source_check
      CHECK (source IN ('seed', 'auto', 'human'));
  END IF;
END $$;

-- Lookup index (the WHERE clause shape used by lib/audience/filter.ts).
CREATE INDEX IF NOT EXISTS idx_content_audience_lookup
  ON content_audience (content_type, audience, content_id);

-- Uniqueness — one (content_type, content_id, audience) row max. This is
-- what makes the backfill script idempotent: re-running inserts via
-- ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_audience_triplet_uniq
  ON content_audience (content_type, content_id, audience);
