# Session handover — Decision Doctor corpus + workers pipeline

**Date:** 2026-05-11
**Current HEAD:** `c7cbc32` on `main` (pushed to origin)
**Live Railway worker:** `https://decision-doctor-workers-production.up.railway.app` — `● Online`, `/health` returns 200
**Live Vercel app:** `decision-doctor-xi.vercel.app` (unchanged this session)

---

## What's live in production right now

### Database (Neon)

| Table | Rows | Source |
|---|---:|---|
| `corpus_documents` | **23** | arxiv: 8 · anthropic-news: 5 · openai-news: 10 |
| `corpus_embeddings` | ~13 (all 768-dim, HNSW indexed) | Chained from `arxiv-embed` |
| `ai_sources` | 0 | Schema only; needs seeding |
| `ai_entities` | 0 | Empty; awaiting `kg-extract` worker |
| `ai_document_entity_mentions` | 0 | Empty |
| `ai_relationships` | 0 | Empty |
| `ai_search_queries` | 0 | Empty (no search endpoint yet) |

All 5 KG tables (`ai_*`) have RLS by `scope = 'global' OR scope = current_setting('app.current_user_id', true)`. **6 policies installed**, verified.

### Worker on Railway (`decision-doctor-workers`)

- **Project:** `11d80262-9690-428d-ac73-ec689f9d5574` (`decision-doc-railway`)
- **Service:** `07399a5d-1b4b-4aa9-84d5-cfbcc506cee0`
- **Start command:** `node --import tsx src/index.ts` (Atomize-verified pattern; see `docs/operations/railway-worker-deploy-playbook.md`)
- **Env vars set:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `LOG_LEVEL`, `NODE_ENV`

**Active pg-boss queues:**
- `arxiv-fetch` → ingests arXiv papers
- `arxiv-embed` → chunks + 768-dim Matryoshka embedding (source-agnostic despite name)
- `rss-fetch` → generic RSS 2.0 parser (used for OpenAI)
- `anthropic-news-fetch` → sitemap → per-article og: meta extraction
- `test-job` → round-trip diagnostic

**Active node-cron schedules (live-firing):**
- `arxiv-cs-ai-hourly` — every hour at :00 (verified fired at `01:00 UTC` 2026-05-11)
- `anthropic-news-6h` — every 6h at :00 (00/06/12/18 UTC)
- `openai-news-rss-6h` — every 6h at :10 (00:10/06:10/12:10/18:10 UTC)
- `perplexity-hub-24h` — placeholder, no-op (adapter not built)

### Auth

- **Railway:** project token in `git ignore/dd-secrets.rtf` (gitignored). Extract pattern documented in `docs/operations/railway-worker-deploy-playbook.md`. NO `railway login` needed; project token is sufficient for all deploy ops.
- **OpenAI API key:** synced to `.env.local` + `workers/.env` + Railway env (from same RTF).

---

## Commits this session (in order)

```
c7cbc32 fix(db): make 0005_kg.sql idempotent — apply KG migration to Neon
d0d8142 feat(workers): enqueue-rss CLI for manual smoke-testing both adapters
8e24637 feat(workers): OpenAI RSS + Anthropic sitemap adapters (F-30 sources 2+3)
47c18fc docs(ops): Railway worker deploy playbook + lessons learned
c742796 fix(workers): use Atomize's node --import tsx pattern for Railway start
8e5c5be fix(workers): regenerate pnpm-lock.yaml after typescript hoist
32d52fe fix(workers): drop tsc build, run via tsx at runtime
60e4fe8 fix(workers): move typescript to dependencies for Railway build
2febf44 feat(db): migrate Codex's KG + search-diagnostics schema (0005_kg.sql)
7b2f72d docs(adr): ADR-013 LLM routing + ADR-001 update + ADR-010 revision
b43cecf docs(adr): ADR-009..012 — Perplexity reconciliation + pg_search adoption
0836da5 docs(research): Matryoshka assessment — current plan stays (ADR-007)
57595a3 docs(prd+research): F-30/31/32/33 chat-first wave + Atomize debt audit
```

13 commits, all pushed.

---

## The IMMEDIATE next action (queued, not dispatched)

User's last directive before handover:

> "Build scaffold for workers but prep to update. Ai-summarize will be used. This needs to feed to the database directly after ingestion for quick recall.
>
> Also add queue. And add knowledge graph if haven't already. We want to start connections early to ensure they are built accurately"

