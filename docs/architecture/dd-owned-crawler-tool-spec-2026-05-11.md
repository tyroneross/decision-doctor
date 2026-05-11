# DD-owned crawler tool spec

**Date:** 2026-05-11
**Status:** Draft spec, ready for implementation planning
**Owner:** Decision Doctor CC repo
**Related research packet:** `.build-loop/research/2026-05-11-dd-combined-crawler-research.md`

---

## Plain-language decision

Build a new crawler tool inside Decision Doctor CC. It should not depend on the IBR repo at runtime.

The crawler should use Atomize-style ingestion as the base: find sources cheaply, respect site rules, extract static HTML first, score extraction quality, and only use a browser when static extraction is not good enough.

IBR contributes one idea: a slim browser render adapter based on CDP. It should not contribute IBR's visual testing, accessibility resolution, design-system scanning, or workflow engine.

Research papers need their own path. A paper is not just a long article. The crawler must preserve title, author order, DOI/arXiv IDs, citations, references, PDF/full-text links, and extraction provenance.

---

## Problem

Decision Doctor needs to periodically sync multiple websites and research sources into the corpus. The current worker stack can ingest RSS metadata, arXiv abstracts, and a simple Anthropic sitemap path, but it does not yet solve the hard crawler cases:

- discovering feeds and sitemaps across many sites
- separating real content from ads, navigation, related links, and boilerplate
- extracting images and captions without saving logos, tracking pixels, or ad images
- preserving author names and author order
- extracting references, citations, and source links
- handling research papers differently from blog posts
- getting full text from rendered websites or PDFs when static HTML is insufficient
- keeping cost low enough for periodic sync

---

## Goals

1. Build a DD-owned crawler under `workers/src/crawler/`.
2. Keep pg-boss as the queue layer.
3. Keep one Railway worker service at first.
4. Use browser rendering only as fallback or source-specific override.
5. Support ordinary articles, docs pages, research paper pages, arXiv records, and PDFs.
6. Preserve extraction trace data so we can debug bad corpus rows.
7. Make source behavior configurable through `ai_sources.crawl_config`.
8. Avoid copying Atomize or IBR wholesale.

---

## Non-goals

- Do not import the IBR repo as a dependency.
- Do not add BullMQ or Redis.
- Do not solve paywalled content.
- Do not claim whole-web backlink discovery without a search/index provider.
- Do not make Chrome the default extraction path.
- Do not normalize every metadata field into new tables before the product needs queryable fields.

---

## Core architecture

```text
source-sync job
  -> load source profile from ai_sources.crawl_config
  -> robots and source policy check
  -> discover candidates
       RSS / Atom
       sitemap
       known API
       static HTML links
       bounded live navigation when configured
  -> classify candidate
       article | paper | docs | pdf | ignore
  -> static fetch
  -> document-specific extraction
  -> quality gate
  -> optional CDP render fallback
  -> enrichment
       arXiv / Crossref / OpenAlex / Semantic Scholar
  -> persist corpus document with metadata and extraction trace
  -> enqueue embedding / KG jobs
```

Recommended file layout:

```text
workers/src/crawler/
  orchestrator.ts
  source-profile.ts
  robots.ts
  rate-limit.ts
  rss-discovery.ts
  sitemap-parser.ts
  url-classifier.ts
  html-fetcher.ts
  render-adapter.ts
  persistence.ts
  extraction/
    article.ts
    paper.ts
    pdf.ts
    images.ts
    links.ts
    quality.ts
    sanitize.ts
  enrichers/
    arxiv.ts
    crossref.ts
    openalex.ts
    semantic-scholar.ts
```

---

## Source profile contract

`ai_sources.crawl_config` should drive source-specific behavior.

Example:

```json
{
  "category": "lab_research",
  "content_type": "mixed",
  "discovery": ["rss", "sitemap", "html"],
  "rate_limit_ms": 1000,
  "requires_js": false,
  "render_fallback": "quality_gate",
  "max_candidates_per_run": 50,
  "max_navigation_pages": 5,
  "include_paths": ["/news/", "/blog/", "/research/"],
  "exclude_paths": ["/tag/", "/author/", "/privacy", "/terms"],
  "paper": {
    "prefer_pdf": true,
    "enrichers": ["arxiv", "crossref", "openalex", "semantic_scholar"]
  }
}
```

Default behavior should be conservative:

- `rate_limit_ms`: 1000
- `requires_js`: false
- `render_fallback`: `quality_gate`
- `max_candidates_per_run`: 25
- `max_navigation_pages`: 0 unless enabled
- `content_type`: `article`

