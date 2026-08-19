// content-extract pg-boss job handler.
//
// Per-source body extraction matrix:
//   arxiv          → no-op (abstract is already real content); method='noop_abstract'
//   anthropic-news → cheerio extract <article>/<main>; rate-limited 1 req/sec;
//                    fallback to og:description on parse fail (method='og_description_fallback')
//   openai-news    → static fetch first, CDP rendered probe as gated fallback;
//                    challenge shells are rejected.
//   default        → cheerio first; if extracted body < 500 chars, fall back to CDP;
//                    method='auto'
//
// Always writes metadata.content_extract with extractor_version, body_kind,
// quality score, input/output hash, and degradation reasons.
// Idempotent: skip only if the current extractor already produced a non-degraded
// full_text body whose output hash still matches corpus_documents.content_hash.
//
// Graceful degrade: on any thrown error during extraction the handler writes
// metadata.content_extract = { method, fetched_at, body_length, degraded: true }
// and leaves body unchanged. Chain continues.

import * as cheerio from "cheerio";
import { getPool } from "../db.js";
import { extractRenderedContentProbe } from "../cdp/extract-content.js";
import { sleep } from "../rate-limit.js";
import { parseRssItems, type RssItem } from "./rss.js";
import {
  EXTRACTOR_VERSION,
  assessBodyQuality,
  contentExtractMetadata,
  hasChallengeShell,
  normalizeBodyText,
  sha256,
  type BodyKind,
  type ExtractionMethod,
  type QualityAssessment,
} from "../ingestion/quality.js";

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc)";

const CHEERIO_FALLBACK_THRESHOLD = 500;
const OPENAI_RSS_URL = "https://openai.com/news/rss.xml";

export interface ContentExtractPayload {
  documentId: string;
}

export interface ContentExtractResult {
  documentId: string;
  status:
    | "extracted"
    | "skipped-already-extracted"
    | "skipped-not-found"
    | "noop"
    | "degraded";
  method: string;
  body_kind: BodyKind;
  quality_score: number;
  degraded_reasons: string[];
  body_length: number;
  prior_body_length: number;
  latency_ms: number;
}

type SourceType = "arxiv" | "anthropic-news" | "openai-news" | string;

interface DocumentRow {
  id: string;
  scope: string;
  source_type: SourceType;
  source_url: string;
  body: string;
  content_hash: string;
  crawl_config: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

interface TextCandidate {
  selector: string;
  text: string;
}

/** Pull readable text from an article-ish HTML document. Picks the LONGEST
 *  candidate across all <article>/<main>/<body> matches — some SPAs (e.g.
 *  platform.claude.com docs) nest two <article> tags where the first is a
 *  loading skeleton; `.first()` would return the skeleton. */
export function extractArticleCandidates(html: string): TextCandidate[] {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, aside, noscript, svg, form").remove();
  const selectors = [
    "article",
    "main",
    '[role="main"]',
    '[class*="article"]',
    '[class*="Article"]',
    '[class*="post"]',
    '[class*="Post"]',
    '[class*="content"]',
    '[class*="Content"]',
    '[data-testid*="article"]',
    '[data-testid*="post"]',
    "header",
    "body",
  ];
  const seen = new Set<string>();
  const candidates: TextCandidate[] = [];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, " ").trim();
      if (txt.length === 0 || seen.has(txt)) return;
      seen.add(txt);
      candidates.push({ selector: sel, text: txt });
    });
  }
  return candidates;
}