**KG is now applied** (`c7cbc32`). Next session should dispatch a **build-loop** for the worker scaffold:

### Build-loop dispatch payload (ready to fire)

Three new pg-boss job handlers chained into the existing ingest pipeline:

```
existing: rss-fetch / anthropic-news-fetch / arxiv-fetch
              ↓
          corpus_documents INSERT (today's behavior)
              ↓
          ┌───────────────┐
          ↓               ↓
    content-extract   (existing chain: arxiv-embed)
    [NEW]
          ↓
    body+author UPDATE corpus_documents
          ↓
          ┌───────────────────────────────┐
          ↓                               ↓
    ai-summarize                    kg-extract
    [NEW]                           [NEW]
    Groq Llama 3.3 70B              Groq Llama 3.3 70B
    structured-output JSON          structured-output JSON
          ↓                               ↓
    metadata.ai_summary             ai_entities + ai_document_entity_mentions
    UPDATE corpus_documents         + ai_relationships INSERTs
```

### File targets

- `workers/src/adapters/content-extract.ts` (NEW) — HTTP fetch + cheerio for Anthropic-style SSR sources; tolerates JS-rendered (OpenAI) by leaving body as-is. CDP fallback deferred.
- `workers/src/adapters/ai-summarize.ts` (NEW) — Groq call with `temperature: 0` + structured JSON: `{tl_dr, novel_capability, risks, automation_candidates, who_should_care_level, est_skill_level}`.
- `workers/src/adapters/kg-extract.ts` (NEW) — Groq call extracting `{entities: [{type, canonical_name, aliases}], relationships: [{source, target, type}]}`. Canonicalizes against existing `ai_entities` (pg_trgm fuzzy match); INSERTs new entities + mentions + relationships.
- `workers/src/queue.ts` — register 3 new queues + handlers + chain logic from `corpus_documents` INSERT.
- `workers/tests/content-extract.test.ts`, `ai-summarize.test.ts`, `kg-extract.test.ts` (NEW)

### Critical invariants for the dispatch

