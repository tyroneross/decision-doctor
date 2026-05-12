# Ingestion Accuracy V2 — Build-Loop Plan

**Repo:** `/Users/tyroneross/dev/git-folder/decision-doctor-cc`
**Branch:** `v2-pain-to-ai-recommendation`
**Plan version:** 2.1 metadata-first reliability slice, updated 2026-05-12

## Bottom Line

Decision Doctor already has the right worker architecture: Drizzle, `workers/src`, pg-boss, Railway CDP, `content-extract`, `ai-summarize`, `kg-extract`, and embeddings.

The immediate architecture should therefore **harden the existing ingestion engine**, not pause for a large schema-first rewrite. The engine should use metadata-level contracts now, then promote stable fields to columns later if reporting/querying requires it.

## Goal

Stop bad web bodies from becoming trusted corpus content and make source extraction reliable across blogs, news sites, docs, research pages, RSS feeds, and JS-heavy pages.

The engine must treat extraction as an arbitration problem:

```txt
source observation -> fetch/render evidence -> extraction candidates -> quality arbitration
                  -> body_kind + hashes -> gated enrichment
```

## Current Implementation Slice

Implemented in this build-loop run:

- `workers/src/ingestion/quality.ts`
  - `body_kind` classification.
  - challenge/loading detection.
  - layered policy inference with optional `crawl_config.quality_policy` overrides.
  - extractor versioning.
  - body/hash helpers.
- `workers/src/cdp/extract-content.ts`
  - rendered content probe.
  - text-stability wait.
  - article/main/body text evidence.
- `workers/src/adapters/content-extract.ts`
  - quality-gated candidate selection.
  - multi-candidate static extraction from article/main/role-main/article/post/content/header/body.
  - atomic `body + content_hash + metadata.content_extract` write.
  - OpenAI blocked-page fallback to official RSS description as `source_summary`.
- `workers/src/queue.ts`
  - downstream gatekeeper dispatch for every extraction; handlers enrich only `full_text` and clean/stamp skips for ineligible bodies.
  - `embed-document` queue added with `arxiv-embed` compatibility alias.
- `workers/src/adapters/ai-summarize.ts`
  - input content-hash idempotency.
  - body-kind eligibility guard.
- `workers/src/adapters/kg-extract.ts`
  - input content-hash idempotency.
  - stale mention/relationship prune before rebuild.
- `workers/src/adapters/arxiv-embed.ts`
  - embedding guard for non-`full_text` documents.
- `workers/tests/ingestion-quality.test.ts`
  - challenge rejection, RSS summary classification, full-text classification, skip gating.
  - inferred policy, explicit policy marker overrides, header-contained article extraction.
- `workers/tests/arxiv-embed.test.ts`
  - changed-body embedding re-run coverage.
- `workers/src/cli/validate-corpus.ts`
  - corpus trust and tieout report: body kind, challenge shell rows, stale document hashes, stale embedding chunks, stale summary hashes, and stale KG hashes.
- `workers/src/cli/enqueue-content-extract.ts`
  - send-only pg-boss enqueue mode for safe Railway-side backfill draining.

Verified:

- `pnpm --dir workers typecheck`
- `pnpm --dir workers test` — 8 files, 42 tests

## Policy Direction

Source policies must be flexible. They should **not require every source to be hand-specified** before ingestion works.

Policy resolution order:

1. Explicit overrides from `ai_sources.crawl_config.quality_policy`.
2. Inferred policy from `crawl_config.content_type`, `category`, `discovery`, and `render_fallback`.
3. Inferred policy from URL/source type patterns.
4. Conservative default article policy.

Explicit policy is an override, not a requirement.

Supported optional `crawl_config.quality_policy` shape:

```json
{
  "min_full_text_words": 220,
  "min_summary_words": 12,
  "required_markers": ["optional regex/string"],
  "forbidden_markers": ["optional regex/string"]
}
```

If no policy exists, the engine should create an inferred profile such as:

- `paper_abstract`
- `docs`
- `spec`
- `article`
- `research_article`
- `metadata_or_shell`
- `default_article`

The chosen/inferred policy should be stamped into `metadata.content_extract` so debugging does not require guessing.

## Extraction Direction

The extractor should not rely on one selector or one library.

Candidate sources:

- RSS description as `source_summary`.
- JSON-LD/meta where available.
- static HTML candidates from `article`, `main`, `[role=main]`, article/post/content class hints, and substantial `header` blocks.
- rendered CDP candidates from article/main/body `innerText`/`textContent`.

Important extraction correction:

- Do not blanket-delete `<header>` before candidate scoring. Some JS/article sites place real article text in header-like containers.
- Do remove obvious chrome: scripts, styles, nav, footer, aside, noscript, SVG, forms.
- Pick the best candidate by body-kind rank, quality score, word count, and length, not by longest string alone.

## Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| A1 | OpenAI challenge text is classified `blocked`, never `full_text` | Vitest fixture |
| A2 | RSS descriptions classify `source_summary`, not `full_text` | Vitest fixture |
| A3 | `content-extract` writes `body` and `content_hash` together | typecheck + code review + backfill report |
| A4 | `content_extract` metadata includes extractor version, body kind, policy profile, input/output hash, quality score, and reasons | Vitest/code review |
| A5 | Summary/KG/embed only run full trust on `full_text` | Vitest/code review |
| A6 | Summary/KG idempotency includes current `content_hash` | Vitest/code review |
| A7 | KG stale doc mentions/relationships are pruned before rebuild | code review + DB smoke |
| A8 | Extraction policy works when no explicit source policy exists | Vitest for inferred policy |
| A9 | Static extraction recovers article text from `header`/article-like containers when appropriate | Vitest fixture |
| A10 | `pnpm --dir workers typecheck` and `pnpm --dir workers test` pass | command output |

## Completed Build Work

1. Replaced hardcoded source policy assumptions with layered policy inference.
2. Improved static/rendered candidate extraction and scoring.
3. Added tests for inferred policy and header/article candidate extraction.
4. Updated corpus validator to report `body_kind`, challenge shells, stale hashes, and enrichment hash freshness.
5. Ran live read-only corpus validation and wrote `.build-loop/memory/pattern_corpus_quality_2026-05-11_ingestion-v2.md`.
6. Verified worker typecheck and tests.
7. Deployed worker `62039f67-0ab3-4cfd-a235-bb93b9effc1f`; Railway drained the `openai-news` and `perplexity-research` priority backfill.
8. Added OpenAI RSS fallback after validation showed 29 OpenAI pages still rendered as challenge shells.

## Operational Next

1. Deploy the OpenAI RSS fallback.
2. Rerun `openai-news` backfill on Railway.
3. Review the validator report for any rows still classified as `blocked`, `degraded`, `metadata_only`, stale hash, or challenge shell.
4. Promote stable metadata fields to DB columns only after backfill proves the metadata contract is enough.

## Later Architecture Promotion

After corpus repair proves the metadata contract, consider:

- `body_kind` column.
- `quality_score` column.
- `extractor_version` column.
- `next_extract_at` column.
- separate `document_extraction_runs` history table.

Those are useful for reporting and historical provenance, but they are not required to stop the current poisoning bug.
