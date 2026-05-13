# Session handover — Decision Doctor corpus + workers pipeline

**Date:** 2026-05-11
**Current HEAD:** `c7cbc32` on `main` (pushed to origin)
**Live Railway worker:** `https://decision-doctor-workers-production.up.railway.app` — `● Online`, `/health` returns 200
**Live Vercel app:** `decision-doctor-xi.vercel.app` (unchanged this session)

**Crawler-build supersession note:** for the next crawler/KG implementation pass, use
`docs/handover/2026-05-11-claude-code-crawler-build-brief.md` as the authoritative
brief. This file remains useful historical state, but its older CDP/Nixpacks notes are
superseded by the newer Railway-safe guidance.

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

- **Railway:** project token in `.secrets/dd-secrets.rtf` (gitignored). Extract pattern documented in `docs/operations/railway-worker-deploy-playbook.md`. NO `railway login` needed; project token is sufficient for all deploy ops.
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

- `workers/src/cdp/{browser,connection,page,runtime,wait}.ts` (NEW — **copied from `~/dev/git-folder/interface-built-right/src/engine/cdp/`**). User-owned project; zero external deps (only Node built-ins). Strip UI-testing files (accessibility, css, dom, input, emulation, network, console, snapshot, target). ~28 KB of TS total.
- `workers/src/cdp/extract-content.ts` (NEW, ~50 lines) — thin wrapper exposing `async extractRenderedHtml(url): Promise<string>`. Reuses IBR's BrowserManager + PageDomain + Runtime.evaluate.
- `workers/nixpacks.toml` (ONLY IF CDP IS IMPLEMENTED) — do **not** add Chromium through `nixPkgs`. If render fallback is needed, use Railway apt/prebuilt Chromium packaging per `docs/handover/2026-05-11-claude-code-crawler-build-brief.md`.
- `workers/src/adapters/content-extract.ts` (NEW) — per-source path selection:
  - arxiv → no-op (abstract is already content)
  - anthropic-news → HTTP + cheerio extract `<article>`
  - openai-news → CDP via `cdp/extract-content.ts` (JS-rendered, HTTP returns ~10KB shell)
  - default → HTTP + cheerio; if body < 500 chars, fallback to CDP
  - Writes `metadata.content_extract.{method, fetched_at, body_chars}` for observability
- `workers/src/adapters/ai-summarize.ts` (NEW) — Groq Llama 3.3 70B via OpenAI SDK with `baseURL: 'https://api.groq.com/openai/v1'` (no new dep). `temperature: 0` + structured JSON: `{tl_dr, novel_capability, risks, automation_candidates, who_should_care_level, est_skill_level}`. SMB-persona constraint in system prompt (no PHI references, generic application framing for solo-practitioner).
- `workers/src/adapters/kg-extract.ts` (NEW) — Groq Llama 3.3 70B extracting `{entities: [{type, canonical_name, aliases}], relationships: [{source, target, type}]}`. Canonicalization: pg_trgm similarity ≥ 0.7 + alias array intersection (Atomize pattern). INSERTs to `ai_entities` (ON CONFLICT bump `mention_count`), `ai_document_entity_mentions`, `ai_relationships`.
- `workers/src/queue.ts` — register 4 new queues (`content-extract` + 3 enrichment) + chain logic. Existing `rss-fetch`/`anthropic-news-fetch`/`arxiv-fetch` handlers re-pointed to enqueue `content-extract` (not `arxiv-embed`). content-extract then fans out to ai-summarize + kg-extract + arxiv-embed in parallel.
- `workers/src/seed-sources.ts` (NEW) — idempotent `ON CONFLICT DO NOTHING` INSERT of 3 source registry rows: arxiv-cs-ai (tier=1, source_kind=`paper_index`), openai-news (tier=1, `lab_news`), anthropic-news (tier=1, `lab_news`). Run-once during deploy.
- `workers/tests/{cdp,content-extract,ai-summarize,kg-extract}.test.ts` (NEW)

### Critical invariants for the dispatch

1. **LLM classifies + proposes; TS computes** — ai-summarize and kg-extract both `temperature: 0` + structured JSON. No numeric scoring inside the LLM call.
2. **Idempotent** — each job is re-runnable. Idempotency markers:
   - `metadata.content_extract.{method, fetched_at, body_chars, prompt_version?}` — content-extract skip if recent + same method
   - `metadata.ai_summary.{generated_at, prompt_version}` — ai-summarize re-runs only on prompt_version bump
   - kg-extract checks `ai_document_entity_mentions` join for existing extractions
