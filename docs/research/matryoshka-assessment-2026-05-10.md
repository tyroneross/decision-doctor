# Matryoshka embedding approach — assessment vs current plan

**Date:** 2026-05-10
**Type:** Evaluation + deep dive
**Question:** Is there a Matryoshka-based embedding approach that beats DD's current plan (OpenAI `text-embedding-3-small` at 768 dims via the native `dimensions:` parameter)?
**Verdict:** ✅ **No change recommended.** Current plan is already Matryoshka and optimally calibrated for DD's MVP profile (English-mostly AI-research corpus, solo practitioner, single-vendor preference, no GPU infra).
**Confidence:** ✅ Verified — 2+ T1/T2 sources across HF blog, MTEB leaderboards, and 2026 production-RAG comparisons.

---

## TL;DR

ADR-007 already uses Matryoshka Representation Learning via OpenAI's `dimensions: 768` API parameter. Switching to alternative MRL models (`text-embedding-3-large`, `jina-embeddings-v3`, `nomic-embed-v1.5`, `bge-m3`) doesn't pay off at DD's current scale. Documented triggers for a future swap captured below.

**Critical clarification on the arXiv paper user shared:** [arXiv 2503.17547](https://arxiv.org/html/2503.17547v1) is about **Matryoshka Sparse Autoencoders** for *mechanistic interpretability of LLM internals* — not retrieval embeddings. The "Matryoshka" name is reused for a different technique (nested dictionary sizes in SAEs vs nested embedding dimensions in dense retrieval). **Not applicable to DD's retrieval pipeline.**

---

## What Matryoshka Representation Learning actually is

Per the [HuggingFace blog](https://huggingface.co/blog/matryoshka):

- Training loss is computed at **multiple dimensionalities simultaneously** (e.g., 768, 512, 256, 128, 64) and summed
- Forces the model to "frontload" semantically important information into the *first* N dimensions
- Result: truncating an MRL embedding from 768 → 256 → 64 preserves quality far better than truncating a non-MRL embedding
- HF benchmark: `tomaarsen/mpnet-base-nli-matryoshka` retains **98.37% of full-dim quality at 8.3% of original dimensions (64D)** on STSBenchmark

OpenAI's `text-embedding-3-small` and `text-embedding-3-large` use this technique natively (confirmed in OpenAI's docs + the [Pinecone embeddings v3 blog](https://www.pinecone.io/learn/openai-embeddings-v3/)). **Passing `dimensions: 768` to the API IS Matryoshka truncation** — same outcome as post-hoc truncation but with built-in normalization.

---

## Production-relevant alternatives (2026)

| Option | Provider | MTEB | $/M tok | Multilingual | Storage @ same dims | DD fit |
|---|---|---|---|---|---|---|
| **`text-embedding-3-small` @ 768 (current)** | OpenAI | 62.3 | **$0.02** | weak | 3 KB/vector | ✅ **stay** |
| `text-embedding-3-large` @ 1024 | OpenAI | 64.6 | $0.13 (6.5×) | weak | 4 KB/vector | ⚠️ +2.3 MTEB for 6.5× cost |
| `text-embedding-3-large` @ 256 | OpenAI | ~63 | $0.13 | weak | 1 KB/vector | ⚠️ same cost, smaller storage |
| `jina-embeddings-v3` @ 1024 → 32 | Jina | ~62 | $0.02 | **89+ langs**, 8192 ctx | configurable | ⚠️ matches cost; multilingual edge |
| `nomic-embed-text-v1.5` @ 768 (MRL) | open / self-host | ~62.4 | $0 (compute) | weak | 3 KB/vector | ⚠️ needs GPU on Railway |
| `bge-m3` (hybrid dense+sparse) | open / self-host | strong | $0 (compute) | multilingual | varies | ⚠️ needs Python + GPU service |
| `tomaarsen/mpnet-base-nli-matryoshka` | open / self-host | mid | $0 | weak | 3 KB/vector | ⚠️ research-grade, not production |

Storage math: OpenAI embeddings stored as 4-byte floats × N dims. At 768 dims = 3 KB/vector; at 1024 = 4 KB; at 256 = 1 KB.

---

## Why current plan wins for DD specifically

1. **Already Matryoshka.** OpenAI's `dimensions: 768` parameter IS MRL truncation. The storage benefit (50% cut from 1536 default) is already captured.
2. **English-mostly corpus.** AI research is dominantly English; `jina-v3`'s multilingual edge doesn't pay off until DD targets non-English practitioners (a v2+ concern).
3. **Cost-sensitive MVP.** `text-embedding-3-small` at $0.02/M is the cheapest commercial option. `text-embedding-3-large` costs **6.5× more** for ~2.3 MTEB points — not justified at MVP scale (~$1/mo embedding spend → ~$6.50/mo).
4. **No GPU infra.** Self-hosted options (`nomic-embed-v1.5`, `bge-m3`, `mpnet-base-nli-matryoshka`) require running ML inference on Railway. That adds a Python service + GPU compute we don't currently pay for. The crossover where self-hosting beats API cost is ~5M tokens/day, well above DD's projected MVP volume.
5. **Already in stack.** Single-vendor discipline. OpenAI is already wired for embeddings (commit `c06382e`) + already has Atomize AI provenance in the user's experience.
6. **Schema already locked.** `corpus_embeddings.embedding vector(768)` + HNSW index `m=16, ef_construction=200` are on Neon (commit `5ca7be2`). Changing dims requires a re-embed of the entire corpus (one-time cost: ~$0.10 at 50K vectors, plus 2h of ingest time).
7. **`lib/embeddings.ts` is already swap-ready.** Model + dims are environment-configurable via `EMBED_MODEL` and `EMBED_DIMS` constants. A future swap is a 2-line change + a re-embed job.

---

## Triggers for revisiting (future ADR-007 revision)

Document these as switch-conditions so a future change is principled, not reactive:

1. **Quality plateau.** F-31's 20-query eval set returns <80% recall@10 across multiple categories → try `text-embedding-3-large @ 1024` (one env var change, cost increases 6.5×). Re-run eval; if recall@10 ≥ 85%, consider keeping.
2. **Non-English corpora become important.** Spanish-speaking practitioners, foreign-language research adapters → switch to `jina-embeddings-v3` ($0.02/M, 89+ langs).
3. **Embedding API cost exceeds compute cost** for the same operations. Threshold: >5M tokens/day ingest sustained (very large corpus expansion). → Evaluate `bge-m3` self-host on Railway with GPU.
4. **KG canonicalization fails on multilingual entities.** Foreign labs (e.g., DeepSeek, Moonshot, Qwen) where names appear in mixed scripts → multilingual model.
5. **Cohere v5 embeddings GA** with substantially better MTEB at competitive price (currently Cohere embed-v4 is competitive but not dominant).
6. **OpenAI deprecates `text-embedding-3-small`.** Forced migration → revisit landscape; likely target is whatever OpenAI ships next (text-embedding-4?) or `text-embedding-3-large`.

None of these are imminent. **Re-evaluate annually** or when any of the above fires.

---

## What the user shared that didn't apply

The [arXiv 2503.17547 paper](https://arxiv.org/html/2503.17547v1) (Bussmann, Nabeshima, Karvonen, Nanda — "Learning Multi-Level Features with Matryoshka Sparse Autoencoders," March 2025) is research on **Sparse Autoencoders for mechanistic interpretability** — finding interpretable features inside LLM activations. Their headline result (0.05 feature absorption vs 0.49 for BatchTopK baselines at L0=40) is about *interpretability research*, not retrieval recall. **Different domain entirely from dense retrieval embeddings.** Worth flagging because the reused "Matryoshka" name can confuse the application.

---

## Limitations + open questions

- MTEB scores aggregate across many tasks; DD's actual workload (AI-research corpus, entity-heavy queries) may show different relative ordering. **F-31's eval set is the authoritative test**, not generic MTEB.
- The 768-dim default was chosen before the KG layer was planned (ADR-007 → 0005_kg.sql). KG expansion handles entity-name recall separately, so the embedding doesn't have to carry that load alone. This *reinforces* the case for staying at 768 dims since vector retrieval is now one of three legs (BM25 + vector + KG) per ADR-008 + the new F-31 acceptance criteria.
- Cost comparison assumes batch API for ingest-time embeddings (50% discount). Query-time embeddings (real-time during chat / search) don't get the batch discount. At DD's projected volume (~100 queries/day), this is negligible (<$0.10/mo).

---

## Sources

- [HuggingFace — Matryoshka Embeddings blog](https://huggingface.co/blog/matryoshka)
- [arXiv 2503.17547 — Matryoshka Sparse Autoencoders](https://arxiv.org/html/2503.17547v1) *(different domain — interpretability, not retrieval)*
- [Embedding Models 2026: Benchmark and Comparison — Ailog](https://app.ailog.fr/en/blog/news/embedding-models-2026)
- [Which Embedding Model Should You Actually Use in 2026? — Cheney Zhang](https://zc277584121.github.io/rag/2026/03/20/embedding-models-benchmark-2026.html)
- [Best Embedding Models for RAG (2026) — PremAI](https://blog.premai.io/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/)
- [Text Embedding Models Compared 2026 — PE Collective](https://pecollective.com/tools/text-embedding-models-compared/)
- [Best Embedding Model for RAG 2026 — Milvus Blog](https://milvus.io/blog/choose-embedding-model-rag-2026.md)
- [What is Matryoshka Representation Learning? — MindStudio](https://www.mindstudio.ai/blog/what-is-matryoshka-representation-learning)
- [Embedding Model Leaderboard MTEB March 2026 — Awesome Agents](https://awesomeagents.ai/leaderboards/embedding-model-leaderboard-mteb-march-2026/)
- [OpenAI Matryoshka in Weaviate](https://weaviate.io/blog/openais-matryoshka-embeddings-in-weaviate) *(referenced previously in pipeline-simplification doc)*