export function extractArticleText(html: string): string {
  return extractArticleCandidates(html)
    .map((c) => c.text)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

interface FetchArtifact {
  html: string;
  finalUrl: string;
  statusCode: number;
}

async function fetchHtml(url: string): Promise<FetchArtifact> {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return {
    html: await resp.text(),
    finalUrl: resp.url,
    statusCode: resp.status,
  };
}

let openAiRssCache: Promise<RssItem[]> | null = null;

function normalizeUrlForMatch(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

export function findRssSummaryByUrl(
  items: Array<Pick<RssItem, "link" | "guid" | "description" | "title">>,
  sourceUrl: string,
): string | null {
  const target = normalizeUrlForMatch(sourceUrl);
  const item = items.find(
    (it) =>
      normalizeUrlForMatch(it.link) === target ||
      normalizeUrlForMatch(it.guid) === target,
  );
  const summary = normalizeBodyText(item?.description || item?.title || "");
  return summary.length > 0 ? summary : null;
}

async function fetchOpenAiRssSummary(sourceUrl: string): Promise<string | null> {
  openAiRssCache ??= fetch(OPENAI_RSS_URL, { headers: { "User-Agent": UA } })
    .then(async (resp) => {
      if (!resp.ok) {
        throw new Error(`RSS fetch ${OPENAI_RSS_URL} -> HTTP ${resp.status}`);
      }
      return parseRssItems(await resp.text());
    })
    .catch((e) => {
      openAiRssCache = null;
      throw e;
    });

  return findRssSummaryByUrl(await openAiRssCache, sourceUrl);
}

interface ExtractionOutcome {
  method: ExtractionMethod;
  body: string;
  finalUrl: string | null;
  statusCode: number | null;
  degradedReasons: string[];
}

function bestRenderedText(
  probe: {
    outerHtml: string;
    bodyInnerText: string;
    articleTexts: string[];
    mainTexts: string[];
  },
  sourceType: SourceType,
  sourceUrl: string,
  crawlConfig: Record<string, unknown> | null,
): string {
  return bestTextCandidate({
    sourceType,
    sourceUrl,
    crawlConfig,
    method: "cdp_rendered",
    candidates: [
      ...extractArticleCandidates(probe.outerHtml).map((c) => c.text),
      ...probe.articleTexts,
      ...probe.mainTexts,
      probe.bodyInnerText,
    ],
  });
}

function bodyKindRank(kind: string): number {
  switch (kind) {
    case "full_text":
      return 5;
    case "source_summary":
      return 3;
    case "metadata_only":
      return 2;
    case "degraded":
      return 1;
    case "blocked":
      return 0;
    default:
      return 0;
  }
}

function bestTextCandidate(args: {
  sourceType: SourceType;
  sourceUrl: string;
  crawlConfig: Record<string, unknown> | null;
  method: ExtractionMethod;
  candidates: string[];
}): string {
  return args.candidates
    .map(normalizeBodyText)
    .filter(Boolean)
    .map((body) => ({
      body,
      quality: assessBodyQuality({
        sourceType: args.sourceType,
        sourceUrl: args.sourceUrl,
        crawlConfig: args.crawlConfig,
        method: args.method,
        body,
      }),
    }))
    .sort((a, b) => {
      const rankDelta = bodyKindRank(b.quality.bodyKind) - bodyKindRank(a.quality.bodyKind);
      if (rankDelta !== 0) return rankDelta;
      const scoreDelta = b.quality.qualityScore - a.quality.qualityScore;
      if (scoreDelta !== 0) return scoreDelta;
      const wordDelta = b.quality.wordCount - a.quality.wordCount;
      if (wordDelta !== 0) return wordDelta;
      return b.body.length - a.body.length;
    })[0]?.body ?? "";
}

function bestHtmlText(
  html: string,
  sourceType: SourceType,
  sourceUrl: string,
  crawlConfig: Record<string, unknown> | null,
  method: ExtractionMethod,
): string {
  return bestTextCandidate({
    sourceType,
    sourceUrl,
    crawlConfig,
    method,
    candidates: extractArticleCandidates(html).map((c) => c.text),
  });
}

function chooseCandidate(args: {
  sourceType: SourceType;
  sourceUrl: string;
  crawlConfig: Record<string, unknown> | null;
  currentBody: string;
  method: ExtractionMethod;
  candidateBody: string;
  finalUrl: string | null;
  statusCode: number | null;
  degradedReasons?: string[];
}): ExtractionOutcome {
  const candidateBody = normalizeBodyText(args.candidateBody);
  const currentBody = normalizeBodyText(args.currentBody);
  const candidateQuality = assessBodyQuality({
    sourceType: args.sourceType,
    sourceUrl: args.sourceUrl,
    crawlConfig: args.crawlConfig,
    method: args.method,
    body: candidateBody,
  });
  const currentQuality = assessBodyQuality({
    sourceType: args.sourceType,
    sourceUrl: args.sourceUrl,
    crawlConfig: args.crawlConfig,
    method: "source_summary",
    body: currentBody,
  });

  if (
    candidateQuality.bodyKind === "full_text" ||
    (candidateQuality.bodyKind === "source_summary" &&
      currentQuality.bodyKind !== "full_text" &&
      candidateBody.length > currentBody.length)
  ) {
    return {
      method: args.method,
      body: candidateBody,
      finalUrl: args.finalUrl,
      statusCode: args.statusCode,
      degradedReasons: args.degradedReasons ?? [],
    };
  }

  return {
    method: args.method,
    body: currentBody,
    finalUrl: args.finalUrl,
    statusCode: args.statusCode,
    degradedReasons: [
      ...(args.degradedReasons ?? []),
      ...candidateQuality.degradedReasons.map((r) => `candidate_${r}`),
      "kept_existing_body",
    ],
  };
}

function buildContentExtractMeta(args: {
  method: ExtractionMethod;
  inputHash: string;
  outputHash: string;
  finalUrl: string | null;
  statusCode: number | null;
  quality: QualityAssessment;
  extraReasons: string[];
}): Record<string, unknown> {
  const reasons = Array.from(
    new Set([...args.quality.degradedReasons, ...args.extraReasons]),
  );
  return {
    extractor_version: EXTRACTOR_VERSION,
    method: args.method,
    fetched_at: new Date().toISOString(),
    body_kind: args.quality.bodyKind,
    quality_score: args.quality.qualityScore,
    degraded: args.quality.degraded || reasons.length > 0,
    degraded_reasons: reasons,
    policy_profile: args.quality.policyProfile,
    policy_source: args.quality.policySource,
    min_full_text_words: args.quality.minFullTextWords,
    min_summary_words: args.quality.minSummaryWords,
    body_chars: args.quality.bodyChars,
    body_length: args.quality.bodyChars,
    word_count: args.quality.wordCount,
    input_hash: args.inputHash,
    output_hash: args.outputHash,
    final_url: args.finalUrl,
    status_code: args.statusCode,
  };
}

export function shouldSkipContentExtract(args: {
  metadata: Record<string, unknown>;
  contentHash: string;
}): boolean {
  const ce = contentExtractMetadata(args.metadata);
  return (
    ce?.extractor_version === EXTRACTOR_VERSION &&
    ce.output_hash === args.contentHash &&
    ce.degraded !== true &&
    ce.body_kind === "full_text"
  );
}

async function extractForSource(
  sourceType: SourceType,
  sourceUrl: string,
  crawlConfig: Record<string, unknown> | null,
  currentBody: string,
): Promise<ExtractionOutcome> {
  switch (sourceType) {
    case "arxiv": {
      // Abstract is already in body; no fetch needed.
      return {
        method: "noop_abstract",
        body: currentBody,
        finalUrl: sourceUrl,
        statusCode: null,
        degradedReasons: [],
      };
    }

    case "anthropic-news": {
      // 1 req/sec per Atomize convention.
      await sleep(1000);
      let artifact: FetchArtifact;
      try {
        artifact = await fetchHtml(sourceUrl);
      } catch (e) {
        return {
          method: "og_description_fallback",
          body: currentBody,
          finalUrl: sourceUrl,
          statusCode: null,
          degradedReasons: [`fetch_failed:${String(e).slice(0, 120)}`],
        };
      }
      return chooseCandidate({
        sourceType,
        sourceUrl,
        crawlConfig,
        currentBody,
        method: "static_cheerio",
        candidateBody: bestHtmlText(
          artifact.html,
          sourceType,
          sourceUrl,
          crawlConfig,
          "static_cheerio",
        ),
        finalUrl: artifact.finalUrl,
        statusCode: artifact.statusCode,
      });
    }

    case "openai-news": {
      // RSS is metadata-level; try static first, then CDP. Any challenge shell
      // is rejected by chooseCandidate/quality gates and the RSS description is
      // preserved as source_summary rather than overwritten.
      const reasons: string[] = [];
      try {
        const artifact = await fetchHtml(sourceUrl);
        const staticChoice = chooseCandidate({
          sourceType,
          sourceUrl,
          crawlConfig,
          currentBody,
          method: "static_cheerio",
          candidateBody: bestHtmlText(
            artifact.html,
            sourceType,
            sourceUrl,
            crawlConfig,
            "static_cheerio",
          ),
          finalUrl: artifact.finalUrl,
          statusCode: artifact.statusCode,
        });
        if (
          assessBodyQuality({
            sourceType,
            sourceUrl,
            crawlConfig,
            method: staticChoice.method,
            body: staticChoice.body,
          }).bodyKind === "full_text"
        ) {
          return staticChoice;
        }
        reasons.push(...staticChoice.degradedReasons);
      } catch (e) {
        reasons.push(`static_fetch_failed:${String(e).slice(0, 120)}`);
      }

      const probe = await extractRenderedContentProbe(sourceUrl);
      const renderedChoice = chooseCandidate({
        sourceType,
        sourceUrl,
        crawlConfig,
        currentBody,
        method: "cdp_rendered",
        candidateBody: bestRenderedText(probe, sourceType, sourceUrl, crawlConfig),
        finalUrl: probe.finalUrl,
        statusCode: null,
        degradedReasons: [
          ...reasons,
          ...probe.loadingSignals.map((s) => `loading_signal:${s.slice(0, 80)}`),
          ...probe.errorSignals.map((s) => `error_signal:${s.slice(0, 80)}`),
        ],
      });
      const renderedQuality = assessBodyQuality({
        sourceType,
        sourceUrl,
        crawlConfig,
        method: renderedChoice.method,
        body: renderedChoice.body,
      });
      if (
        renderedQuality.bodyKind === "blocked" ||
        hasChallengeShell(renderedChoice.body)
      ) {
        try {
          const rssSummary = await fetchOpenAiRssSummary(sourceUrl);
          if (rssSummary) {
            return {
              method: "source_summary",
              body: rssSummary,
              finalUrl: sourceUrl,
              statusCode: null,
              degradedReasons: [
                ...renderedChoice.degradedReasons,
                "rss_summary_fallback",
              ],
            };
          }
        } catch (e) {
          renderedChoice.degradedReasons.push(
            `rss_summary_failed:${String(e).slice(0, 120)}`,
          );
        }
      }
      return renderedChoice;
    }

    default: {
      // Unknown source: cheerio first, CDP fallback under threshold.
      let artifact: FetchArtifact | null = null;
      try {
        artifact = await fetchHtml(sourceUrl);
      } catch {
        artifact = null;
      }
      if (artifact) {
        const cheerioBody = bestHtmlText(
          artifact.html,
          sourceType,
          sourceUrl,
          crawlConfig,
          "static_cheerio",
        );
        if (cheerioBody.length >= CHEERIO_FALLBACK_THRESHOLD) {
          return chooseCandidate({
            sourceType,
            sourceUrl,
            crawlConfig,
            currentBody,
            method: "static_cheerio",
            candidateBody: cheerioBody,
            finalUrl: artifact.finalUrl,
            statusCode: artifact.statusCode,
          });
        }
      }
      // Cheerio too thin → try CDP.
      try {
        const probe = await extractRenderedContentProbe(sourceUrl);
        return chooseCandidate({
          sourceType,
          sourceUrl,
          crawlConfig,
          currentBody,
          method: "cdp_rendered",
          candidateBody: bestRenderedText(probe, sourceType, sourceUrl, crawlConfig),
          finalUrl: probe.finalUrl,
          statusCode: null,
          degradedReasons: [
            ...probe.loadingSignals.map((s) => `loading_signal:${s.slice(0, 80)}`),
            ...probe.errorSignals.map((s) => `error_signal:${s.slice(0, 80)}`),
          ],
        });
      } catch (e) {
        return {
          method: "auto",
          body: currentBody,
          finalUrl: artifact?.finalUrl ?? sourceUrl,
          statusCode: artifact?.statusCode ?? null,
          degradedReasons: [`cdp_failed:${String(e).slice(0, 120)}`],
        };
      }
    }
  }
}

export async function handleContentExtract(
  payload: ContentExtractPayload,
): Promise<ContentExtractResult> {
  const t0 = Date.now();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const docQ = await client.query<DocumentRow>(
      `SELECT d.id, d.scope, d.source_type, d.source_url, d.body,
              d.content_hash, d.metadata,
              s.crawl_config
         FROM corpus_documents d
         LEFT JOIN ai_sources s
           ON s.scope = d.scope
          AND s.source_key = d.source_type
        WHERE d.id = $1
        LIMIT 1`,
      [payload.documentId],
    );
    if (docQ.rows.length === 0) {
      return {
        documentId: payload.documentId,
        status: "skipped-not-found",
        method: "n/a",
        body_kind: "metadata_only",
        quality_score: 0,
        degraded_reasons: ["not_found"],
        body_length: 0,
        prior_body_length: 0,
        latency_ms: Date.now() - t0,
      };
    }
    const doc = docQ.rows[0]!;
    const priorLen = doc.body.length;
    if (shouldSkipContentExtract({ metadata: doc.metadata, contentHash: doc.content_hash })) {
      const ce = contentExtractMetadata(doc.metadata)!;
      return {
        documentId: doc.id,
        status: "skipped-already-extracted",
        method: String(ce.method ?? "unknown"),
        body_kind: ce.body_kind ?? "full_text",
        quality_score: 1,
        degraded_reasons: [],
        body_length: priorLen,
        prior_body_length: priorLen,
        latency_ms: Date.now() - t0,
      };
    }

    // Run extraction in graceful-degrade wrapper.
    let outcome: ExtractionOutcome;
    const inputHash = sha256(doc.body);
    try {
      outcome = await extractForSource(
        doc.source_type,
        doc.source_url,
        doc.crawl_config,
        doc.body,
      );
    } catch (e) {
      console.error(`[content-extract] extraction failed for ${doc.id}:`, e);
      outcome = {
        method: "error",
        body: doc.body,
        finalUrl: doc.source_url,
        statusCode: null,
        degradedReasons: [`extract_failed:${String(e).slice(0, 120)}`],
      };
    }

    const nextBody = normalizeBodyText(outcome.body.length > 0 ? outcome.body : doc.body);
    const outputHash = sha256(nextBody);
    const quality = assessBodyQuality({
      sourceType: doc.source_type,
      sourceUrl: doc.source_url,
      crawlConfig: doc.crawl_config,
      method: outcome.method,
      body: nextBody,
    });
    const meta = buildContentExtractMeta({
      method: outcome.method,
      inputHash,
      outputHash,
      finalUrl: outcome.finalUrl,
      statusCode: outcome.statusCode,
      quality,
      extraReasons: outcome.degradedReasons,
    });

    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [doc.scope],
    );
    // For arxiv no-op we still write the metadata marker so the chain knows
    // content-extract ran. Body stays NOT NULL — we never set it shorter.
    await client.query(
      `UPDATE corpus_documents
          SET body = $1,
              content_hash = $2,
              metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('content_extract', $3::jsonb)
        WHERE id = $4`,
      [nextBody, outputHash, JSON.stringify(meta), doc.id],
    );
    await client.query("COMMIT");

    const status: ContentExtractResult["status"] = meta.degraded === true
      ? "degraded"
      : outcome.method === "noop_abstract"
        ? "noop"
        : "extracted";

    const result: ContentExtractResult = {
      documentId: doc.id,
      status,
      method: outcome.method,
      body_kind: quality.bodyKind,
      quality_score: quality.qualityScore,
      degraded_reasons: meta.degraded_reasons as string[],
      body_length: nextBody.length,
      prior_body_length: priorLen,
      latency_ms: Date.now() - t0,
    };
    console.log(JSON.stringify({ event: "content-extract-complete", ...result }));
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