1. **LLM classifies + proposes; TS computes** — ai-summarize and kg-extract both `temperature: 0` + structured JSON. No numeric scoring inside the LLM call.
2. **Idempotent** — each job is re-runnable. ai-summarize checks `metadata.ai_summary.generated_at`; kg-extract checks `ai_document_entity_mentions` join.
3. **Atomize lessons:**
   - One canonical writer pattern (don't fan-out writes to entities)
   - 1 req/sec rate limit on outbound fetches if content-extract does per-article HTML fetch
   - Graceful degrade: if Groq is down, set `metadata.ai_summary.degraded=true` and continue chain (don't block)
4. **Chain triggers:** the rss-fetch / anthropic-news-fetch / arxiv-fetch handlers should be edited to enqueue `content-extract` (not just `arxiv-embed`) for each new doc. content-extract then fans out to ai-summarize + kg-extract + arxiv-embed in parallel.
5. **No new deps** unless required. cheerio is OK if absolutely needed for content-extract (Atomize pattern); otherwise prefer regex for known shapes (Anthropic SSR).

### Backfill plan

Once handlers land, enqueue all 3 jobs for the 18 existing rows in `corpus_documents` to populate KG + summaries retroactively. Cost estimate: ~$0.02 total (Groq Llama 3.3 70B at $0.59/M in, ~3k tokens per doc × 23 docs × 3 calls each).

---

## Open `[CLEANUP]` items + known issues

| Item | Severity | Notes |
|---|---|---|
| `ai_sources` table is empty | LOW | Codex's design has it as the table-driven source registry. Currently sources are hardcoded in `cron.ts`. F-31 dispatch should seed: `arxiv-cs-ai`, `openai-news`, `anthropic-news` rows with trust_tier=1; later add perplexity, deepmind, marketing-ai-institute (the user's curated SMB list) at tier 2-3. |
| Perplexity Hub adapter not built | LOW | `perplexity-hub-24h` cron is placeholder no-op. Adapter pending — feed format not verified (sitemap likely available). |
| IBR vs Atomize scraping comparison incomplete | INFO | I started benchmarking IBR's custom CDP engine vs Atomize's HTTP-only cheerio at `~/dev/git-folder/interface-built-right/test-scrape-compare.mjs`. Failed at dist export resolution. Conclusion before comparison was complete: OpenAI articles are JS-rendered (HTTP fetch returns ~10KB shell); Anthropic is SSR (works fine with HTTP). MVP doesn't need CDP — defer until search recall on OpenAI articles proves insufficient. |
| `tests/e2e/concurrent.test.ts` flake | LOW | Preexisting Groq wave-10 error rate (0.2 > 0.1 threshold). Known issue, not from this session's work. |
| Vercel `SecretsUsedInArgOrEnv` warning | INFO | Railway Nixpacks build logs warn that OPENAI_API_KEY + GROQ_API_KEY are passed as ARG/ENV (exposed in image-layer history). Functional but not best practice. Mitigation deferred. |

---

## Decision Records added this session

- **ADR-009** Single-DB + scope column for v1; DB-per-tenant deferred to v2 HIPAA path (Perplexity reconciliation)
- **ADR-010** *revised* — BGE-v2-m3 self-host reranker primary; gpt-4o-mini listwise fallback. **Cohere dropped from the stack.**
- **ADR-011** pgvector ≥ 0.8.0 required (confirmed 0.8.0 on Neon)
- **ADR-012** ParadeDB `pg_search` for BM25 (already available on this Neon tier)
- **ADR-013** Workload-aware Groq routing (replaces ADR-001 single-model lock). Classifiers → GPT-OSS 20B; reasoning → Llama 3.3 70B; UI chat → Llama 4 Scout; reframe → Llama 3.1 8B. TogetherAI explicitly deferred until fine-tuning becomes valuable.

All ADRs in `docs/PRD.md` §P0++.

---

## Research artifacts this session

- `docs/research/pipeline-simplification-2026-05-10.md` — Atomize debt audit + 2026 best-practice synthesis (pg-boss, Matryoshka, RRF, BGE)
- `docs/research/matryoshka-assessment-2026-05-10.md` — current plan (text-embedding-3-small @ 768 dims) verified optimal; arXiv 2503.17547 confirmed wrong-domain (Sparse Autoencoders, not retrieval)
- `docs/architecture/perplexity-guidance-reconciliation-2026-05-10.md` — three-way cross-check (Claude / Codex / Perplexity); single-DB stays, DB-per-tenant deferred
- `docs/operations/railway-worker-deploy-playbook.md` — 4 failure modes + Atomize-verified recipe + copy-paste
- `.build-loop/memory/lesson_railway_node_import_tsx.md` — compressed memory of the Railway pattern (project-local, gitignored)

---

## How to pick up cleanly in the new terminal

1. **First message in new session:** "Continue from `docs/handover/2026-05-11-corpus-pipeline-state.md` — dispatch the build-loop for content-extract + ai-summarize + kg-extract scaffold."

2. **First action of new session:**
   - Read this file
   - Read `docs/PRD.md` §P0++ (F-30 status, F-31 prerequisites, ADRs 006–013)
   - Read `workers/src/queue.ts` (current handler shape — extend this)
   - Read `workers/src/adapters/anthropic-sitemap.ts` (the pattern to mirror for content-extract)
   - Verify Railway worker still Online: `RAILWAY_TOKEN=<from-rtf> railway status`
   - Verify Neon KG tables exist: `psql $DATABASE_URL_UNPOOLED -c "\dt ai_*"`

3. **Dispatch build-loop** for the work in §"Build-loop dispatch payload" above.

4. **After build-loop returns:**
   - Backfill 23 existing docs via the new jobs (~$0.02)
   - Verify entities are populating in `ai_entities` + relationships in `ai_relationships`
   - Then F-31 (hybrid search + ⌘K palette + retrieval) is the next big chunk

---

## Don't re-do (already shipped)

- ✅ Railway worker deployment (4 build-failures resolved + Atomize pattern locked)
- ✅ Codex AGENTS.md spec verified (Context7 confirmed plain markdown, not frontmatter)
- ✅ Round-1 buildathon scope (F-08/F-09/F-10/F-11 — tagged `buildathon-round-1.2`)
- ✅ KG migration applied (this session, `c7cbc32`)
- ✅ OpenAI + Anthropic adapters live-verified end-to-end
- ✅ pg-boss + node-cron + /health + /cron-status all working

---

## User preferences re-confirmed this session

- "Build from scratch" — power iteration over mathjs (locked in F-10)
- "Build-loop is the default for non-trivial work" — 2+ files / new endpoint / arch boundary
- No unofficial RSS feeds (Anthropic uses official sitemap, not community feed)
- No fake numbers — "—/wk" anti-pattern eliminated; null states phrased honestly
- Pyramid Principle for reports — headline first, drill down on demand
- T-shirt sizing for effort (S/M/L), not $ estimates
