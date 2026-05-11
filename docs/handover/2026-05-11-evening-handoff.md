# Handoff — Decision Doctor (evening session, 2026-05-11)

**Supersedes:** none (complements morning `2026-05-11-resume.md`).
**Framing:** v1 production for real users. Per user direction this session: scope-limited if necessary but no demo-optimizations. No threshold lowering, no skipped fixes for "buildathon timing."
**Mirror:** copy of this file lives in both worktrees' `docs/handover/`.

---

## TL;DR

12.5× corpus growth (121 → 1,516 docs across 13 sources) shipped. F-31 full hybrid-search code shipped end-to-end and merged to `main` at `0a4f6c9`. **F-12 recall@10 = 0.833 (below 0.85 hard-stop)** — independent audit reframed the root cause from "bad corpus" to a 4-bug stack (BM25 parser all-AND + 47.7% unembedded + 285 KG dupes + eval-set bias). A 6-chunk fix bundle is queued (`FIX-1..FIX-7`) with projected `recall@10 ≥ 0.91` after FIX-1 alone. Worker throughput is now env-tunable (`EMBED_BATCH=5`, `AI_SUMMARIZE_BATCH=5`, `KG_EXTRACT_BATCH=3` live on Railway). Three sources still need a CDP-rendering re-extract for 95 stub rows (`openai-news`, `perplexity-research`, `chicago-booth-research`).

---

## What's live in production right now

### Origin SHAs (both branches pushed)

- `origin/main @ 0a4f6c9` — Vercel auto-deployed; Railway auto-deployed
- `origin/corpus-pipeline @ 483a36b` — feature branch, ahead of main only on the env-overridable-batchSize commit (which is now on main via the merge); kept around for backend-side parallel development

### Database (Neon, project `dd-prod`)

| Table | Rows |
|---|---:|
| `corpus_documents` | **1,516** (was 121 at session start) |
| `corpus_embeddings` (distinct doc count) | TBD — audit measured 773 of 1,479 docs had embeddings (47.7% gap). Run validate-corpus CLI to recheck — gap likely shrunk after backfill drained but not zero. |
| `ai_sources` | 14 rows (3 pre-existing + 11 added this session) |
| `ai_entities` | TBD — audit measured 285 duplicate rows after normalization |
| `ai_relationships` | TBD |
| `ai_document_entity_mentions` | TBD |
| `ai_search_queries` | populated (observability writes are firing) |

### Live URLs

- Web app: `decision-doctor-xi.vercel.app` (Vercel auto-deployed from main)
- Worker: `decision-doctor-workers-production.up.railway.app` — `/health` returns 200, `pgboss_queue_count: 0`, F-7 BGE server live
- Health endpoint reports `bge: {loaded, model}` after first warm `/rerank` call

### Worker concurrency (Railway env, live)

| Queue | batchSize | Why |
|---|---:|---|
| `arxiv-embed` | 5 (`EMBED_BATCH`) | OpenAI text-embedding-3-small @ 3000 RPM |
| `ai-summarize` | 5 (`AI_SUMMARIZE_BATCH`) | Groq Llama 3.3 70B |
| `kg-extract` | 3 (`KG_EXTRACT_BATCH`) | Slower per-job; smaller fan-out keeps Groq happy |
| `content-extract` | 1 | CDP must stay serial per CLAUDE.md non-negotiable |
| `*-fetch` (arxiv, rss, anthropic-news, sitemap) | 1 | Already rate-limited at source |

### Cron schedules (live on Railway)

15 schedules registered (3 pre-existing + 11 new from this session). See `workers/src/cron.ts`. Daily / 3-day / weekly cadences staggered to avoid :00 boundary collisions.

---

## What this session shipped

### Code (10 chunks shipped end-to-end on `main`)

