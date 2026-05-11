// Unit tests for the generalized sitemap-adapter parser helpers.
// Network-free + DB-free — tests the parsing primitives that runSitemapAdapter()
// composes. Adapter end-to-end behavior is exercised by the existing
// anthropic-sitemap path via integration.

import { describe, it, expect } from "vitest";
import {
  parseUrlset,
  parseSitemapIndex,
  deriveSlug,
} from "../src/adapters/sitemap-adapter.js";

const FLAT = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/news/post-one</loc>
    <lastmod>2026-05-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/docs/intro</loc>
    <lastmod>2026-05-08</lastmod>
  </url>
  <url>
    <loc>https://example.com/blog/no-lastmod</loc>
  </url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;

describe("sitemap-adapter parsers", () => {
  it("parseUrlset returns loc + lastmod entries", () => {
    const entries = parseUrlset(FLAT);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      loc: "https://example.com/news/post-one",
      lastmod: "2026-05-01",
    });
    expect(entries[2]).toEqual({
      loc: "https://example.com/blog/no-lastmod",
      lastmod: null,
    });
  });

  it("parseUrlset returns [] on malformed XML", () => {
    expect(parseUrlset("")).toEqual([]);
    expect(parseUrlset("<urlset></urlset>")).toEqual([]);
  });

  it("parseSitemapIndex returns child sitemap URLs", () => {
    const children = parseSitemapIndex(INDEX);
    expect(children).toEqual([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
    ]);
  });

  it("parseSitemapIndex returns [] on flat urlset", () => {
    expect(parseSitemapIndex(FLAT)).toEqual([]);
  });
});

describe("deriveSlug", () => {
  it("returns path segment trimmed of slashes", () => {
    expect(deriveSlug("https://www.anthropic.com/news/claude-4")).toBe("news/claude-4");
    expect(deriveSlug("https://platform.claude.com/docs/en/build-with-claude")).toBe(
      "docs/en/build-with-claude",
    );
    expect(deriveSlug("https://mistral.ai/news/codestral-25-01")).toBe(
      "news/codestral-25-01",
    );
  });

  it("strips configured prefix when present (anthropic legacy slug shape)", () => {
    expect(deriveSlug("https://www.anthropic.com/news/claude-4", "news/")).toBe("claude-4");
    expect(
      deriveSlug("https://www.anthropic.com/news/model-context-protocol", "news/"),
    ).toBe("model-context-protocol");
  });

  it("falls back to full path when prefix absent", () => {
    expect(deriveSlug("https://www.anthropic.com/research/whitepaper", "news/")).toBe(
      "research/whitepaper",
    );
  });

  it("falls back to URL on parse failure", () => {
    expect(deriveSlug("not a url")).toBe("not a url");
  });

  it("handles trailing slashes and root paths", () => {
    expect(deriveSlug("https://example.com/")).toBe("https://example.com/");
    expect(deriveSlug("https://example.com/a/b/")).toBe("a/b");
  });
});
