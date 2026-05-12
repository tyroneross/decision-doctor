-- 0010 — Cached example output column for library_use_cases.
--
-- One Groq call per use-case row, ever, until invalidated by `example_output IS NULL`.
-- Reset via: UPDATE library_use_cases SET example_output = NULL WHERE id = $1;
--
-- The column inherits the existing scope-based RLS policy on library_use_cases
-- (drizzle/0007_library.sql §"RLS"); no policy changes required.
--
-- Concurrency note: two simultaneous first-time generators can race. The route
-- handler uses `UPDATE ... WHERE example_output IS NULL RETURNING ...` so the
-- second writer no-ops; both clients still see streamed tokens because the
-- write happens after the stream completes.
--
-- Hardening checklist item 2a: idempotent (ADD COLUMN IF NOT EXISTS).
--
-- runs against the OWNER pool (drizzle-kit migrate). Re-running is a no-op.

ALTER TABLE library_use_cases
  ADD COLUMN IF NOT EXISTS example_output text;
