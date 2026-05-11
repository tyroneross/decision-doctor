// Tests for the generic RSS 2.0 adapter.
// Validates the XML parser against a canned OpenAI feed shape. Does NOT hit
// the network — tests are fully deterministic.

import { describe, it, expect } from "vitest";
import { parseRssItems } from "../src/adapters/rss.js";

const SAMPLE_OPENAI_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>OpenAI News</title>
    <description>The OpenAI blog</description>
    <link>https://openai.com/news</link>
    <item>
      <title>Running Codex safely at OpenAI</title>
      <link>https://openai.com/index/running-codex-safely</link>
      <guid isPermaLink="false">https://openai.com/index/running-codex-safely</guid>
      <pubDate>Fri, 08 May 2026 12:30:00 GMT</pubDate>
      <description><![CDATA[How OpenAI runs Codex securely with sandboxing.]]></description>
      <category>Security</category>
      <category>Engineering</category>
    </item>
    <item>
      <title>Scaling Trusted Access</title>
      <link>https://openai.com/index/gpt-5-5-trusted-access</link>
      <guid>https://openai.com/index/gpt-5-5-trusted-access</guid>
      <pubDate>Thu, 07 May 2026 13:00:00 GMT</pubDate>
      <description><![CDATA[GPT-5.5 expands Trusted Access for Cyber.]]></description>
      <category>Product</category>
    </item>
  </channel>
</rss>`;

describe("RSS parser", () => {
  it("parses RSS 2.0 items with title, link, guid, pubDate", () => {
    const items = parseRssItems(SAMPLE_OPENAI_RSS);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("Running Codex safely at OpenAI");
    expect(items[0]!.link).toBe(
      "https://openai.com/index/running-codex-safely",
    );
    expect(items[0]!.guid).toBe(
      "https://openai.com/index/running-codex-safely",
    );
    expect(items[0]!.pubDate).toBe("Fri, 08 May 2026 12:30:00 GMT");
  });

  it("decodes CDATA-wrapped descriptions and strips HTML", () => {
    const items = parseRssItems(SAMPLE_OPENAI_RSS);
    expect(items[0]!.description).toBe(
      "How OpenAI runs Codex securely with sandboxing.",
    );
    expect(items[0]!.description).not.toContain("CDATA");
  });

  it("captures all <category> tags per item", () => {
    const items = parseRssItems(SAMPLE_OPENAI_RSS);
    expect(items[0]!.categories).toEqual(["Security", "Engineering"]);
    expect(items[1]!.categories).toEqual(["Product"]);
  });

  it("returns empty array on malformed/empty XML", () => {
    expect(parseRssItems("")).toEqual([]);
    expect(parseRssItems("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("skips items missing title or link", () => {
    const malformed = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.com/x</link></item>
    </channel></rss>`;
    expect(parseRssItems(malformed)).toEqual([]);
  });
});
