# Perplexity guidance — reconciliation with Decision Doctor architecture

**Date:** 2026-05-10
**Source:** `~/Downloads/Semantic Search Architecture for Multi-Tenant AI Research App.md` (Perplexity-generated, generic best-practice for a psychiatry-practice MVP)
**Status:** ✅ Verified — three-way cross-check across Claude (in-repo plan), Codex (`decision-doctor-codex/` planning pass), and Perplexity (this doc). Reconciliation locked into ADRs 009–012 in `docs/PRD.md` §P0++.

---

## TL;DR

Perplexity proposed a substantively different architecture: **physical DB-per-tenant** (Neon API spins one new Postgres database per signing-up customer in ~2 seconds) + a separate **shared `shared_knowledge` DB** for public research, with **app-layer federation** at search time. The framing is HIPAA-driven (psychiatry-practice MVP).

**Decision: keep single-DB-with-`scope` column for v1** (the foundation already shipped in commits `41e1acf..bf610c9`). DB-per-tenant is the right pattern when PHI enters the workflow — defer to v2 with the migration path documented. Three Perplexity-specific additions absorbed via ADRs 010–012; one (pg_search adoption) is a free win because the Neon tier check confirmed `pg_search 0.15.26` is already available.

---

## Three-way comparison

| Dimension | Claude (in-repo) | Codex (`decision-doctor-codex/`) | Perplexity | Resolution |
|---|---|---|---|---|
| Tenant isolation | Single DB, `scope='global' \| user_id`, RLS | Same as Claude | **Physical DB-per-tenant** + separate shared DB, app-layer federation | **ADR-009: Single-DB for v1.** Defer DB-per-tenant to v2 HIPAA path. Cite Perplexity's pattern as migration target. |
| Vector dimensions | 768 (Matryoshka) | 1536 (hard CHECK constraint) | 1536 | **ADR-007 stays** — 768. Perplexity didn't defend 1536 over 768; defaulted to model max. |
| HNSW build params | `m=16, ef_construction=200` | `m=16, ef=64` | `m=16, ef=64` | **ADR-008 stays** — 200. Production-tuned default per pgvector docs + Tiger Data + Azure guidance. |
| Queue tech | pg-boss | implied BullMQ | BullMQ ("from existing Atomize stack") | **ADR-006 stays** — pg-boss. DD has no existing BullMQ; Perplexity confused us with Atomize. |
| Reranker | not planned | not planned | **Cohere Rerank-4 Fast** (top-20 RRF → top-5) | **ADR-010 (new): adopt Cohere Rerank-4 Fast** as Phase-2. +28–40% accuracy, $0.50/1000 queries, ~120ms. |
| Hybrid search | pgvector + Postgres FTS + RRF | Same | Same + clean SQL pattern | **ADR-008 unchanged** as the strategy. SQL pattern locked: top-40 vector + top-40 keyword → RRF → top-20. |
| BM25 ranking | tsvector ranking | tsvector | tsvector w/ "future upgrade to pg_textsearch when stable" | **ADR-012 (new): adopt `pg_search` immediately** — Neon tier check confirmed `pg_search 0.15.26` is *already available*. True BM25 from day 1, not "future upgrade." |
| LLM routing | Groq only | Groq + Claude Haiku for synthesis | Same as Codex | Documentation update — Claude Haiku for "generate workflow recommendation from N documents," Groq for retrieval + standard chat. Not an ADR; routing module convention. |
| pgvector version | unspecified | unspecified | **0.8+ required** (iterative scans, 9× faster filtered queries) | **ADR-011 (new):** Neon already has **pgvector 0.8.0** ✅ per the Neon tier check landed in commit `41e1acf`. Iterative scans available for filtered (RLS-guarded) queries from day 1. |
| Index discipline | `corpus_documents_scope_idx` on `scope` | similar | **Composite indexes with leading tenant_id column** | Verified in `drizzle/0003_corpus.sql` — `scope` is leading; composite indexes follow the pattern. |
| Connection context | unspecified | unspecified | **`SET LOCAL`** not `SET` (leak prevention) | ✅ Already correct — `lib/db/actor.ts:67-68` uses `set_config(name, value, true)` which is the function form of `SET LOCAL` (third param `true` = is_local). |
| Embedding cost | Batch API for ingest | unspecified | OpenAI Batch API = 50% off | Both correct. Helper at `lib/embeddings.ts` will use Batch API when ingest worker wires the F-30 follow-up. |
| Source list | arXiv + Anthropic + OpenAI + Perplexity | Same 4 + DeepMind + Meta + Microsoft + HuggingFace second wave | Same + The Batch (DeepLearning.ai) + MIT Tech Review AI | Adopt full union when adapters are written. |

