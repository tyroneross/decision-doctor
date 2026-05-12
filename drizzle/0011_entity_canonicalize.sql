-- F-31 FIX-4 — Entity canonicalization (part 1 of 2): generated column + index
--
-- Adds a STORED generated column `canonical_key` on ai_entities that strips
-- whitespace, dots, and hyphens from canonical_name and lowercases the result.
-- Used to detect "Claude" / "claude.ai" / "Claude API" / "claude-api" as the
-- same entity for merge purposes.
--
-- The audit (docs/handover/independent-retrieval-audit-2026-05-11.md) found
-- 233 duplicate groups (285 excess rows) in ai_entities under the current
-- (scope, entity_type, lower(canonical_name)) unique index — case-only dedup
-- isn't enough; "Claude" and "Claude API" hit different unique buckets but
-- collapse to the same canonical_key.
--
-- IMPORTANT: this migration does NOT add a unique constraint on canonical_key.
-- 0012_entity_canonical_key_unique.sql adds it AFTER workers/src/cli/
-- merge-entity-dupes.ts has been run with --execute against the target DB
-- to drain existing duplicates. Applying 0012 before merging would fail
-- with "could not create unique index ... duplicate key".

ALTER TABLE ai_entities
  ADD COLUMN IF NOT EXISTS canonical_key TEXT
  GENERATED ALWAYS AS (
    lower(regexp_replace(coalesce(canonical_name, ''), '[[:space:].\-]', '', 'g'))
  ) STORED;

-- Non-unique index for the merge CLI's GROUP BY query and for future lookups.
CREATE INDEX IF NOT EXISTS ai_entities_canonical_key_idx
  ON ai_entities (scope, entity_type, canonical_key);
