// content-extract pg-boss job handler.
//
// Per-source body extraction matrix:
//   arxiv          → no-op (abstract is already real content); method='noop_abstract'
//   anthropic-news → cheerio extract <article>/<main>; rate-limited 1 req/sec;
//                    fallback to og:description on parse fail (method='og_description_fallback')
//   openai-news    → CDP rendered HTML → cheerio extract; method='cdp_rendered'
//   default        → cheerio first; if extracted body < 500 chars, fall back to CDP;
//                    method='auto'
//
// Always writes metadata.content_extract = { method, fetched_at, body_length }.
// Idempotent: skip work if metadata.content_extract.fetched_at exists (but do
// NOT skip the downstream chain — caller still fans out to ai-summarize +
// kg-extract + arxiv-embed so backfills re-run enrichments even on cached body).
//
// Graceful degrade: on any thrown error during extraction the handler writes
// metadata.content_extract = { method, fetched_at, body_length, degraded: true }
// and leaves body unchanged. Chain continues.

import * as cheerio from "cheerio";
import { getPool } from "../db.js";
import { extractRenderedHtml } from "../cdp/extract-content.js";
import { sleep } from "../rate-limit.js";

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc; contact: tyrone.ross@gmail.com)";

const CHEERIO_FALLBACK_THRESHOLD = 500;

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
  metadata: Record<string, unknown>;
}

/** Pull readable text from an article-ish HTML document. Picks the LONGEST
 *  candidate across all <article>/<main>/<body> matches — some SPAs (e.g.
 *  platform.claude.com docs) nest two <article> tags where the first is a
 *  loading skeleton; `.first()` would return the skeleton. */
function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, noscript").remove();
  let best = "";
  for (const sel of ["article", "main", "body"]) {
    $(sel).each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, " ").trim();
      if (txt.length > best.length) best = txt;
    });
    if (best.length >= 200 && sel !== "body") return best;
  }
  return best;
}

async function fetchHtml(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.text();
}

interface ExtractionOutcome {
  method: string;
  body: string;
}

async function extractForSource(
  sourceType: SourceType,
  sourceUrl: string,
  currentBody: string,
): Promise<ExtractionOutcome> {
  switch (sourceType) {
    case "arxiv": {
      // Abstract is already in body; no fetch needed.
      return { method: "noop_abstract", body: currentBody };
    }

    case "anthropic-news": {
      // 1 req/sec per Atomize convention.
      await sleep(1000);
      let html: string;
      try {
        html = await fetchHtml(sourceUrl);
      } catch {
        return { method: "og_description_fallback", body: currentBody };
      }
      const extracted = extractArticleText(html);
      if (extracted.length > currentBody.length) {
        return { method: "cheerio_article", body: extracted };
      }
      return { method: "og_description_fallback", body: currentBody };
    }

    case "openai-news": {
      // JS-rendered; HTTP shell is ~10KB. Go straight to CDP.
      const html = await extractRenderedHtml(sourceUrl);
      const extracted = extractArticleText(html);
      if (extracted.length > 0) {
        return { method: "cdp_rendered", body: extracted };
      }
      return { method: "cdp_rendered", body: currentBody };
    }

    default: {
      // Unknown source: cheerio first, CDP fallback under threshold.
      let html: string | null = null;
      try {
        html = await fetchHtml(sourceUrl);
      } catch {
        html = null;
      }
      if (html) {
        const cheerioBody = extractArticleText(html);
        if (cheerioBody.length >= CHEERIO_FALLBACK_THRESHOLD) {
          return { method: "auto", body: cheerioBody };
        }
      }
      // Cheerio too thin → try CDP.
      try {
        const rendered = await extractRenderedHtml(sourceUrl);
        const cdpBody = extractArticleText(rendered);
        if (cdpBody.length > 0) {
          return { method: "auto", body: cdpBody };
        }
      } catch {
        // fall through
      }
      return { method: "auto", body: currentBody };
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
      `SELECT id, scope, source_type, source_url, body, metadata
         FROM corpus_documents
        WHERE id = $1
        LIMIT 1`,
      [payload.documentId],
    );
    if (docQ.rows.length === 0) {
      return {
        documentId: payload.documentId,
        status: "skipped-not-found",
        method: "n/a",
        body_length: 0,
        prior_body_length: 0,
        latency_ms: Date.now() - t0,
      };
    }
    const doc = docQ.rows[0]!;
    const priorLen = doc.body.length;
    const ce = (doc.metadata?.content_extract ?? null) as
      | { fetched_at?: string; degraded?: boolean; method?: string }
      | null;
    if (ce?.fetched_at && !ce.degraded) {
      // Idempotent: a successful extraction already ran for this doc.
      // Degraded prior runs are intentionally retried — e.g. when Chrome
      // misconfiguration caused a CDP failure and has since been fixed,
      // we want the next enqueue to re-extract and clear the degraded flag.
      return {
        documentId: doc.id,
        status: "skipped-already-extracted",
        method: String(ce.method ?? "unknown"),
        body_length: priorLen,
        prior_body_length: priorLen,
        latency_ms: Date.now() - t0,
      };
    }

    // Run extraction in graceful-degrade wrapper.
    let outcome: ExtractionOutcome;
    let degraded = false;
    try {
      outcome = await extractForSource(doc.source_type, doc.source_url, doc.body);
    } catch (e) {
      console.error(`[content-extract] extraction failed for ${doc.id}:`, e);
      outcome = { method: "error", body: doc.body };
      degraded = true;
    }

    const nextBody = outcome.body.length > 0 ? outcome.body : doc.body;
    const fetchedAt = new Date().toISOString();
    const meta: Record<string, unknown> = {
      method: outcome.method,
      fetched_at: fetchedAt,
      body_length: nextBody.length,
    };
    if (degraded) meta.degraded = true;

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
              metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('content_extract', $2::jsonb)
        WHERE id = $3`,
      [nextBody, JSON.stringify(meta), doc.id],
    );
    await client.query("COMMIT");

    const status: ContentExtractResult["status"] = degraded
      ? "degraded"
      : outcome.method === "noop_abstract"
        ? "noop"
        : "extracted";

    const result: ContentExtractResult = {
      documentId: doc.id,
      status,
      method: outcome.method,
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