---

## Why DB-per-tenant is wrong for DD right now (but right for v2)

Perplexity's two-pool architecture is purpose-built for the HIPAA scenario where each customer = one organization with PHI. DD v1:

- **ADR-002 says no PHI in v1.** The HIPAA driver Perplexity optimizes for doesn't apply.
- **ADR-003 says single-user UX, multi-tenant-ready schema.** One user = one tenant in the existing `tenants` table; not N users per org.
- **Solo practitioners.** Each signing-up customer is one person, not an organization with cross-user data needs.
- **Cost.** N Neon DBs + cross-DB schema migrations + federation logic outweighs benefit at DD's scale.

Perplexity's own comparison table lists "Shared table + RLS" as "Lowest cost · Weak GDPR/HIPAA fit." The "Weak" assessment doesn't bite when there's no PHI to leak. ADR-009 captures this deferral so the choice is intentional, not accidental.

**v2 migration trigger:** when DD accepts PHI for the first time (per ADR-002 it's currently rejected at the Zod intake layer), the migration path is exactly Perplexity's `db-per-tenant` pattern. The existing `tenants` table already carries the abstraction needed — adding `neon_project_id` + `neon_db_url` columns later is additive.

---

## What changes in the working architecture (4 new ADRs)

### ADR-009 — Tenant isolation = single DB with `scope` column for v1; DB-per-tenant deferred to v2

**Context.** DD v1 rejects PHI at the intake layer (ADR-002) and serves solo practitioners (ADR-003). Multi-tenant scaling is "schema-ready, not yet active." Three-way architecture review (Claude / Codex / Perplexity) split on whether to adopt physical DB-per-tenant now.

**Decision.** Single-DB with `scope` column + RLS for v1. Defer Neon-API-driven DB-per-tenant to v2 HIPAA work.

**Consequences.**
- Faster ship: corpus tables shipped in commit `5ca7be2` use `scope = 'global' | user_id::text` + RLS via `current_setting('app.current_user_id', true)`
- v2 migration path documented: add `neon_project_id` + `neon_db_url` to the existing `tenants` table; per-tenant DB provisioning on signup via Neon API; query-time federation via parallel queries + app-layer RRF.
- Cite Perplexity's `db-per-tenant` reference (`github.com/neondatabase/ai-vector-db-per-tenant`) as the canonical pattern for the future migration.

### ADR-010 — Reranking = Cohere Rerank-4 Fast (Phase 2)

**Context.** RRF fusion of vector + BM25 (per ADR-008) reaches ~91% recall@10. A second-pass cross-encoder reranker reportedly delivers +28–40% additional accuracy. Phase 1 ships hybrid search without rerank; Phase 2 layers the reranker in.

**Decision.** Use Cohere Rerank-4 Fast as the cross-encoder reranker. Top-20 RRF candidates → top-5 reranked. Add to `/api/search` between RRF and answer synthesis.

**Consequences.**
- Phase 1 (F-31): ships RRF only, no rerank. Search is functional but not maximally accurate.
- Phase 2: new module `lib/ai-knowledge/search/reranker.ts` calls Cohere API. Adds ~120ms latency, ~$0.50/1000 queries. Bounded top-K (20 → 5) caps cost.
- Cohere is a third-party dependency. Add `COHERE_API_KEY` to env. Graceful degradation: if Cohere is unreachable, return the top-5 from RRF directly (degraded flag set on response).
- Alternative if Cohere goes down or costs balloon: Voyage Rerank 2.5 at $0.05/1000, or self-hosted `ms-marco` cross-encoder.

### ADR-011 — pgvector 0.8 iterative scans required for filtered (RLS) queries

**Context.** pgvector ≥0.8.0 introduces "iterative scans," which fix the overfiltering problem in filtered queries (queries where a WHERE clause is applied alongside the HNSW search — including RLS evaluation). Perplexity flagged this as a 9× speedup. Neon tier check (commit `41e1acf`) confirmed pgvector 0.8.0 is already installed.

**Decision.** Require pgvector ≥ 0.8.0 in the runtime check. Lean into iterative-scan-friendly query shapes (filter on indexed columns first, then HNSW search).

**Consequences.**
- `.build-loop/neon-tier-check.json` validates this on every dispatch.
- Schema (`drizzle/0003_corpus.sql`) already structured for iterative scans: `corpus_documents_scope_idx` indexes the `scope` filter column; HNSW index on `corpus_embeddings.embedding`; joins by `document_id` are FK-indexed.
- F-31 search route will use the iterative-scan pattern: filter on `scope = 'global' OR scope = current_user_id` first, then HNSW order.

### ADR-012 — BM25 ranking = `pg_search` (ParadeDB Tantivy) since available on Neon

**Context.** ADR-008 documented the hybrid search strategy as "pgvector + Postgres FTS (tsvector)." Both Perplexity and Tiger Data's docs note that `tsvector` ranking is weaker than true BM25, and recommended ParadeDB's `pg_search` extension as a "future upgrade when stable." Neon tier check (commit `41e1acf`) confirmed `pg_search 0.15.26` is *already available* on the current Neon plan — it's not a future upgrade, it's a present option.

**Decision.** Use ParadeDB `pg_search` for the BM25 leg of hybrid search from day 1. Skip the tsvector intermediate step.

**Consequences.**
- ADR-008 unchanged in strategy (hybrid + RRF + k=60); the BM25 backend changes from tsvector → pg_search.
- Add to corpus migration: `CREATE EXTENSION pg_search;` + BM25 index on `corpus_documents.title || ' ' || corpus_documents.body`. Indexing migration is incremental on top of `0003_corpus.sql`.
- Recall improvement: BM25 (Tantivy under the hood) outperforms `ts_rank` on standard IR benchmarks; the 91% RRF figure should improve slightly.
- Tradeoff: pg_search is a less-mature extension than tsvector. Mitigation: the FTS leg of RRF can fall back to tsvector if pg_search is ever unavailable (the schema can keep both: `search_tsv` generated tsvector + `pg_search`-indexed text expression).
- One follow-up: F-31 search query uses `paradedb.score()` instead of `ts_rank()` for the BM25 leg.

---

## Net-new from Perplexity beyond the 4 ADRs

These don't warrant ADRs but are worth folding in as conventions:

1. **LLM routing module** — `lib/llm-routing.ts` selects Groq (Llama 3.3 70B) for retrieval + chat, Claude Haiku for "generate workflow recommendation from N documents" / structured clinical reasoning. Triggers on response-size + structure heuristics, not user-explicit. Document as part of F-32 (chat-first IA) when that dispatch ships.

2. **Source list expansion** — Codex's 8 sources + Perplexity's 2 additions (The Batch / DeepLearning.ai, MIT Tech Review AI) = 10 source adapters to write progressively. Order: arXiv (already shipped) → Anthropic → OpenAI → Perplexity → DeepMind → Meta → Microsoft → HuggingFace → The Batch → MIT Tech Review.

3. **pgvectorscale** — Timescale's DiskANN extension. 28× lower p95 latency at 50M+ vectors. Not needed at MVP scale. Track for v2 when corpus exceeds 5M vectors.

4. **Per-tenant fine-tuning** — Per Perplexity, DB-per-tenant unlocks per-tenant embedding model fine-tuning (e.g., clinical psychiatry-tuned embeddings). Defer to v2; relevant only after DB-per-tenant lands.

---

## Open verifications

- Confirm `COHERE_API_KEY` provisioning path for Phase 2 (ADR-010). Today: not present.
- Benchmark BM25 vs tsvector recall on a 20-query DD eval set before locking ADR-012. The 91% RRF figure assumes tsvector; pg_search may move it higher.
- Verify `pg_search` is functionally stable on Neon for production use. Status: 0.15.26 installed-available on current tier; production-stability claim per ParadeDB is "GA."

---

## References

- Neon `db-per-tenant` reference: `https://github.com/neondatabase/ai-vector-db-per-tenant`
- Perplexity guidance source: `~/Downloads/Semantic Search Architecture for Multi-Tenant AI Research App.md` (user-supplied)
- Codex parallel plan: `decision-doctor-codex/docs/architecture/ai-knowledge-search-architecture.md`
- Claude in-repo plan: `docs/research/pipeline-simplification-2026-05-10.md`
- Neon tier check (live): `.build-loop/neon-tier-check.json` (commit `41e1acf`)
- pgvector iterative scans (0.8+): `https://github.com/pgvector/pgvector`
- ParadeDB `pg_search`: `https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual`
- Cohere Rerank-4 pricing/specs: `https://orq.ai/blog/from-noise-to-signal-how-cohere-rerank-4-improves-rag`
