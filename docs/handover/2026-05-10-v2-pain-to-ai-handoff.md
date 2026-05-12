# V2 Pain-to-AI-Recommendation — Session Handoff

**Date:** 2026-05-10
**Branch:** `v2-pain-to-ai-recommendation` at `e0eaf19`
**Worktree:** `~/dev/git-folder/decision-doctor-cc` (single worktree — consolidated from the prior backend split)
**Status:** V2 UI structurally complete · ⏸ release-gated on B1 (corpus extraction fix)

---

## TL;DR

We shipped 16 commits of V2 UI on a feature branch. 327/327 V2 tests pass. `pnpm typecheck` clean. **DO NOT merge to main or apply DB migrations yet** — corpus has poisoned data that would make Q&A surface return garbage citations. The right next step is the B1 backend extraction fix (plan in §"What's next"), then `pnpm db:push`, then library seed, then final IBR.

---

## Where am I?

```bash
cd ~/dev/git-folder/decision-doctor-cc
git branch --show-current   # → v2-pain-to-ai-recommendation
git log --oneline -1        # → e0eaf19 chore(v2-U5): rename /app/decisions → /app/history…
git status                  # → clean (or only .build-loop/* untracked)
git worktree list           # → ONE worktree only (backend retired this session)
```

The backend worktree (`~/dev/git-folder/decision-doctor-cc-backend`) was removed for simplicity. All branches still available from this one worktree, including `corpus-pipeline` for B1 work.

---

## What was the goal?

Decision Doctor V2 P0 — reposition from "decision-template tool" to "AI deployment strategist" for solo healthcare practitioners. First user-visible outcome becomes one specific `AiTaskRecommendation` with a starter solution, plus a conversational Q&A surface ("Ask anything about AI tools/adoption") with grounded citations.

Source docs (all in repo, all tracked):
- `docs/product/PRD-v2-pain-to-ai-recommendation.md`
- `docs/ux/pain-to-ai-user-journey-and-deltas.md`
- `docs/architecture/pain-to-ai-recommendation-architecture.md`
- `docs/AI Plugin Architecture  Skills, Scripts, Hooks, MCP Servers & Scaffolding.md` (quality rubric for promoted artifacts)

---

## What's shipped (16 commits on `v2-pain-to-ai-recommendation`)

```
e0eaf19 chore(v2-U5): rename /app/decisions → /app/history + NoPhiNotice sweep    [66 tests]
4d8b39f feat(v2-L3-seeder): scripts/seed-library.ts + package.json wires          [21 tests]
e129de6 feat(v2-U2): recommendation pages + RecommendationView                    [19 tests]
b137bba feat(v2-E3): recommendations table + /api/recommendations route           [10 tests]
c5e29e6 feat(v2-Q1): AI-adoption conversational Q&A surface (SSE streaming)        [43 tests]
3c642ba feat(v2-U4): AdoptionPathwayPicker + builder bridges + quality gate       [18 tests]
06fc60f feat(v2-U3): /app/library — universal search + Only-my-content toggle     [35 tests]
aa69365 feat(v2-S1): PHI guard + rate-limit/audit + library leg + citation tokens [35 tests]
451a37c feat(v2-U1): hybrid first screen — composer + 6 pain cards                [ 9 tests]
aaf6090 feat(v2-E2): pain-path classifier + 9-criteria scoring                    [22 tests]
adf3151 feat(ui): PillSearchBar multiline + chat bubble paragraph rendering       [21 tests]
eb72b7f feat(v2-L2): library retrieval + 7 API routes + universal search          [18 tests]
78b637f feat(v2-L3-content): 25 use cases + 15 prompts (healthcare wedge)         [— content only]
c33e51e feat(v2-E1): Stage 8 promotion classifier + runRecommendation peer        [10 tests]
23a263a feat(v2-L1): library_* tables + scope-based RLS + isolation tests         [ 6 tests]
76a79ba docs(v2): pain-to-AI-recommendation architecture + user journey
```

113 files changed, +19,060 / -183 lines, 327 V2 tests green.

### What's live (structurally)

