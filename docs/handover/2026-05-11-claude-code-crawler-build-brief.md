# Claude Code build brief — DD crawler, corpus enrichment, and KG

**Date:** 2026-05-11
**Status:** Ready for implementation
**Primary spec:** `docs/architecture/dd-owned-crawler-tool-spec-2026-05-11.md`
**Use this brief for:** the next Claude Code session continuing the Railway worker build.

---

## Bottom line

Build the next version as a Railway worker pipeline, not a Vercel pipeline.

V1 should improve the current ingestion path without changing the whole app architecture:

```text
source adapters
  -> corpus_documents
  -> content-extract
  -> ai-summarize
  -> kg-extract
  -> embed-document
  -> Vercel search/chat can read corpus + KG later
```

Do not build the full crawler all at once. Land the smallest production-safe path first, then expand into source discovery, render fallback, and paper enrichment.

---

## Current state to preserve

The worker already has:

- pg-boss singleton and queue handlers in `workers/src/queue.ts`
- node-cron schedules in `workers/src/cron.ts`
- `/health` and `/cron-status` in `workers/src/health.ts`
- source adapters:
  - `workers/src/adapters/arxiv.ts`
  - `workers/src/adapters/rss.ts`
  - `workers/src/adapters/anthropic-sitemap.ts`
  - `workers/src/adapters/arxiv-embed.ts`
- Railway config in `workers/railway.json`
- corpus schema in `drizzle/0003_corpus.sql`
- KG/source registry schema in `drizzle/0005_kg.sql`

Do not rewrite those pieces. Extend them.

---

## Architecture constraints

### Railway boundary

Railway should do:

- source sync
- crawler/discovery jobs
- static HTML extraction
- optional CDP rendering
- PDF/paper enrichment
- embedding
- KG extraction
- backfill jobs

### Vercel boundary

Vercel should do:

- UI
- auth
- chat/search APIs
- lightweight enqueue endpoints
- read-only retrieval over corpus/KG

Do not put crawler loops, browser rendering, PDF parsing, or multi-document backfills inside Vercel routes.

### Worker code boundary

Keep new worker code inside `workers/src`. The worker TypeScript config uses `rootDir: ./src`, so importing app-side `lib/*` code is not safe unless shared code is deliberately moved into a shared module later.

---

## Database constraints Claude must obey

### `ai_sources.source_kind`

Allowed values only:

```text
lab_news
lab_research
paper_index
industry_news
user_url
user_rss
user_file
```

Invalid values:

```text
arxiv
rss
sitemap
api
html
pdf
cdp
```

Those invalid values are discovery or extraction methods, not source kinds. Put them in `crawl_config`.

Correct examples:

```json
{
  "source_kind": "paper_index",
  "source_key": "arxiv-cs-ai",
  "crawl_config": {
    "discovery": ["api"],
    "category": "lab_research",
    "rate_limit_ms": 3000
  }
}
```

```json
{
  "source_kind": "lab_news",
  "source_key": "openai-news",
  "crawl_config": {
    "discovery": ["rss"],
    "category": "lab_announcement",
    "content_extract": "quality_gate",
    "render_fallback": "cdp"
  }
}
```

### `ai_entities.entity_type`

Allowed values only:

```text
organization
model
product
person
benchmark
capability
technique
paper
standard
other
```

The `kg-extract` prompt and TypeScript validator must reject or coerce anything else to `other`.

### RLS

Current worker should use the owner/unpooled database URL for v1 KG writes. If the worker is later moved to a non-owner app role, add UPDATE policies for `ai_entities` and any other KG table that needs mutation.

---

## Implementation order

### Phase 1 — source registry seed

Add `workers/src/seed-sources.ts`.

Purpose:

- Seed `ai_sources` idempotently.
- Use valid `source_kind` values.
- Keep source behavior in `crawl_config`.

Initial rows:

| source_key | source_kind | trust_tier | origin_url | crawl_config |
|---|---|---:|---|---|
| `arxiv-cs-ai` | `paper_index` | 1 | `https://export.arxiv.org/api/query?search_query=cat:cs.AI` | `{"category":"lab_research","discovery":["api"],"rate_limit_ms":3000,"content_type":"paper"}` |
| `anthropic-news` | `lab_news` | 1 | `https://www.anthropic.com/sitemap.xml` | `{"category":"lab_announcement","discovery":["sitemap"],"rate_limit_ms":1000,"content_type":"article"}` |
| `openai-news` | `lab_news` | 1 | `https://openai.com/news/rss.xml` | `{"category":"lab_announcement","discovery":["rss"],"rate_limit_ms":1000,"content_type":"article","render_fallback":"quality_gate"}` |

