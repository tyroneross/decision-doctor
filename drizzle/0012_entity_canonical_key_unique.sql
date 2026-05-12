-- F-31 FIX-4 — Entity canonicalization (part 2 of 2): unique constraint
--
-- HARD DEPENDENCY: workers/src/cli/merge-entity-dupes.ts MUST have been run
-- with `--execute --i-know-the-risk` against the target DB FIRST. Applying
-- this migration before duplicates are merged will fail with:
--
--   ERROR: could not create unique index "ai_entities_canonical_key_unique"
--   DETAIL: Key (scope, entity_type, canonical_key)=(global, organization, claude)
--           is duplicated.
--
-- Operator runbook for prod:
--   1. Deploy code with 0011 + CLI but NOT 0012.
--   2. Apply 0011 (`pnpm db:push` or drizzle-kit migrate) — adds the
--      canonical_key column + non-unique index.
--   3. Run: `pnpm --dir workers exec tsx src/cli/merge-entity-dupes.ts --dry-run`
--      to inspect the projected merges. Verify dup_groups roughly matches
--      the audit (~233 as of 2026-05-11).
--   4. Run: `pnpm --dir workers exec tsx src/cli/merge-entity-dupes.ts \
--             --execute --i-know-the-risk` against prod. Sanity guard
--      aborts if mention/relationship rows drop more than 1%.
--   5. Re-run --dry-run; assert dup_groups = 0.
--   6. Apply 0012 — adds the unique constraint as the future safety net.
--
-- Once this constraint is live, kg-extract.ts's canonicalizeEntity() final
-- INSERT step will be protected from races that previously created
-- "Claude" + "ClaudeAPI" as separate rows.

CREATE UNIQUE INDEX IF NOT EXISTS ai_entities_canonical_key_unique
  ON ai_entities (scope, entity_type, canonical_key);