1. **C8–C12 UI Guidelines v0.1** — D2 ledger hero, AHP 1-9 numeric, F3 desktop SkillPanel, cleanup sweep + intake re-skin, A/B/F ThemePicker + `/app/account` page.
2. **F-1 tsvector + GIN FTS** — pivot from paradedb (deprecated on Neon as of 2026-05-11). `corpus_documents.body_tsv` generated column + GIN index + `app_user` INSERT grant on `ai_search_queries`. Migration `drizzle/0006_fts.sql`.
3. **F-2 ai_sources re-seed** — enriched `crawl_config` shape with `discovery`, `category`, `rate_limit_ms`, `content_type`, `render_fallback`.
4. **F-7 BGE rerank server** on Railway worker. `Xenova/bge-reranker-base` substituted for `BAAI/bge-reranker-v2-m3` (no transformers.js-compatible ONNX export for v2-m3). Cold-start 509ms, warm 5-doc batch 57ms. Discrimination verified (+4.90 vs -10.18). Tokenizer call uses `text_pair` option-bag form (not positional).
5. **F-3..F-12 UI-side F-31** — `bm25-leg.ts` (tsvector + `ts_rank_cd`), `vector-leg.ts` (HNSW + `ef_search=100`), `kg-leg.ts` (1-hop expansion), `rrf-fusion.ts` (k=60), `bge-client.ts` + `gpt4o-fallback.ts` (3000ms timeout), `/api/search/route.ts` (`runtime='nodejs'`, RLS via `set_config`), `CommandPalette.tsx` (⌘K), `CitationChip.tsx`, `f31-hybrid-search.test.ts`.
6. **Generalized sitemap adapter** — `workers/src/adapters/sitemap-adapter.ts` reads behavior from `ai_sources.crawl_config`; supports url filter regex, sitemap-index recursion, render-fallback, lookback days, max-per-run caps.
7. **11 new ai_sources** — anthropic-docs (`platform.claude.com`), mcp-spec, perplexity-research, huggingface-blog, deepmind-blog, google-blog-ai, mistral-blog, stanford-hai, mit-csail, ibm-research, chicago-booth-research. `ai.meta.com` deferred (sitemap 301-loops to 404). BCG/Deloitte/McKinsey/Bain blocked (302/403/gated).
8. **Tier-1 historical backfill** — 1,395 net new docs across 11 sources. ~$21.60 Groq spend.
9. **Worker concurrency env-overridable** — `EMBED_BATCH` / `AI_SUMMARIZE_BATCH` / `KG_EXTRACT_BATCH` env vars; defaults stay at 1 for zero-impact upgrades. Promise.all parallelism in handlers.
10. **Nested `<article>` extraction fix** (commit `18e415e`) — `extractArticleText` picks the longest match across nested tags. Solved Anthropic docs (96.5% → 1.6% stubs). **Does not solve** openai-news / perplexity / Booth — those need CDP or per-source selectors.

### Discoveries (logged to global memory `~/.build-loop/memory/`)

11. **`websearch_to_tsquery` ANDs all tokens** — natural-language queries with >4-5 tokens return zero rows from BM25. Eval sets built from title-paraphrases hide this bug. Real users hit it immediately.
12. **Embedding worker falls behind ingestion** — 47.7% of corpus had no embeddings at audit time. Vector leg is dark for the unembedded set.
13. **KG entity duplication is severe** — 285 excess rows (`Claude` / `ClaudeAPI` / `Claude API` / `claude.ai` / `claude-4-5` etc. all distinct). 1-hop expansion explodes into hundreds of off-topic docs.
14. **Embedding chunks miss the title** — stub-body docs become unretrievable; prepending title rescues them.
15. **Drizzle `${arr}::uuid[]` silently fails** — produces a record tuple, not a UUID array. Use `sql.join(arr.map(x => sql\`${x}::uuid\`), sql\`, \`)` instead. Caught only because F-12 exercised the live path.
16. **pg_search deprecated on Neon** — `CREATE EXTENSION pg_search` rejected as of 2026-05-11. tsvector + GIN is the Postgres-core fallback.

### Operations