| Surface | Auth | Notes |
|---|---|---|
| `/app` (home) | required | Hybrid first screen: multiline composer + 6 pain cards + library/Q&A links |
| `/app/library` | guest-OK | Universal search fan-out (library + corpus) + "Only my content" toggle |
| `/app/ask` | guest-OK | Conversational Q&A surface with SSE streaming + citations |
| `/app/skills` | required | Promoted-artifacts catalog (skills + plugins) — was a stub, now real |
| `/app/recommendations/new` | guest-OK | Pain-path intake (≤5 ClarifierChips questions) |
| `/app/recommendations/[id]` | required | 6-tier RecommendationView with AdoptionPathwayPicker mounted |
| `/app/recommendations/guest-preview` | none | sessionStorage-backed one-shot guest view |
| `/app/history/*` | required | Renamed from `/app/decisions/*`, permanent redirect via `next.config.ts` |
| `/api/recommendations` | guest-allowed POST | Mirrors `/api/decisions` 68b2c7c guest pattern |
| `/api/ai-adoption-qa` | guest-allowed POST | SSE stream, PHI-gated, rate-limited |
| `/api/library/{use-cases,prompts,skills,plugins,search,save,promote}` | mixed | All `runtime='nodejs'`, RLS via runWithActor |

---

## Critical blocker: corpus is poisoned (B1 must land first)

**Codex audit (2026-05-10) hitting the live Neon DB** found:

- All `openai-news` rows = 58-char stubs `"Verification successful. Waiting for openai.com to respond"` (Cloudflare CAPTCHA text treated as successful extraction).
- Perplexity research: 17/19 docs under 200 chars (title/subtitle only, real article body missing).
- Anthropic docs: at least one row contains only `"Loading..."`.
- Chicago Booth: 27/71 rows are FlippingBook viewer shells, not articles.
- Publication dates often wrong (sitemap-adapter uses `lastmod` as `published_at`).
- 706/1479 docs at one point had NO embeddings — `embed-document` queue fell behind ingestion.

**Why this gates V2 release:** Q1's synthesizer grounds answers in retrieved corpus content. If we ship V2 against the current corpus, users see beautiful UI returning grounded-looking answers built from CAPTCHA text. Worst kind of bug — looks correct, isn't.

### B1 plan (backend extraction fix)

Lives on `corpus-pipeline` branch — `git checkout corpus-pipeline` from this worktree when ready.

| Phase | File | Fix |
|---|---|---|
| B1.1 | `workers/src/adapters/content-extract.ts:~117` | Reject body < 200 chars OR matching stub patterns. Currently any non-empty result = success. |
| B1.1 | `workers/src/adapters/rss.ts:~165` | When initial title/desc extract fails, mark body=NULL not the title; queue retry via CDP. |
| B1.1 | `workers/src/adapters/sitemap-adapter.ts:~518` | Derive `published_at` from `<meta property="article:published_time">` or `<time datetime>`, only fall back to `lastmod` last and tag `published_at_source`. |
| B1.1 | `workers/src/adapters/kg-extract.ts:~177` | Gate KG extraction on `body IS NOT NULL AND length(body) >= 200`. |
| B1.2 | New migration `drizzle/0009_corpus_quarantine.sql` | Add `quarantined boolean`, `quarantine_reason text` columns to `corpus_documents`. Sweep CLI marks existing poisoned rows. |
| B1.3 | New flag on `workers/src/cli/enqueue-content-extract.ts` | `--requeue-quarantined --source <name>` |
| B1.4 | (auto-cascade) | Re-extract triggers re-embed + re-KG via existing pg-boss wiring |
| B1.5 | `workers/src/cli/validate-corpus.ts` (commit `96121e7`) | Run `--strict`: zero stubs, ≤5% degraded per source. Exit 0 = V2 can ship. |

**Estimate:** ~6 hours of focused work for B1.1 + B1.2; re-extract sweep with parallelism is ~30-60 min wall-clock.

### Railway scaling for fast re-seed

User indicated willingness to pay more for speed. The fastest path:

1. Bump `BATCH_SIZE` env var for `embed-document` and `kg-extract` workers (free, 2-3× throughput).
2. Spin up a temporary burst pool: 4× `content-extract` worker replicas on Railway (~$5-20 for the burst window).
3. Run B1.3 enqueue CLIs in sequence per source.
4. Monitor `pg-boss` queue depth: `SELECT name, count(*) FROM pgboss.job WHERE state='active' GROUP BY name;`.
5. Tear down burst pool after drain. Restore default `BATCH_SIZE`.

Estimated wall-clock: 30-60 min for ~200 affected docs at 4× concurrency vs ~3-6 hours single-pod.

---

## Memory — project-local (read on next build-loop invocation)

All at `~/dev/git-folder/decision-doctor-cc/.build-loop/memory/` (gitignored).

### Architectural decisions (relevant to V2)