3. **Pipeline ordering (CORRECTED from earlier ASCII diagram):**
   ```
   ingest → corpus_documents INSERT (stub body)
            ↓
            content-extract  (updates body in place, idempotent)
            ↓
            ┌──────────────┬──────────────┬──────────────┐
            ↓              ↓              ↓
       ai-summarize    kg-extract     arxiv-embed
       (full body)     (full body)    (re-embed full body)
   ```
   All three enrichments run **after** content-extract so they see the same enriched body.
4. **Atomize lessons:**
   - One canonical writer pattern (don't fan-out writes to entities)
   - 1 req/sec rate limit on outbound fetches (HTTP and CDP both)
   - Graceful degrade: each handler marks its own degraded state in metadata; chain CONTINUES on individual handler failure (Groq down → ai_summary.degraded=true; CDP crash → content_extract.degraded=true; never blocks downstream)
5. **CDP integration (per user's IBR-is-mine clarification):**
   - Copy 5 files from `~/dev/git-folder/interface-built-right/src/engine/cdp/` to `workers/src/cdp/`
   - Do not add Chromium via `nixPkgs`; if CDP ships, use apt/prebuilt Chromium packaging and keep render concurrency at 1 until measured
   - Memory: ~200 MB sustained for Chrome process; lifecycle managed by `BrowserManager`
   - Only fires for OpenAI articles in current source list; SSR sources (Anthropic et al.) use HTTP+cheerio
6. **LLM client setup (no new dep):**
   - Workers already have `openai` package (used for embeddings).
   - For Groq calls, instantiate same SDK with `baseURL: 'https://api.groq.com/openai/v1'` + `apiKey: GROQ_API_KEY`. Groq's API is OpenAI-compatible.
   - Models per ADR-013: `llama-3.3-70b-versatile` for both ai-summarize and kg-extract (user-resolved; ADR-013 GPT-OSS-20B routing deferred until taxonomy stabilizes).
7. **SMB-persona constraint** in ai-summarize prompt: "Frame applications generically — no patient-specific examples, no PHI references, treat the user as a solo practitioner evaluating AI tools."
8. **kg-extract canonicalization strategy** (Atomize pattern):
   - Trigram similarity ≥ 0.7 against `ai_entities.canonical_name` (lowered)
   - PLUS alias array intersection (`aliases && ARRAY[$1]`)
   - If both match → use existing entity (bump mention_count + last_seen_at)
   - If neither → INSERT new entity
   - Ambiguous (multiple matches) → use highest-mention-count winner

### Backfill plan

**Verify row count first:** `SELECT count(*) FROM corpus_documents` (was 23 per this session's latest check; handover originally said 18 — 23 is correct).

Once handlers land, enqueue 3 chained jobs for each existing row:
- content-extract (fetches full body; for OpenAI uses CDP, for Anthropic uses cheerio, for arxiv no-op)
- ai-summarize (Groq call with full body)
- kg-extract (Groq call with full body)
- arxiv-embed re-runs on the updated body

**Cost estimate (corrected):** 23 docs × 2 LLM calls × ~3k tokens in + ~500 out on Llama 3.3 70B:
- Input: 23 × 2 × 3000 × $0.59/M = **$0.0815**
- Output: 23 × 2 × 500 × $0.79/M = **$0.0182**
- **Total: ~$0.10** (the earlier handover's $0.02 was off by 5×; the new session's $0.15 is closer)
- CDP-fetched OpenAI articles will pass much more input (full article ~10k tokens). 10 OpenAI docs × 10k tokens × 2 calls × $0.59/M = ~$0.12 additional. **Grand total backfill: ~$0.22.**

Still trivial; just be accurate.

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

1. **First message in new session:** "Continue from `docs/handover/2026-05-11-claude-code-crawler-build-brief.md` — implement the next Railway worker chunk for source seeding, content-extract, ai-summarize, kg-extract, and queue chaining."

2. **First action of new session:**
   - Read `docs/handover/2026-05-11-claude-code-crawler-build-brief.md`
   - Read this file for historical state only
   - Read `docs/PRD.md` §P0++ (F-30 status, F-31 prerequisites, ADRs 006–013)
   - Read `workers/src/queue.ts` (current handler shape — extend this)
   - Read `workers/src/adapters/anthropic-sitemap.ts` (the pattern to mirror for content-extract)
   - Verify Railway worker still Online: `RAILWAY_TOKEN=<from-rtf> railway status`
   - Verify Neon KG tables exist: `psql $DATABASE_URL_UNPOOLED -c "\dt ai_*"`

3. **Dispatch build-loop** for the work in §"Build-loop dispatch payload" above.

4. **After build-loop returns:**
   - Count current `corpus_documents` rows, then backfill via the new jobs
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