17. **Pushed corpus-pipeline → origin** (3 commits) + **merged to main** (twice — for F-1/F-2/F-7 + for X-1..X-5 backfill code).
18. **Local worker (PID 60425)** booted on user machine to drain queue 2× faster; killed after queue drained.
19. **Railway env vars set**: `EMBED_BATCH=5`, `AI_SUMMARIZE_BATCH=5`, `KG_EXTRACT_BATCH=3`.
20. **Independent retrieval audit run** (Codex blocked on org usage limit; replaced with Claude general-purpose agent). Report at `docs/handover/independent-retrieval-audit-2026-05-11.md`.

### Decisions locked (per user this session)

- **Guest mode = real product** (free tier: global research + decisions, no save). FIX-7 wires RLS integration into `/api/search`.
- **F-31 scope = full** (BM25 + vector + KG + RRF + BGE + gpt-4o-mini fallback + ⌘K palette + citation chips + observability + eval).
- **Path C (corpus expansion)** over Path A (re-crawl 50 stubs) — bigger lever, broader product surface.
- **No demo-optimizations.** Re-prioritized everything to v1 production framing.

---

## What's pending (priority order)

### Immediate (FIX bundle — ready to dispatch)

Queued at `decision-doctor-cc/.build-loop/queued/f31-recall-fixes-bundle.md`. Independent audit's leverage ranking:

| # | Fix | Files | Estimated impact | Effort |
|---|---|---|---|---|
| **FIX-1** | **BM25 OR-quorum fallback parser** | `lib/ai-knowledge/search/bm25-leg.ts` | Lifts F-12 recall@10 from 0.83 → 0.91+ ALONE | ~30 LoC, 1 hr |
| **FIX-2** | Embedding catchup CLI + cron monitor for embed-gap | `workers/src/cli/backfill-embeddings.ts` (new) | Vector leg coverage 52% → 100% | 30 min + 1-2 hr drain |
| **FIX-3** | Prepend title into embedding chunks | `workers/src/handlers/arxiv-embed.ts` | Rescues stubs without re-crawling | 1 LoC + ~$0.10 reembed |
| **FIX-4** | KG entity canonicalization migration | `drizzle/0007_*.sql` + merge CLI | Sharpens kg-leg from "entity-presence noise" to topical match | 2-3 hours |
| **FIX-5** | Re-crawl 95 stub rows | `workers/src/cli/` + CDP path | openai-news (51) + perplexity (17) + booth (27). Needs CDP for openai/booth. | ~1-2 hours |
| **FIX-6** | Paraphrased-query eval set | `tests/fixtures/f31-paraphrased-eval.json` | Capability test vs current regression-only F-12 | ~1 hour hand-labeling |
| **FIX-7** | Guest-mode RLS integration in `/api/search` | `app/api/search/route.ts` | Wire `'guest'` actor → scope='global' RLS filter | ~1 hour |

**Dispatch sequence:** FIX-1 + FIX-6 in parallel (UI), then FIX-2 + FIX-3 (backend), then FIX-4 (backend), then FIX-5 (last; smallest mover), then FIX-7 (UI). End-to-end estimated 8-10 hours of agent + Railway drain time.

### Soon (after FIX bundle lands + validates)

- **Re-run F-12 eval against expanded corpus** to measure post-fix recall@10. Stretch target 0.91 (original), audit projects achievable.
- **60-day historical expansion** queued at `.build-loop/queued/60d-backfill-expansion.md` — reframed from "buildathon prep" to "v1 production depth." Now includes B-3a (re-extract stubs) and B-3b (openai-news archive scraper, was deferred, reopened).
- **SMB query eval suite** queued at `.build-loop/queued/smb-query-eval.md` — 33 queries across 6 categories (compare tools / prompt writing / skill design / plugin design / workflow automation / decision frameworks). Includes per-query diagnostic protocol + independent KG research agent for pre-seeding + navgator:scan step.

### Deferred (real product, scope-limited)