---

## Discovery decisions

### Decision 1: RSS/Atom first

Use feeds first when available. Feeds are cheaper, more stable, and already contain update timestamps.

Benefit:
- fastest path
- low cost
- low page-load noise
- good dedupe keys

Tradeoff:
- feeds often contain summaries, not full content
- feeds may omit older pages

Implementation note:
- Current `workers/src/adapters/rss.ts` is RSS 2.0 only and regex-based. The crawler version should parse RSS and Atom with Cheerio XML mode or a small XML parser. Do not keep regex parsing for generic feeds.

### Decision 2: Sitemaps second

Use robots-declared sitemaps and common sitemap paths. Support sitemap indexes, regular sitemaps, news sitemaps, image sitemap fields, `lastmod`, and recency filtering.

Benefit:
- broad site coverage
- good for sites without feeds
- good for recent sync

Tradeoff:
- sitemaps can be huge
- sitemap URLs are candidate URLs, not proof that a page is worth ingesting

Implementation note:
- Enforce 50 MB and 50,000 URL limits.
- Cap sitemap-index fanout per run.

### Decision 3: Static HTML links third

Use static HTML link extraction only after feed and sitemap discovery fail or when a source profile asks for docs navigation.

Benefit:
- works for sites without feeds or sitemaps
- supports documentation websites

Tradeoff:
- much noisier
- more false positives
- needs stronger URL filtering

### Decision 4: Live navigation last

Use CDP only when a source requires JavaScript, when static extraction fails quality gates, or when a source profile explicitly enables docs navigation.

Benefit:
- handles JS-rendered sites
- can click docs navigation or load-more controls
- can inspect rendered DOM and final URLs

Tradeoff:
- slower
- more memory
- more Railway deployment complexity
- harder to rate-limit correctly

---

## Extraction decisions

### Decision 5: Extract fields independently

Do not treat extraction as one blob of text. For every page, extract:

- title
- authors
- published date
- canonical URL
- main content
- excerpt
- primary image
- content images
- outbound references
- internal links
- extraction method
- quality score
- failure/degraded reasons

Benefit:
- fewer bad corpus rows
- easier debugging
- better future search/ranking

Tradeoff:
- more code than a simple `body.text()`
- more fixture coverage required

### Decision 6: Use structured data first

Priority order for title, author, date, and paper metadata:

1. JSON-LD / Schema.org
2. citation meta tags, Highwire tags, Dublin Core tags
3. Open Graph / Twitter metadata
4. semantic HTML selectors
5. cleaned page title
6. LLM extraction only as a later enrichment step, not the crawler default

Benefit:
- higher accuracy
- preserves paper author order when publishers expose it
- less dependence on fragile CSS selectors

Tradeoff:
- many sites expose incomplete or inconsistent metadata

### Decision 7: Add Readability for article body extraction

Add `@mozilla/readability` plus `jsdom` to the worker package for ordinary article extraction, with Cheerio extraction as fallback and CDP as final fallback.

Benefit:
- better article/body segmentation across varied sites
- far cheaper than browser rendering
- less homegrown boilerplate code

Tradeoff:
- two new package dependencies
- higher memory than pure Cheerio
- output must be sanitized before storage or rendering

Assumption:
- The accuracy gain on varied article pages is worth the dependency cost.

### Decision 8: Keep image extraction heuristic and explicit

Image extraction should:

- prefer `og:image` for the primary image
- keep images inside `figure`, `article`, or main content
- keep captions and alt text
- reject tracking pixels, logos, social icons, ad networks, banners, placeholders, avatars, and low-dimension images

Benefit:
- avoids polluting the corpus with decorative assets
- preserves useful diagrams, charts, screenshots, and figures

Tradeoff:
- dimension metadata is not always present
- some important images may need a rendered pass to discover lazy-loaded URLs

---

## Research-paper decisions

### Decision 9: Papers get a separate extraction path

Classify papers before extraction. Signals:

- arXiv URL or arXiv ID
- DOI
- `citation_*` meta tags
- `ScholarlyArticle` JSON-LD
- PDF link near article metadata
- known repository or publisher domains

Benefit:
- preserves author order and identifiers
- avoids treating abstracts as full articles
- enables citation graph enrichment

Tradeoff:
- more branching logic
- source-specific metadata quality varies

### Decision 10: Metadata enrichers are preferred over scraping when available

Use source APIs for scholarly metadata:

- arXiv for arXiv papers
- Crossref for DOI metadata
- OpenAlex for work, venue, author, institution, and open-access metadata
- Semantic Scholar for citation counts, influential citations, references, and paper IDs