- **`decision_engine_gated_promotion.md`** — promotion is engine-gated; Stage 8 emits typed `AdoptionPathway`; picker filters `state !== "not-recommended"`; NO `/app/builders` page; NO generic builder hub. Server-side bridges only.
- **`decision_clarifier_engine_typed.md`** — clarifier types live in `lib/engine/clarifier.ts` (engine-owned discriminated union). Pain-path intake reuses `ClarifierChips` from here, NOT from widget types.
- **`decision_theme_AB_values.md`** — A (Case File) / B (Conversation) / F (Terracotta) theme tokens via `data-theme` attribute.
- **`decision_bge_timeout_3s.md`** — BGE rerank client timeout = 3s (cold-start safe), 5s comfortable.
- **`decision_kg_leg_expansion_depth.md`** — KG leg expands 1-hop, not multi-hop; multi-hop explodes recall noise.
- **`decision_skillpanel_collapse_mechanism.md`** — F3 desktop right panel collapse via `?panel=collapsed` query param (SSR-safe), not localStorage.

### V2 patterns shipped this session

- **`v2_p0_shipped_summary.md`** — full commit history + open items (this is the canonical V2 progress doc).
- **`v2_universal_search_with_user_toggle.md`** — universal fan-out + "Only my content" toggle; OR-quorum tsquery fallback per hardening 9c.
- **`v2_pillsearchbar_multiline.md`** — multiline composer primitive; Enter submits / Shift+Enter newline; auto-grow 1-8 lines.
- **`v2_sse_streaming_pattern.md`** — first SSE route in codebase; reusable `createSSEResponse` from `lib/qa/stream.ts`; emit `[[doc:<uuid>]]` citation tokens.
- **`v2_server_side_builder_bridges.md`** — Option (a) re-implementation of prompt-builder / skill-builder / agent-builder server-side in `lib/builders/`; quality-gate validates against AI Plugin Architecture rubric.

### General patterns

- **`pattern_hnsw_ef_search_verified.md`** — `SET LOCAL hnsw.ef_search = 100;` in vector-leg transactions for recall.
- **`pattern_tsvector_rank_query.md`** — `websearch_to_tsquery` + `ts_rank_cd` baseline; OR-quorum fallback when strict returns < N.
- **`pattern_rrf_k_tuning.md`** — RRF k=60 default.
- **`pattern_recall_at_10_measurement.md`** — eval methodology; paraphrased eval set to catch parser bugs.
- **`pattern_ink_only_reskin.md`** — V1 C1-C12 ink-only re-skin discipline; theme-token only, no per-pain colors.

### Lessons

- **`lesson_railway_node_import_tsx.md`** — Railway pg-boss workers need explicit `tsx` runner; `node --experimental-strip-types` not reliable on Railway.

### Global memory (read across all projects)

- **`~/.build-loop/memory/pattern_hybrid_search_hardening_checklist.md`** — 13-item checklist (HNSW ef_search, BM25 extension, observability INSERT, OR-quorum fallback, paraphrased eval set, prepend title to embedding, embedding-queue backpressure monitoring, etc.). Applied items 2a/3/7/9c/9d/9f/12 in V2.

---

## Investigations done this session

1. **Architecture-scout baseline + Q&A subgraph** (background agent at start of V2 build) — mapped all layers, found 2 hard-stops + 3 important gaps for Q&A.
2. **Codex audit of live corpus** (user-run, via Codex tool — note: Codex IS hitting the live Neon DB directly for these audits) — found the stub poisoning described above. Read-only investigation; no DB or code changes made.
3. **PillSearchBar multi-paragraph capability** — discovered single-line `<input>` was the gap; shipped multiline at `adf3151`.
4. **Dev server smoke** — `http://localhost:3001` was already running (PID 2285 pre-existing); V2 routes return 307 (auth redirect, expected), framework-level healthy.
5. **Working tree post-Q2-Q-kill** — verified `lib/corpus-quality.ts` was the only partial artifact, removed; no orphan files.

---

## External integrations / where the data lives

| System | Location | Purpose | Auth |
|---|---|---|---|
| **Neon Postgres** | shared dev DB; `DATABASE_URL` in `.env.local` | All app data: users, decisions, recommendations (new in E3), library_* (new in L1), corpus_documents, ai_entities, audit_events | `app_user` (RLS-scoped) for routes, `neondb_owner` for migrations + workers |
| **Railway** | pg-boss workers + Chromium CDP for content-extract | Crawler + corpus ingestion + KG extraction + embeddings | Railway service token |
| **Groq** | LLM provider | Engine stages, Q&A synthesis, builder bridges, KG extraction | env: `GROQ_API_KEY` |
| **OpenAI** | embeddings + GPT-4o-mini rerank fallback | F-31 hybrid search | env: `OPENAI_API_KEY` |
| **BGE reranker** | hosted on a Railway worker | Cross-encoder rerank for search top-K | internal RPC |
| **Upstash Redis** | rate limit (sliding window, 20/24h) | `/api/decisions`, `/api/chat`, `/api/ai-adoption-qa` (Q1), `/api/search` (S1) | env: Upstash creds |
| **Better Auth** | session + magic-link auth | All auth-gated routes | configured in `lib/auth.ts` |
| **Vercel** | Next.js hosting | UI + API routes (NOT workers — those are Railway) | linked to `main` branch |

