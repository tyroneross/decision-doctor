-- 0015 — Add rationale + confidence to content_audience.
--
-- Track A follow-up: corpus_document classification moved from source-level
-- rule (lib/audience/classify.ts) to per-article LLM classification using
-- openai/gpt-oss-120b on Groq. The classifier emits a 1-sentence rationale
-- and a 0..1 confidence per (content, audience) row.
--
-- Backfill writes both fields; ON CONFLICT updates them so re-runs refresh.
-- Library / kb / plugin / skill rows are still source-rule-classified and
-- carry a rationale of `<content_type> — curated for solo healthcare` with
-- confidence 1.0.
--
-- Idempotent — re-runs are no-ops. Additive only; no destructive changes.

ALTER TABLE content_audience
  ADD COLUMN IF NOT EXISTS rationale text;

ALTER TABLE content_audience
  ADD COLUMN IF NOT EXISTS confidence real;

-- Confidence range check (0..1 inclusive). NULL allowed because rows
-- inserted before 0015 will be backfilled by the next backfill run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'content_audience_confidence_range_check'
  ) THEN
    ALTER TABLE content_audience
      ADD CONSTRAINT content_audience_confidence_range_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Index supporting the human-review query (low-confidence rows for triage).
CREATE INDEX IF NOT EXISTS idx_content_audience_low_confidence
  ON content_audience (confidence)
  WHERE confidence IS NOT NULL AND confidence < 0.6;