- **OpenAI docs corpus** — sitemap returns only 1 URL. Need either custom HTML scraping or to skip until OpenAI publishes a proper docs sitemap. Tracked but no urgency — Anthropic + MCP + cross-vendor research papers cover the prompt/skill/plugin surface adequately.
- **Meta AI** — `ai.meta.com` sitemap 301-loops. Needs rediscovery.
- **BCG / Deloitte** — sitemaps return 302; resolve manually if value justifies the effort.
- **McKinsey / Bain** — gated / 403. Skip.
- **BAIR (Berkeley)** — Jekyll site, no sitemap. Could parse the archive index HTML for posts. One-off adapter.
- **F-11 citation chip integration** — chip component shipped in isolation; engine doesn't emit `[[doc:<uuid>]]` tokens yet. 4-point integration thread at `docs/handover/f31-citation-integration-gap.md`.
- **Codex re-audit** — Codex CLI was blocked on org usage limit this session. Retry next billing cycle for true second-LLM perspective.

---

## Current risks + issues

### CRITICAL (blocks v1 user experience)

**R1. F-12 recall@10 = 0.833.** Below 0.85 hard-stop. Real users hitting natural-language SMB queries get zero rows from BM25 leg on 4/7 audit queries. FIX-1 is the highest-leverage path; do not lower the threshold to make it pass.

**R2. 100% stub rate on openai-news (51/51 docs).** Cheerio selector fix doesn't apply — openai.com/index/* is SPA-rendered or has anti-bot intercept. Real users querying "what's new from OpenAI" get bad answers. FIX-5 with CDP rendering required. Same root cause: 89% stub on perplexity-research (17/19) and 38% on chicago-booth-research (27/71).

**R3. Eval set is biased.** F-12 queries are paraphrased titles; never tested real natural-language usage. F-12 passing != product working for real users. FIX-6 (paraphrased eval set) closes this gap. Treat F-12 as a regression guard, not a capability test.

### IMPORTANT (degrades quality, not blocking)

**R4. ~47% unembedded corpus** at audit time. Embedding worker fell behind during the backfill. Likely improved post-drain; need to verify via FIX-2 catchup CLI. Vector leg is dark for any doc not yet embedded.

**R5. 285 duplicate KG entities.** `Claude / ClaudeAPI / claude.ai / Claude 3.5` etc. all separate rows. Fragments kg-leg recall; top hits become generic "Features overview" docs instead of topical matches. FIX-4.

**R6. Embedding chunks don't include title.** Stub-body docs are unrecoverable in vector leg even though title would suffice. 1 LoC fix; ship FIX-3.

### MINOR (cleanup / preventive)

**R7. `workers/.env` has parse error at line 7** (contains `&`). Breaks bash `source` but not Node consumers. Cosmetic; doesn't affect production. Worth a one-time clean.

**R8. F-7 BGE deployment verification needed.** Railway redeployed at `0a4f6c9` with BGE server in `workers/src/rerank/bge-server.ts`. `/health` should show `bge.loaded: true` after first warm `/rerank` call. If not, gpt-4o-mini fallback is the live path (which works — but BGE quality is materially better; verify before declaring F-31 closed).

**R9. `pnpm lint` script broken** since Next.js 16 removed `next lint`. Don't gate on it. Swap to `eslint .` in a separate trivial PR.

**R10. Local-only `.build-loop/memory/`** is gitignored. Memory entries don't sync between machines or other developers. Global memory at `~/.build-loop/memory/` is single-user-local. Patterns worth promoting to project docs eventually.

