# F-31 recall@10 — escalation

**Date:** 2026-05-11
**Status:** ❓ Held — user decision required.

## Measured state

F-31 pipeline (F-3..F-11) is shipped on `main`. F-12 eval measures recall@10 = **0.817** (fusion-only) / **0.833** (fusion + gpt-4o-mini rerank with title-prefixed bodies). Target: 0.91. Hard-stop floor from the dispatch brief: 0.85. **We are below the hard-stop.**

## Why

Direct probe (see `.build-loop/memory/pattern_recall_at_10_measurement.md` for the SQL):

50 of 121 corpus documents — every `openai-news` row — have body = `"Verification successful. Waiting for openai.com to respond"` (58 chars). This is the CDP loader placeholder, captured before the crawler waited for JavaScript to hydrate the article body.

The corpus_embeddings rows for those documents were computed over the 58-char placeholder. Embeddings carry no semantic signal beyond that stub. So vector retrieval fails on every query whose target doc is in that 41% slice of the corpus.

The retrieval pipeline (lexical + vector + KG + RRF + rerank) is working as designed. The bottleneck is upstream: a content extraction bug in the Railway crawler.

**This was misdiagnosed in the original F-31 dispatch brief** as a "tsvector vs paradedb" decision. tsvector vs paradedb does not change the embedding inputs. Even paradedb's BM25 wouldn't move recall above 0.82 here because vector retrieval is the bigger contributor and it's the one starved of signal.

## Two paths forward

| Option | Effort | Yields | Risks |
|---|---|---|---|
| **A. Fix the corpus** (re-crawl OpenAI docs with CDP rendering, then re-embed) | Backend (workers/) — ~1-2 days. Outside F-31 UI scope. | Recall@10 should jump to ≥0.91 since the missed docs are slam-dunk semantic matches when their bodies are real text. | Crawler may need a Railway CDP/Chromium image rebuild. Render-fallback budget already debated in CLAUDE.md ("Do not add Chromium through nix"). |
| **B. Lower the F-12 threshold to 0.80** | Test-config change — 1 LoC. | Ship F-31 as functional today; revisit the threshold after corpus fix lands. | Less strict ceiling on the eval; future recall regressions less visible. Mitigated by keeping the fusion-only diagnostic and the per-query log in place. |

## Recommendation

**Path A** — the corpus fix is the real bug, and path B locks in a stale ceiling. But A is backend work and isn't part of this dispatch's hard-stop budget. **If A is out of scope right now, go with B and re-raise the threshold after the crawler fix.**

## How to take Path B (1 LoC, no code change)

The F-12 test reads `RECALL_TARGET` from the env, defaulting to 0.91. To dial it down to 0.80 for CI without touching code:

```bash
RECALL_TARGET=0.80 pnpm vitest run tests/f31-hybrid-search.test.ts
```

Or commit the env override via `vitest.config.ts`:

```ts
process.env.RECALL_TARGET = process.env.RECALL_TARGET ?? "0.80";
```

(Not committed by default — opt-in.)

## Status as of this commit

- F-3..F-11: all shipped, all green (typecheck, build, RRF unit tests).
- F-12: deferred-fallback assertion ✅ passes (degraded_reason='bge_timeout' verified). Recall@10 assertion ❓ fails at 0.833 < 0.91 — pending the corpus-fix decision above.
- /api/search route: live + auth-gated (smoke = 401 unauthed as expected).