Benefit:
- better title/author/order/citation accuracy
- less scraping
- more stable than publisher HTML

Tradeoff:
- external API rate limits
- inconsistent coverage by source
- some metadata may conflict across providers

Conflict policy:

1. Source-owned metadata wins for canonical ID and author order.
2. Crossref wins for DOI publisher metadata.
3. arXiv wins for arXiv version metadata.
4. Semantic Scholar/OpenAlex enrich citation and graph fields.
5. Store conflicts in `metadata.extraction.conflicts`.

### Decision 11: PDF extraction is staged

Support PDFs through an interface, but do not require a GROBID service on day one.

V1:
- discover PDF URL
- store PDF URL and source page
- fetch direct PDF only when source profile enables it
- use basic text extraction only as a degraded fallback

V2:
- add GROBID-backed extraction for structured scholarly PDFs
- extract header, sections, references, figures, tables, and raw citations
- run as a separate service only when PDF volume justifies it

Benefit:
- avoids adding a heavy Java service before it is needed
- still leaves a clear path to reliable full-paper extraction

Tradeoff:
- V1 may not capture full PDF content for every paper
- high-quality references from PDFs require GROBID or similar tooling

Assumption:
- The first implementation should prioritize HTML, arXiv metadata, DOI metadata, and PDF discovery before full PDF parsing.

---

## Render adapter decisions

### Decision 12: CDP render adapter only

Create a DD-owned `RenderAdapter`.

```ts
export interface RenderAdapter {
  renderHtml(url: string, options: RenderOptions): Promise<RenderedPage>;
}

export interface RenderOptions {
  timeoutMs: number;
  waitForSelectors?: string[];
  clickSelectors?: string[];
  maxClicks?: number;
  sameOriginOnly: boolean;
  screenshotOnFailure: boolean;
}

export interface RenderedPage {
  url: string;
  finalUrl: string;
  html: string;
  text: string;
  status?: number;
  consoleWarnings: string[];
  networkErrors: string[];
  screenshotPath?: string;
  timingMs: number;
}
```

Supported actions:

- wait for content selectors
- accept common cookie banner selectors
- click same-origin docs navigation when configured
- click load-more buttons up to a strict cap
- capture final rendered HTML
- capture diagnostics on failure

Not supported:

- arbitrary browsing
- full visual testing
- form submission unless source-specific and explicitly allowed
- paywall bypass
- cross-origin exploration by default

Railway hardening requirements:

- Chromium installed through apt, not Nix source build
- container flags: `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- longer CDP boot timeout than IBR's current 5 seconds
- stderr/stdout capture for Chrome launch failure
- one render job at a time unless memory metrics prove higher concurrency is safe

---

## Queue and service decisions

### Decision 13: Keep pg-boss

Use pg-boss queues:

```text
source-sync
candidate-discover
candidate-extract
render-extract
paper-metadata-enrich
paper-pdf-extract
embed-document
kg-extract
```

Benefit:
- uses existing Postgres/Neon
- fewer services
- crash-safe with database state

Tradeoff:
- lower throughput ceiling than Redis/BullMQ

Assumption:
- DD's expected crawler volume is periodic source sync, not thousands of jobs per second.

### Decision 14: One Railway service first

Run discovery, static extraction, enrichment, embedding, and KG jobs in the existing worker service at first.

Add separate services only when metrics justify them:

- `dd-render-worker`: if CDP memory or boot failures affect normal jobs
- `dd-pdf-worker` or `grobid`: if full PDF extraction becomes frequent and valuable

Benefit:
- simplest deployment
- fewer moving parts
- easier debugging

Tradeoff:
- Chrome or PDF work can still affect the normal worker until split

Mitigation:
- isolate render jobs in their own queue with batch size 1 and strict timeouts.

---

## Storage decisions

### Decision 15: Use `corpus_documents.metadata` for v1 structured extraction

Do not add new tables in the first implementation unless a query needs them.

Suggested metadata shape:

```ts
type CorpusExtractionMetadata = {
  extraction: {
    documentType: "article" | "paper" | "docs" | "pdf";
    method: "rss" | "sitemap" | "static_html" | "rendered_html" | "api" | "pdf";
    qualityScore: number;
    degraded: boolean;
    degradedReasons: string[];
    fetchedAt: string;
    finalUrl?: string;
    sourceProfile?: string;
  };
  authors?: Array<{
    order?: number;
    name: string;
    orcid?: string;
    affiliation?: string;
  }>;
  images?: Array<{
    url: string;
    kind: "primary" | "figure" | "content";
    alt?: string;
    caption?: string;
    confidence: number;
  }>;
  links?: {
    canonical?: string;
    outbound: string[];
    internal: string[];
    references: Array<{
      url?: string;
      title?: string;
      doi?: string;
      arxivId?: string;
      raw?: string;
    }>;
  };
  paper?: {
    title: string;
    doi?: string;
    arxivId?: string;
    venue?: string;
    year?: number;
    abstract?: string;
    pdfUrl?: string;
    citationCount?: number;
    influentialCitationCount?: number;
    metadataSources: string[];
  };
};
```

Normalize later if needed:

- `corpus_document_authors` if author search/filtering matters
- `corpus_document_assets` if images/PDFs become first-class
- `corpus_document_references` if citation graph traversal matters

Benefit:
- avoids migration churn
- supports fast implementation
- keeps provenance available

Tradeoff:
- JSON fields are less queryable
- later normalization may require backfill

---

## Quality gates

A candidate should be accepted only if it passes document-specific checks.

Article quality checks:

- title present and not category-like
- body word count above configured minimum
- paragraph count above minimum
- link density below threshold
- boilerplate ratio below threshold
- content hash not duplicate unless source metadata changed
- date present or source profile allows missing date

Paper quality checks:

- title present
- at least one stable identifier when available: DOI, arXiv ID, canonical URL
- author list preserved when source provides it
- abstract or full body present
- references captured when available, or marked unavailable
- PDF URL captured when available

Rendered fallback triggers:

- static content too short
- title missing
- body is mostly navigation
- source profile says `requires_js: true`
- known lazy-loaded content pattern
- paper page has metadata but no abstract/body/PDF link

Degraded rows are allowed only when they are explicit:

```json
{
  "degraded": true,
  "degraded_reasons": ["references_unavailable", "pdf_text_not_extracted"]
}
```

---

## Benefits

Accuracy:
- Better article segmentation than current RSS/sitemap metadata-only ingestion.
- Better author, title, image, and reference extraction.
- Better paper metadata through source APIs instead of generic scraping.
- Browser fallback handles JS-heavy pages without making every page expensive.

Speed:
- Feeds and sitemaps avoid unnecessary browser work.
- Static HTML extraction stays fast for most sources.
- CDP runs only when quality gates justify it.

Cost:
- No Redis/BullMQ.
- No default browser rendering.
- No GROBID service until full PDF extraction volume justifies it.

Reliability:
- Source profiles make behavior explicit.
- Extraction traces make bad rows debuggable.
- pg-boss keeps queue state near corpus writes.

Maintainability:
- DD owns the code.
- Atomize and IBR are references, not runtime dependencies.
- The render adapter is replaceable.

---

## Tradeoffs

| Decision | Benefit | Tradeoff |
|---|---|---|
| DD-owned crawler | Full control and no IBR runtime dependency | More code to maintain |
| RSS/sitemap first | Fast and cheap | Some sites only expose summaries |
| Readability + jsdom | Better article extraction | New dependencies and memory cost |
| CDP fallback | Handles JS pages | Slower, heavier, Railway-sensitive |
| Metadata JSON first | Fast implementation | Less queryable than normalized tables |
| pg-boss | No Redis service | Lower throughput ceiling |
| GROBID later | Avoids heavy service early | V1 PDF extraction is less complete |
| Source APIs for papers | Better paper metadata | Rate limits and provider conflicts |

---

## Assumptions

1. DD's source sync workload is periodic and moderate.
2. Most target pages can be handled through feeds, sitemaps, APIs, or static HTML.
3. Browser rendering is needed for a minority of sources.
4. Research-paper metadata accuracy matters more than scraping every publisher page directly.
5. Full PDF extraction is valuable, but not required for the first crawler pass.
6. `corpus_documents.metadata` is acceptable for v1 structured fields.
7. If references, images, authors, or citation graph become product-facing filters, they will be normalized into child tables.
8. DD should respect robots and source terms; the crawler is not a paywall bypass tool.
9. Whole-web backlinks are out of scope unless DD later adds a search/index provider.

---

## Implementation phases

### Phase 1: Static crawler core

Deliver:

- `workers/src/crawler/source-profile.ts`
- `robots.ts`
- `rate-limit.ts`
- `rss-discovery.ts`
- `sitemap-parser.ts`
- `url-classifier.ts`
- `html-fetcher.ts`
- `extraction/article.ts`
- `extraction/images.ts`
- `extraction/links.ts`
- `extraction/quality.ts`
- `persistence.ts`

Acceptance:

- OpenAI RSS source still ingests.
- Anthropic sitemap source still ingests.
- A generic RSS or Atom feed can be discovered and parsed.
- A generic sitemap can be parsed with recency filtering.
- Static article extraction stores title, content, author/date when available, images, references, and quality trace.

### Phase 2: Render fallback

Deliver:

- `render-adapter.ts`
- `render-extract` queue handler
- Railway-safe Chromium launch
- source-level `requires_js` support
- rendered fallback through the same article/paper extractors

Acceptance:

- A JS-rendered fixture can be extracted.
- Static extraction remains default.
- Render failures produce useful diagnostics.
- Render jobs cannot starve normal source sync.

### Phase 3: Research-paper lane

Deliver:

- `extraction/paper.ts`
- `enrichers/arxiv.ts`
- `enrichers/crossref.ts`
- `enrichers/openalex.ts`
- `enrichers/semantic-scholar.ts`
- `paper-metadata-enrich` queue handler
- PDF URL discovery
- `paper-pdf-extract` interface with basic fallback and GROBID-ready provider

Acceptance:

- arXiv paper stores title, author order, abstract, categories, arXiv ID, PDF URL.
- DOI paper stores DOI, title, author order when available, venue/year, references/citation metadata when available.
- PDF source stores PDF URL and extraction trace.
- Full PDF extraction is marked degraded unless GROBID is configured.

### Phase 4: Normalization if needed

Deliver only if product needs queryable fields:

- `corpus_document_authors`
- `corpus_document_assets`
- `corpus_document_references`

Acceptance:

- Existing JSON metadata can backfill normalized tables.
- Search/ranking can use normalized references or authors where needed.

---

## Validation fixtures

Use a fixed fixture set before shipping:

- OpenAI news RSS item.
- Anthropic sitemap article.
- arXiv paper with multiple authors and PDF.
- DOI publisher page with `citation_*` meta tags.
- Publisher page with Schema.org `ScholarlyArticle`.
- A documentation site that needs same-origin navigation.
- A JS-rendered page that needs CDP.
- A page with heavy ads and related links.
- A page with figures, captions, and non-content images.
- A PDF with references.

Metrics to collect:

- candidate count
- accepted count
- duplicate count
- extraction method
- render fallback rate
- quality score
- degraded reason counts
- average fetch/extract time
- per-host rate-limit waits
- Chrome boot/render failures
- paper metadata source conflicts

---

## Open questions

1. Which first 10 sources should define the validation fixture set?
2. Should GROBID run on Railway, locally, or as an optional external service?
3. Do paper references need to be queryable in v1, or is metadata JSON enough?
4. Should images be stored as URLs only, or should DD eventually snapshot them?
5. What source terms or allowlist should govern live navigation?

---

## References

Local evidence:

- `workers/src/queue.ts`
- `workers/src/adapters/rss.ts`
- `workers/src/adapters/arxiv.ts`
- `workers/src/adapters/anthropic-sitemap.ts`
- `lib/db/schema.ts`
- `docs/handover/2026-05-11-preflight.md`
- `.build-loop/research/2026-05-11-dd-combined-crawler-research.md`
- `/Users/tyroneross/dev/git-folder/atomize-ai/lib/source-orchestrator.ts`
- `/Users/tyroneross/dev/git-folder/atomize-ai/lib/extraction/extraction-service.ts`
- `/Users/tyroneross/dev/git-folder/atomize-ai/lib/extraction/image-extractor.ts`
- `/Users/tyroneross/dev/git-folder/atomize-ai/lib/services/reference-parser-service.ts`
- `/Users/tyroneross/dev/git-folder/interface-built-right/src/engine/cdp/browser.ts`

External references:

- RFC 9309 Robots Exclusion Protocol: `https://www.rfc-editor.org/rfc/rfc9309`
- Sitemaps protocol: `https://www.sitemaps.org/protocol.html`
- Mozilla Readability: `https://github.com/mozilla/readability`
- GROBID REST API: `https://grobid.readthedocs.io/en/latest/Grobid-service/`
- Crossref REST API: `https://www.crossref.org/documentation/retrieve-metadata/rest-api/`
- OpenAlex Works API: `https://developers.openalex.org/api-reference/works`
- Semantic Scholar Academic Graph API: `https://www.semanticscholar.org/product/api/tutorial`
- arXiv API User Manual: `https://info.arxiv.org/help/api/user-manual.html`
- Schema.org ScholarlyArticle: `https://schema.org/ScholarlyArticle`