**R11. Working-tree dirt** on UI worktree: `next-env.d.ts` (regenerated by Next.js, safe), `.env.local.bak` (user's parallel session backup, harmless), `tests/e2e/findings/*.json` (transient test output, runtime-regenerated). Not pushed; not blocking. Can be reset or committed at user's discretion.

**R12. Auth-guest WIP files** were stashed and popped during the merge. Confirmed they're now part of the `9babc57 feat(auth): guest mode` commit + the `68b2c7c feat(intake): guest recommendations` commit; both pushed via the merged-to-main flow. Working-tree modifications on top of those commits remain — your continuing work.

### Non-issues (resolved this session, noting for history)

- ~~Codex audit blocked on usage limit~~ → replaced with Claude general-purpose agent; full report delivered.
- ~~Backfill timing~~ → drained via Railway + local worker stacking; queue at 0.
- ~~`pg_search` deprecated on Neon~~ → tsvector + GIN pivot shipped (F-1).
- ~~Drizzle `${arr}::uuid[]` silent failure~~ → caught + fixed in 2 sites; canonical pattern documented.

---

## Worktree state

```
UI (decision-doctor-cc, main @ 0a4f6c9):
  Working tree:
    M next-env.d.ts                            (Next.js regenerated; safe)
    M tests/e2e/findings/*.json                (transient test output)
    ?? .env.local.bak                          (user's backup)

Backend (decision-doctor-cc-backend, corpus-pipeline @ 483a36b):
  Working tree: clean
  Pushed to origin

Both worktrees: scripts/check-integration.sh present; exit ≤ 1 confirmed.
```

---

## Pickup commands for the next terminal

```bash
# Sync
cd ~/dev/git-folder/decision-doctor-cc && git fetch origin && git pull --ff-only origin main
cd ~/dev/git-folder/decision-doctor-cc-backend && git fetch origin && git pull --ff-only origin corpus-pipeline

# Read this doc + the audit + the queued fix bundle
cat docs/handover/2026-05-11-evening-handoff.md
cat docs/handover/independent-retrieval-audit-2026-05-11.md
cat .build-loop/queued/f31-recall-fixes-bundle.md

# Verify Railway BGE is live (warm-flip):
curl -s https://decision-doctor-workers-production.up.railway.app/health | jq '.bge'
# If bge: null, send one warm rerank call:
curl -X POST https://decision-doctor-workers-production.up.railway.app/rerank \
  -H 'content-type: application/json' \
  -d '{"query":"warm","documents":[{"id":"a","text":"warm test"}],"topK":1}' | jq .
# Then re-check /health.

# Pre-FIX validation snapshot:
DB_URL=$(grep "^DATABASE_URL_UNPOOLED=" ~/dev/git-folder/decision-doctor-cc-backend/workers/.env | cut -d= -f2- | tr -d '"')
psql "$DB_URL" -c "
SELECT
  (SELECT count(*) FROM corpus_documents) AS docs,
  (SELECT count(DISTINCT document_id) FROM corpus_embeddings) AS embedded,
  (SELECT count(*) FROM corpus_documents WHERE length(body) < 200) AS stubs,
  (SELECT count(*) FROM ai_entities) AS entities;
"

# Re-run F-12 to get current recall@10 baseline:
cd ~/dev/git-folder/decision-doctor-cc && pnpm test -- f31-hybrid-search

# Then dispatch FIX-1 first (highest leverage). See queued plan for prompt template.
```

---

## Authoritative external docs

- Railway: https://docs.railway.com/build-deploy, https://docs.railway.com/private-networking, https://docs.railway.com/reference/healthchecks
- Transformers.js: https://huggingface.co/docs/transformers.js/installation
- pgvector HNSW: https://github.com/pgvector/pgvector#hnsw
- Postgres FTS ranking: https://www.postgresql.org/docs/16/textsearch-controls.html
- Library docs (drizzle, paradedb fallback, openai SDK) → Context7 MCP at code-time

---

## Secrets

`/Users/tyroneross/dev/git-folder/decision-doctor-cc/git ignore/dd-secrets.rtf` (gitignored). Contains: Railway project token (`RAILWAY_TOKEN`), OpenAI API key, Groq API key, project IDs. Never echo into transcripts; never commit. The Railway CLI works with `RAILWAY_TOKEN=… railway <command> --service <name>` (no `railway login` needed).

---

## Cost summary

| Bucket | This session | Notes |
|---|---:|---|
| Groq (ai-summarize + kg-extract) | ~$21.60 | 1,395 new doc enrichments |
| OpenAI (embeddings + fallback rerank) | ~$1 | Embedding for new docs + a few /api/search fallback calls |
| Railway compute | ~$0 (within free tier) | Worker concurrency bumps don't change billed minutes |
| Neon storage | within free tier | ~50 MB current footprint; plenty of headroom |
| **Total session** | **~$25** | |
| Estimated FIX bundle (next session) | ~$1-2 | Re-embed for FIX-3, re-crawl stubs for FIX-5 |