Run seed once during worker startup after Postgres ping and before cron registration. The function must be safe to re-run on every deploy.

Acceptance:

- Re-running seed creates no duplicates.
- No CHECK constraint violation.
- `ai_sources` has all three rows.

### Phase 2 — rename/abstract embedding queue contract

Current queue `arxiv-embed` is source-agnostic but named as if it only embeds arXiv. Prefer adding a new queue name `embed-document` while keeping `arxiv-embed` temporarily as a compatibility alias if needed.

Acceptance:

- Newly ingested OpenAI, Anthropic, and arXiv docs can all be embedded.
- Health queue count includes the new queues.
- Existing tests still pass.

### Phase 3 — content-extract handler

Add `workers/src/adapters/content-extract.ts`.

Job payload:

```ts
type ContentExtractJob = {
  documentId: string;
  force?: boolean;
};
```

Behavior:

- Load the document by ID.
- Choose extraction method by source/document metadata:
  - arXiv: no-op for body, enrich metadata with paper identifiers/authors where possible.
  - Anthropic: static HTML fetch and article extraction.
  - OpenAI: static HTML first; CDP only when quality gate fails or source config requires it.
  - Generic RSS/user URL: static HTML first.
- Update `corpus_documents.body`, `content_hash`, and `metadata.content_extract`.
- Mark degraded metadata on failure; do not crash the entire downstream pipeline unless the row cannot be loaded.

Minimum metadata:

```json
{
  "content_extract": {
    "method": "rss|sitemap|static_html|rendered_html|api|noop",
    "quality_score": 0.0,
    "degraded": false,
    "degraded_reasons": [],
    "fetched_at": "ISO timestamp",
    "body_chars": 1234,
    "final_url": "https://..."
  }
}
```

Acceptance:

- Handler is idempotent.
- A short RSS description can be replaced by fuller article body.
- Failed extraction writes degraded metadata.
- Existing ingest handlers enqueue `content-extract` for new docs.

### Phase 4 — ai-summarize handler

Add `workers/src/adapters/ai-summarize.ts`.

Job payload:

```ts
type AiSummarizeJob = {
  documentId: string;
  force?: boolean;
  promptVersion?: string;
};
```

Use Groq through the existing OpenAI SDK dependency:

- `baseURL: "https://api.groq.com/openai/v1"`
- `apiKey: process.env.GROQ_API_KEY`
- model from `GROQ_MODEL` or default `llama-3.3-70b-versatile`
- `temperature: 0`

Output shape:

```ts
type AiSummary = {
  tl_dr: string;
  novel_capability: string | null;
  risks: string[];
  automation_candidates: string[];
  who_should_care_level: "low" | "medium" | "high";
  est_skill_level: "beginner" | "intermediate" | "advanced";
};
```

Store under `corpus_documents.metadata.ai_summary`.

Prompt constraints:

- No PHI.
- Frame applications generically for solo practitioners evaluating AI tools.
- Do not make numeric business claims unless present in the source.
- Return JSON only.

Acceptance:

- Skips if the same prompt version already exists unless `force=true`.
- Marks `ai_summary.degraded=true` if Groq fails.
- Does not block embedding or KG extraction.

### Phase 5 — kg-extract handler

Add `workers/src/adapters/kg-extract.ts`.

Job payload:

```ts
type KgExtractJob = {
  documentId: string;
  force?: boolean;
  promptVersion?: string;
};
```

LLM output shape:

```ts
type KgExtraction = {
  entities: Array<{
    entity_type:
      | "organization"
      | "model"
      | "product"
      | "person"
      | "benchmark"
      | "capability"
      | "technique"
      | "paper"
      | "standard"
      | "other";
    canonical_name: string;
    aliases?: string[];
    evidence_text: string;
    confidence?: number;
  }>;
  relationships: Array<{
    source: string;
    target: string;
    relationship_type: string;
    temporal_status?: "active" | "ended" | "announced" | "rumored";
    evidence_text: string;
    confidence?: number;
  }>;
};
```

Canonicalization:

- First try exact `(scope, entity_type, lower(canonical_name))`.
- Then try trigram similarity against `lower(canonical_name)`.
- Then try alias overlap.
- If ambiguous, pick the highest mention-count match and record the ambiguity in metadata/logs.
- If no match, insert a new entity.

Writes:

- `ai_entities`
- `ai_document_entity_mentions`
- `ai_relationships`
- `corpus_documents.metadata.kg_extract`

Acceptance:

