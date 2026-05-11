import { describe, expect, it } from "vitest";

import {
  extractArticleText,
  shouldSkipContentExtract,
} from "../src/adapters/content-extract.js";
import {
  EXTRACTOR_VERSION,
  assessBodyQuality,
  bodyKindAllowsFullEnrichment,
  contentExtractMetadata,
  isFullTextDocument,
  sha256,
  sourcePolicy,
} from "../src/ingestion/quality.js";

describe("ingestion quality gates", () => {
  it("classifies OpenAI challenge shells as blocked", () => {
    const out = assessBodyQuality({
      sourceType: "openai-news",
      method: "cdp_rendered",
      body: "Verification successful. Waiting for openai.com to respond",
    });

    expect(out.bodyKind).toBe("blocked");
    expect(out.degraded).toBe(true);
    expect(out.qualityScore).toBe(0);
    expect(out.degradedReasons).toContain("challenge_shell");
  });

  it("classifies RSS descriptions as source summaries, not full text", () => {
    const out = assessBodyQuality({
      sourceType: "openai-news",
      method: "source_summary",
      body: "How OpenAI runs Codex securely with sandboxing, approvals, network policies, and agent-native telemetry.",
    });

    expect(out.bodyKind).toBe("source_summary");
    expect(out.degraded).toBe(false);
  });

  it("accepts real article-length static text as full text", () => {
    const article = Array.from({ length: 260 }, (_, i) =>
      i % 20 === 0 ? "Anthropic" : "article",
    ).join(" ");
    const out = assessBodyQuality({
      sourceType: "anthropic-news",
      method: "static_cheerio",
      body: article,
    });

    expect(out.bodyKind).toBe("full_text");
    expect(out.degraded).toBe(false);
    expect(out.qualityScore).toBeGreaterThanOrEqual(0.75);
  });

  it("only skips content extraction for current full-text metadata", () => {
    const body = "full text body";
    const outputHash = sha256(body);
    const metadata = {
      content_extract: {
        extractor_version: EXTRACTOR_VERSION,
        output_hash: outputHash,
        body_kind: "full_text",
        degraded: false,
      },
    };

    expect(
      shouldSkipContentExtract({ metadata, contentHash: outputHash }),
    ).toBe(true);
    expect(
      shouldSkipContentExtract({
        metadata: {
          content_extract: { ...metadata.content_extract, body_kind: "blocked" },
        },
        contentHash: outputHash,
      }),
    ).toBe(false);
    expect(
      shouldSkipContentExtract({
        metadata: {
          content_extract: { ...metadata.content_extract, output_hash: "old" },
        },
        contentHash: outputHash,
      }),
    ).toBe(false);
  });

  it("exposes the metadata contract downstream enrichment gates use", () => {
    const metadata = {
      content_extract: {
        body_kind: "full_text",
        output_hash: "abc",
        extractor_version: EXTRACTOR_VERSION,
      },
    };

    expect(contentExtractMetadata(metadata)?.body_kind).toBe("full_text");
    expect(isFullTextDocument(metadata)).toBe(true);
    expect(bodyKindAllowsFullEnrichment("full_text")).toBe(true);
    expect(bodyKindAllowsFullEnrichment("source_summary")).toBe(false);
    expect(bodyKindAllowsFullEnrichment("blocked")).toBe(false);
  });

  it("infers policy from crawl_config when no explicit policy is specified", () => {
    const docs = sourcePolicy({
      sourceType: "new-docs-source",
      sourceUrl: "https://docs.example.com/guide",
      crawlConfig: { content_type: "docs" },
    });
    const research = sourcePolicy({
      sourceType: "new-research-source",
      sourceUrl: "https://research.example.com/post",
      crawlConfig: { category: "research" },
    });

    expect(docs.profile).toBe("docs");
    expect(docs.policySource).toBe("inferred");
    expect(docs.minFullTextWords).toBe(120);
    expect(research.profile).toBe("research_article");
    expect(research.minFullTextWords).toBe(260);
  });

  it("allows crawl_config quality_policy to override inferred defaults", () => {
    const bodyWithoutMarker = Array.from({ length: 260 }, () => "article").join(" ");
    const bodyWithMarker = `${bodyWithoutMarker} Decision Doctor`;
    const crawlConfig = {
      content_type: "article",
      quality_policy: {
        min_full_text_words: "200",
        required_markers: "Decision Doctor",
      },
    };

    const missing = assessBodyQuality({
      sourceType: "custom-source",
      crawlConfig,
      method: "static_cheerio",
      body: bodyWithoutMarker,
    });
    const matched = assessBodyQuality({
      sourceType: "custom-source",
      crawlConfig,
      method: "static_cheerio",
      body: bodyWithMarker,
    });

    expect(missing.policySource).toBe("crawl_config");
    expect(missing.bodyKind).toBe("source_summary");
    expect(missing.degradedReasons).toContain("missing_source_article_markers");
    expect(matched.bodyKind).toBe("full_text");
  });

  it("extracts substantial article text from header-like containers", () => {
    const articleText = [
      "ImportantHeaderArticle",
      ...Array.from({ length: 230 }, () => "article"),
    ].join(" ");
    const html = `
      <html>
        <body>
          <nav>Home Products Pricing</nav>
          <header><h1>Title</h1><p>${articleText}</p></header>
          <footer>Footer links</footer>
        </body>
      </html>
    `;

    const extracted = extractArticleText(html);
    expect(extracted).toContain("ImportantHeaderArticle");
    expect(extracted.split(/\s+/).length).toBeGreaterThan(200);
    expect(extracted).not.toContain("Home Products Pricing");
  });
});