**Codex investigation note:** Codex tool when invoked for corpus audits operates against the live Neon DB read-only. Findings are sound and should be trusted. The 2026-05-10 audit is canonical for the current corpus state.

---

## Open items (ordered by what unblocks what)

| # | Item | Blocked by | Severity |
|---|---|---|---|
| 1 | **B1 — corpus extraction fix** | nothing (start anytime) | 🔴 release-blocker for V2 |
| 2 | **pnpm db:push** (applies 0007 + 0008) | user consent (shared Neon) | 🟡 needed for any V2 testing |
| 3 | **pnpm run library:seed** | step 2 | 🟡 library page is empty without it |
| 4 | **Clinical-advisor review of L3-content** | out-of-band human | 🟡 flag-only, doesn't block ship |
| 5 | **Final IBR scan** | steps 2-3 | 🟢 pre-merge verification |
| 6 | **Cherry-pick `adf3151` to main** | user decision | 🟢 standalone V1 win, low-risk |
| 7 | **V2 → main merge or PR** | items 1-5 | 🟢 final ship |

### L3-content clinician-review flags

Three entries surfaced concerns; pause before promoting to published:
1. `prompts-admin.ts` — prior-auth letter draft (medium-risk; payer-specific medical-necessity language)
2. `prompts-research.ts` — research guideline orientation (verify stays in "questions to explore", not guidance)
3. `use-cases-follow_up.ts` — referral tracking checklist (`riskLevel: "medium"`; care-continuity language)

---

## Potential concerns / sharp edges

1. **F-31 file-name collision risk on main.** Backend's `corpus-pipeline` branch may create files at paths like `lib/ai-knowledge/**`, `app/api/search/route.ts`, `components/ui/CommandPalette.tsx`, `components/chat/CitationChip.tsx`. V2 already touched some of these (S1 modified `app/api/search/route.ts`). When merging V2 + corpus-pipeline + main, expect manageable conflicts in those files — not blockers.

2. **`decisions` table fallback in Q1 personalizer.** `lib/qa/personalizer.ts` reads from `decisions` table as fallback when `recommendations` is empty. Once seeded users have recommendations, personalization activates. The mapping `decisionType` → `pain_path` approximation is heuristic; revisit if quality is off.

3. **Stage 8 + pain-path + retrieval + scoring + synthesis = ~12-15s end-to-end.** U2's `NewRecommendationClient` has a 4-stage progress indicator. Q1 uses SSE so first token appears in ~500ms. Both UX-mitigated, but the underlying cost is real.

4. **Audit on guest searches skipped due to tenant FK.** `audit_events.tenant_id` is NOT NULL with FK to `tenants`; guest synthetic UUIDs don't have tenant rows. `ai_search_queries` (no tenant FK) captures all callers including guests. Documented in S1's commit notes.

5. **Library hits surface `source_url: ""`.** Library tables have no `source_url` column. `CitationChip` won't render for empty URLs — `kind` field distinguishes them. Q1's `CitationList` should branch on kind.

6. **L1 RLS isolation tests need migration to be applied.** `tests/rls-library.test.ts` has 6 failures today because library tables don't exist in the test DB. They'll pass once `pnpm db:push` runs.

7. **The `decisions` table column rename gotcha (E1 → L2).** E1 named the engine's scoring type `Criterion`; that collided with a pre-existing union type in templates. L2's agent renamed to `CriterionDef` and updated callers. Structural rename, no logic change. Documented in L2 commit notes.

8. **Stash from prior session.** `stash@{0}` contains corpus-pipeline test/doc deltas from a previous session ("pre-v2-pain-to-ai dispatch"). Apply when you next check out `corpus-pipeline` if relevant: `git stash pop`.

9. **`pnpm lint` is broken.** Next.js 16 removed `next lint`. Held per project memory. Don't block on this; swap the script to `eslint .` in a separate PR when convenient.