- Invalid entity types are rejected or mapped to `other`.
- Duplicate entity mentions in one doc merge into one `ai_document_entity_mentions` row.
- Relationship self-loops are discarded.
- Existing entities get `mention_count` and `last_seen_at` updates when possible.
- Handler is idempotent per document/prompt version.

### Phase 6 — queue chain

Change `workers/src/queue.ts` so new ingestion follows this order:

```text
arxiv-fetch / rss-fetch / anthropic-news-fetch
  -> content-extract
  -> ai-summarize
  -> kg-extract
  -> embed-document
```

Important:

- All downstream handlers should see the same post-extraction body.
- One degraded enrichment should not stop the other enrichments.
- Queue names must be included in `queueCount()`.
- Batch size should stay 1 for network/LLM/CDP jobs until measured.

### Phase 7 — crawler module foundation

After the enrichment chain is working, begin the DD-owned crawler module under `workers/src/crawler/`:

```text
workers/src/crawler/
  source-profile.ts
  rss-discovery.ts
  sitemap-parser.ts
  url-classifier.ts
  html-fetcher.ts
  extraction/
    article.ts
    paper.ts
    images.ts
    links.ts
    quality.ts
```

Do not add the CDP render adapter in this phase unless a static extraction fixture proves it is needed.

---

## Render/CDP rule

CDP is a fallback lane, not the default crawler.

If implemented:

- keep a narrow `RenderAdapter` interface
- copy/adapt only the minimal CDP pieces from Interface Built Right
- do not import IBR as a package
- do not include IBR visual testing, accessibility, design-system, or snapshot modules
- keep render queue concurrency at 1
- use apt/prebuilt Chromium packaging on Railway
- do not use `nixPkgs = ["chromium"]`

Rationale: the previous Railway failure hypothesis was consistent with Nix building Chromium from source and exhausting the builder. Avoid that path.

---

## Backfill plan

After handlers land:

1. Count documents:

```sql
SELECT count(*) FROM corpus_documents;
```

2. Enqueue `content-extract` for each document.
3. Let `content-extract` fan out to `ai-summarize`, `kg-extract`, and `embed-document`.
4. Verify:

```sql
SELECT count(*) FROM ai_entities;
SELECT count(*) FROM ai_document_entity_mentions;
SELECT count(*) FROM ai_relationships;
SELECT source_type, count(*) FROM corpus_documents GROUP BY 1 ORDER BY 1;
```

Do not assume the historical row count is still 48. Crons may have added rows since the preflight note.

---

## Validation commands

From repo root:

```bash
pnpm --dir workers typecheck
pnpm --dir workers test
```

For database-backed smoke checks, use the worker env and run only after confirming the target DB:

```bash
psql "$DATABASE_URL_UNPOOLED" -c "select count(*) from corpus_documents;"
psql "$DATABASE_URL_UNPOOLED" -c "select source_kind, source_key from ai_sources order by source_key;"
```

For deployed worker health:

```bash
curl -sS https://decision-doctor-workers-production.up.railway.app/health
curl -sS https://decision-doctor-workers-production.up.railway.app/cron-status
```

---

## Do not implement yet

- BullMQ/Redis
- full GROBID service
- separate Railway render service
- normalized author/reference/image tables
- Vercel crawler routes
- broad website backlink discovery
- paywall bypass
- full IBR engine import

Implement those only after metrics show a need.

---

## Done criteria for the next build chunk

The next build chunk is done when:

- `ai_sources` is seeded with valid `source_kind` values.
- Ingest handlers enqueue `content-extract`.
- `content-extract` updates document body/metadata idempotently.
- `ai-summarize` writes `metadata.ai_summary`.
- `kg-extract` writes entities, mentions, and relationships.
- Embedding happens after content extraction.
- `/health` still returns 200 locally and on Railway after deploy.
- `pnpm --dir workers typecheck` and `pnpm --dir workers test` pass.
- A small backfill creates nonzero rows in `ai_entities` and `ai_document_entity_mentions`.

---

## Copy-paste prompt for Claude Code

```text
Continue Decision Doctor CC from docs/handover/2026-05-11-claude-code-crawler-build-brief.md.

Implement the next build chunk only:
1. seed ai_sources with valid source_kind values,
2. add content-extract,
3. add ai-summarize,
4. add kg-extract,
5. update queue chaining so embeddings happen after content extraction,
6. add focused worker tests.

Respect Railway/Vercel boundaries. Keep code inside workers/src. Do not add BullMQ/Redis. Do not add CDP/Chromium unless a test fixture proves static extraction cannot work. Run pnpm --dir workers typecheck and pnpm --dir workers test before reporting done.
```
