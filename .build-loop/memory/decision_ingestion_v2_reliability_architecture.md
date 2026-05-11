# Decision: Ingestion V2 reliability architecture

Date: 2026-05-11

## Context

The ingestion audit found that Decision Doctor accepted low-quality extracted text as successful corpus body content. The highest-impact example was OpenAI article pages storing a short Cloudflare/challenge shell as `body`, then summary/KG/embedding jobs treated that body as trustworthy.

## Decision

Build the first reliability slice in the existing Decision Doctor worker architecture instead of doing a large schema/table normalization first.

The current repo already has the right coarse shape:

- Drizzle migrations.
- `workers/src` Railway worker process.
- pg-boss queues.
- `content-extract`, `ai-summarize`, `kg-extract`, and source-agnostic embedding handlers.

So this slice uses `corpus_documents.metadata.content_extract` as the compatibility contract for:

- `extractor_version`
- `body_kind`
- `quality_score`
- `degraded`
- `degraded_reasons`
- `input_hash`
- `output_hash`
- `final_url`
- `status_code`

No new DB columns are required for this slice. A later normalization can promote `body_kind` or extraction runs into columns/tables after the corpus is safe.

## Architectural Rules

- `content_hash` must be updated whenever `body` changes.
- CDP/rendered output is never accepted only because length is greater than zero.
- `body_kind='full_text'` is the only body state eligible for full summary, KG, and embedding.
- Downstream jobs should still be dispatched after extraction so ineligible bodies can stamp skipped metadata and clear stale embeddings/KG.
- `source_summary`, `metadata_only`, `blocked`, and `degraded` are valid outcomes, not crashes.
- Summary and KG idempotency must include the current `content_hash`.
- KG mentions and document relationships must be pruned/rebuilt when the body hash changes.
- IBR should not be imported as a runtime dependency; adapt the page-readiness and rendered text probe ideas locally.
- Keep pg-boss/Railway as the worker execution model.
- Source quality policy must work without hand-written source policy rows. Resolution order is explicit `ai_sources.crawl_config.quality_policy`, inferred `crawl_config` content type/category, inferred source/URL pattern, then conservative default.
- Static extraction should score multiple candidates (`article`, `main`, role main, article/post/content class hints, substantial `header`, body) and remove obvious chrome instead of relying on a single selector.
- Corpus validation should report trust and tieout failures directly: body kind, challenge shells, stale document hashes, stale summary/KG input hashes, and stale embedding chunk hashes.
- Backfill enqueue CLIs should be send-only; do not register local workers when the intended drain target is Railway.

## Progress Log

- Added `workers/src/ingestion/quality.ts` for body-kind classification, challenge/loading detection, extractor versioning, and hash helpers.
- Extended `workers/src/cdp/extract-content.ts` with a rendered content probe and text-stability wait.
- Started hardening `workers/src/adapters/content-extract.ts` to choose extraction candidates through quality gates, write `content_hash`, and stamp richer metadata.
- Started gating downstream handlers so full enrichment only runs for `full_text`; queue dispatch remains active so cleanup can run for ineligible bodies.
- Started adding body-kind/hash gates to `ai-summarize`, `kg-extract`, and embeddings.
- Added `workers/tests/ingestion-quality.test.ts` for challenge rejection, source-summary classification, full-text classification, extraction idempotency gating, and downstream body-kind eligibility.
- Verified `pnpm --dir workers typecheck` passes after the first implementation slice.
- Verified focused worker tests pass for ingestion quality, summary shape, KG parse, and embedding guard behavior.
- Verified full `pnpm --dir workers test` passes: 8 files, 37 tests.
- Replaced hardcoded source policy assumptions with layered policy inference plus optional `crawl_config.quality_policy` overrides.
- Improved static and rendered candidate arbitration so the extractor picks by body-kind rank, quality score, word count, and length.
- Added coverage for inferred policies, explicit policy marker overrides, and header-contained article text extraction.
- Upgraded `workers/src/cli/validate-corpus.ts` to report body-kind distribution, stale `content_hash`, challenge shells, stale embedding chunks, stale summary hashes, and stale KG hashes.
- Changed `workers/src/cli/enqueue-content-extract.ts` to pg-boss send-only mode so manual backfills do not accidentally drain locally.
- Ran the upgraded validator against live corpus: 1,516 global docs; report written to `.build-loop/memory/pattern_corpus_quality_2026-05-11_ingestion-v2.md`; current database still fails because pre-existing rows lack `content_extract.body_kind`, include stale document hashes, and contain challenge shells.
- Verified final `pnpm --dir workers typecheck` passes.
- Added DB coverage that re-running embedding after a body/content-hash change re-embeds changed chunks.
- Verified final `pnpm --dir workers test` passes: 8 files, 41 tests.

## Follow-Up

- Run corpus validation/backfill against live Railway data, starting with `openai-news` and `perplexity-research`.
- Consider promoting stable metadata fields (`body_kind`, `quality_score`, `extractor_version`, `next_extract_at`) into columns after the repair run proves the contract.
