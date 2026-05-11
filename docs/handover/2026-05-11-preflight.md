# Pre-dispatch fact-check — 2026-05-11

**Purpose:** ground-truth check before firing `/build-loop:run` for the content-extract + ai-summarize + kg-extract scaffold. Companion to `2026-05-11-corpus-pipeline-state.md` — read both before dispatch.

**HEAD:** `5074600` on `main`. Tree clean.

---

## Findings vs handover snapshot

| Check | Handover claim | Reality | Action |
|---|---|---|---|
| `pg_trgm` | implied available | ✅ **1.6 installed** | none — kg-extract canonicalization is good to go |
| `pgvector` | ≥ 0.8.0 required (ADR-011) | ✅ **0.8.0 installed** | none |
| `pg_search` | "already available on this Neon tier" (ADR-012) | ⚠️ **0.15.26 available BUT NOT INSTALLED** | `CREATE EXTENSION pg_search;` required **before F-31** (BM25). Not a blocker for this dispatch. |
| Postgres version | unstated | ✅ **17.8** (Neon aarch64) | none |
| `corpus_documents` row count | 23 total (table) / 18 (backfill section) | **48 actual** — 5 anthropic + 33 arxiv + 10 openai | crons fired since handover write. Backfill cost rescales: ~$0.46 (still trivial), not ~$0.22. |
| RLS on `ai_*` | "6 policies installed" | ✅ **6 policies — SELECT + INSERT only**, no UPDATE/DELETE | see "RLS implication" below |
| Railway worker | `● Online` | ✅ **`● Online`** at `decision-doctor-workers-production.up.railway.app` | none |

---

## RLS implication for kg-extract (medium — fold into brief)

`ai_entities` has SELECT + INSERT policies but **no UPDATE policy**. kg-extract needs to update `mention_count` and `last_seen_at` on existing entities when re-seeing them across documents.

Two viable paths:

1. **Run workers as DB owner (current state — recommended).** The worker uses `DATABASE_URL_UNPOOLED` which authenticates as `neondb_owner`. Postgres owners **bypass RLS by default**, so UPDATE works. No schema change needed for v1. Verify with `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('ai_entities','ai_relationships','ai_document_entity_mentions');` — if `relforcerowsecurity` is `false`, owner bypasses.

2. **Add UPDATE policies in `0006_*` (optional follow-up).** Mirror the existing scope-write INSERT policy for UPDATE. Required if/when workers move to `app_user` (the non-owner role in `DATABASE_URL_APP`).

**Recommendation:** path 1 for this dispatch (no migration needed). Add a `[CLEANUP] UPDATE policies on ai_* before app_user role migration` task per `feedback_debug_register.md`.

---

## Schema details the build-loop brief must respect

### `ai_entities`
- Allowed `entity_type` (CHECK constraint): `organization`, `model`, `product`, `person`, `benchmark`, `capability`, `technique`, `paper`, `standard`, `other`
- Unique key: `(scope, entity_type, lower(canonical_name))` — case-insensitive
- Trigram GIN index already on `lower(canonical_name)` — pg_trgm similarity queries are fast
- Alias GIN index already on `aliases text[]` — array-overlap canonicalization is fast
- `mention_count` and `last_seen_at` increment on each new mention (worker writes)

**kg-extract prompt MUST constrain `entity_type` to the 10 allowed values verbatim.**

### `ai_sources`
- Columns are `source_kind` + `source_key` (NOT `source_id` as some plan drafts assumed)
- Unique key: `(scope, source_key)`
- `trust_tier` default **2** (not 1) — seed must specify explicitly
- `crawl_config jsonb` is the place to store per-source overrides (rate-limit ms, content-extract method override, etc.)

**Seed payload (locked, corrected for `source_kind` CHECK constraint):**

```sql
INSERT INTO ai_sources (scope, source_kind, source_key, display_name, origin_url, trust_tier, crawl_config)
VALUES
  ('global', 'paper_index', 'arxiv-cs-ai',    'arXiv cs.AI',    'https://export.arxiv.org/api/query?search_query=cat:cs.AI', 1, '{"category":"lab_research","discovery":["api"],"rate_limit_ms":3000,"content_type":"paper"}'),
  ('global', 'lab_news',    'anthropic-news', 'Anthropic News', 'https://www.anthropic.com/sitemap.xml',                    1, '{"category":"lab_announcement","discovery":["sitemap"],"rate_limit_ms":1000,"content_type":"article"}'),
  ('global', 'lab_news',    'openai-news',    'OpenAI News',    'https://openai.com/news/rss.xml',                          1, '{"category":"lab_announcement","discovery":["rss"],"rate_limit_ms":1000,"content_type":"article","render_fallback":"quality_gate"}')
ON CONFLICT (scope, source_key) DO NOTHING;
```

Do not use `arxiv`, `sitemap`, or `rss` as `source_kind`; those are source adapters/discovery methods and belong in `crawl_config`.

Atomize-style `authority_tier` mapping (per plan §10) — lab announcements at tier 1, aggregators at tier 2, editorial at tier 3 — is reflected in `crawl_config.category`. Schema leaves room for tier=2/3 SMB sources later without rework.

### `ai_document_entity_mentions`
- Unique key: `(document_id, entity_id)` — one mention row per doc/entity pair; if the LLM emits the same entity twice in one doc, MERGE evidence_text or pick the strongest
- `confidence numeric(4,3)` default 0.800
- `evidence_text` is the verbatim span from the source — useful for spot-checking canonicalization

### `ai_relationships`
- Unique key: `(scope, source_entity_id, target_entity_id, relationship_type)`
- CHECK: `source_entity_id <> target_entity_id` (no self-loops)
- `temporal_status` enum: `active`, `ended`, `announced`, `rumored` — prompt should include this guidance
- `evidence_document_id` FK with `ON DELETE SET NULL` — relationships survive doc deletes

---

## Open observation — pgcrypto / gen_random_uuid()

All `ai_*` tables use `gen_random_uuid()` defaults. Confirmed working (rows created via tests). No `pgcrypto` extension call needed in the new migration — Postgres 13+ ships `gen_random_uuid()` in core.

---

## Cost re-estimate (48 docs × 3 chained calls)

| Call | Model | In tokens (avg) | Out tokens (avg) | Per-doc cost | 48-doc cost |
|---|---|---|---|---|---|
| content-extract (CDP for 10 OpenAI; cheerio for 5 Anthropic; no-op for 33 arxiv) | n/a (no LLM) | n/a | n/a | $0 | $0 |
| ai-summarize | Llama 3.3 70B | ~3,000 | ~500 | $0.00217 | **$0.104** |
| kg-extract | Llama 3.3 70B | ~3,500 | ~800 | $0.00269 | **$0.129** |
| **Total** | | | | | **~$0.23** |

Handover's $0.22 is right within rounding — even at 48 docs it stays in the same band because LLM costs dominate and doc count was undercounted. CDP infra adds ~$3–5/mo Railway compute on top, amortized across all future ingest.

---

## Verdict

✅ Environment is ready. No blockers. Two notes folded forward:

1. **pg_search needs `CREATE EXTENSION` before F-31** — not before this dispatch.
2. **RLS path 1 (owner bypass)** is fine for v1; add `[CLEANUP] UPDATE policies on ai_*` task for the future `app_user` migration.

Phase 2 (`/build-loop:run` dispatch) can proceed.