10. **Known flaky tests (not regressions).** `tests/engine.test.ts` and `tests/e2e/run-personas.test.ts` intermittently fail with `json_validate_failed` against live Groq. Skip these in V2 test sweeps.

---

## What's next — recommended sequence

```bash
# Option A: Ship V2 fast (parallel B1 + V2 finalize)
# 1. From this terminal, switch to corpus-pipeline for B1
git checkout corpus-pipeline
git stash pop  # apply prior session's test/doc deltas if relevant
# 2. Dispatch B1 work (see B1 plan above). User decides Railway scaling.
# 3. While B1 ships in parallel, on a new shell (or after B1 lands):
git checkout v2-pain-to-ai-recommendation
pnpm db:push                          # applies 0007 + 0008 (idempotent)
pnpm run library:seed                 # 25 use cases + 15 prompts (idempotent)
pnpm dev                              # start dev server fresh
# 4. After B1.5 validate-corpus exits 0, run final IBR scan
# 5. Surface push/merge decision

# Option B: Land the multiline primitive on main first as a quick win
git checkout main
git cherry-pick adf3151               # PillSearchBar multiline + bubble pre-wrap
git push                              # only with explicit user consent
git checkout v2-pain-to-ai-recommendation
# Then continue with Option A
```

### Commands you'll run a lot

```bash
# Status snapshot
git log --oneline main..v2-pain-to-ai-recommendation | wc -l   # commits on V2 branch
git diff --stat main...v2-pain-to-ai-recommendation | tail -1  # files + lines
git status --short
pnpm typecheck

# Focused V2 test sweep (~1.1s)
pnpm vitest run \
  tests/component-state.test.ts tests/pain-cards.test.ts tests/library-page.test.ts \
  tests/library-search.test.ts tests/engine-stage8.test.ts tests/engine-pain-path.test.ts \
  tests/api-recommendations.test.ts tests/qa-route.test.ts tests/qa-grounding.test.ts \
  tests/qa-phi-guard-integration.test.ts tests/phi-guard.test.ts \
  tests/citation-token-emission.test.ts tests/search-rate-limit.test.ts \
  tests/search-library-leg.test.ts tests/recommendation-view.test.ts \
  tests/baseline-capture.test.ts tests/builders-quality-gate.test.ts \
  tests/api-library-promote.test.ts tests/library-seeder-smoke.test.ts \
  tests/v2-routes-smoke.test.ts

# Apply V2 migrations + seed (requires user consent — shared Neon)
pnpm db:push
pnpm run library:seed:dry             # validates seed files first
pnpm run library:seed                 # upserts 25 use cases + 15 prompts (idempotent)

# Validate corpus after B1 lands
pnpm exec tsx workers/src/cli/validate-corpus.ts --strict

# Dev server
pnpm dev                              # localhost:3001 if 3000 in use
```

---

## TaskList state (durable across sessions if you use TaskList API)

Pending:
- #8 L3-seeder — Apply L1 migration + seed global library rows (BLOCKED on user db:push consent)
- #15 B1 — Corpus extraction fix (BLOCKED on user direction + Railway scaling pick)
- #18 Cherry-pick adf3151 (multiline primitive) to main
- #19 Final IBR scan on authed session
- #20 V2 → main merge or PR

Completed: 13 chunks (L1, E1, L3-content, L2, E2, S1, E3, U1, U3, U4, Q1, U2, L3-seeder script, U5, plus multiline primitive bonus).

---

## If you're a fresh Claude session reading this

1. `cd ~/dev/git-folder/decision-doctor-cc && git log --oneline -5` to confirm where the branch is.
2. Read `.build-loop/memory/v2_p0_shipped_summary.md` for the canonical chunk-by-chunk summary.
3. Read this handoff (you're doing it).
4. Read the Codex audit findings in this doc's "Critical blocker" section.
5. Ask the user: B1 first or merge multiline cherry-pick first?
6. Once a direction is picked, dispatch the build-orchestrator or implementer subagents per the B1 plan or the cherry-pick plan.
7. Don't run `pnpm db:push` without explicit user consent — shared Neon dev DB.
8. Don't push or merge to main without explicit user consent.

---

## Contact lines for human action

- **Clinical-advisor review** — 3 L3-content entries flagged. Find owner. Out-of-band.
- **Railway burst pool** — needs Railway dashboard / CLI access. ~$5-20 for the B1.3 re-extract sweep.
- **Neon DB** — `pnpm db:push` mutates schema. Confirm CI / Vercel preview will tolerate the additions (additive only — `CREATE TABLE IF NOT EXISTS` everywhere).
