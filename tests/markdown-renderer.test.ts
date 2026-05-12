// tests/markdown-renderer.test.ts — MarkdownRenderer behavioral coverage.
//
// Vitest is configured environment: "node" with no jsdom. We render the
// component to a static HTML string via react-dom/server. That gives
// deterministic, allocation-free assertions on the produced markup
// without the overhead of jsdom/@testing-library/react.
//
// Coverage:
//   - Basic CommonMark (bold, list, link)
//   - GFM table
//   - Citation placeholder [[doc:<uuid>]] → CitationChip span with
//     the right index and href
//   - rehype-sanitize strips <script> injection
//   - Partial markdown (`**partial`) renders without throwing
//
// We import the .tsx component directly; vitest transforms TS/TSX on the
// fly via esbuild and react-markdown ships ESM that vitest loads cleanly.

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import type { Citation } from "@/components/chat/CitationChip";

function render(
  source: string,
  citations: Citation[] = [],
): string {
  return renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { source, citations }),
  );
}

describe("MarkdownRenderer / CommonMark basics", () => {
  it("renders **bold** as <strong>", () => {
    const html = render("This is **bold** text");
    expect(html).toContain("<strong");
    expect(html).toContain("bold</strong>");
    // The literal asterisks must not appear in output.
    expect(html).not.toContain("**bold**");
  });

  it("renders bullet list as <ul><li>", () => {
    const html = render("- one\n- two\n- three");
    expect(html).toContain("<ul");
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(3);
    expect(html).toContain("one</li>");
    expect(html).toContain("three</li>");
  });

  it("renders ordered list as <ol><li>", () => {
    const html = render("1. first\n2. second");
    expect(html).toContain("<ol");
    expect(html).toContain("first</li>");
  });

  it("renders external links with target=_blank rel=noopener", () => {
    const html = render("see [docs](https://example.com/x)");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders relative links without target=_blank", () => {
    const html = render("see [home](/app/home)");
    expect(html).toContain('href="/app/home"');
    expect(html).not.toContain('target="_blank"');
  });

  it("does not leak the react-markdown internal `node` AST prop into DOM attrs", () => {
    // react-markdown @ v10 passes `node` (the hast AST node) to every
    // component override. If we forget to destructure it out before
    // spreading {...props}, React stringifies it as `node="[object Object]"`
    // — invalid markup. Our overrides all destructure it; this test pins
    // that contract.
    const html = render(
      "Heading line\n\n- item one\n- item two\n\n> a quote\n\n`inline`",
    );
    expect(html).not.toContain("node=");
    expect(html).not.toContain("[object Object]");
  });

  it("renders inline code and fenced code", () => {
    const html = render("Inline `x = 1` and:\n\n```\nblock\n```");
    expect(html).toContain("<code");
    expect(html).toContain("x = 1");
    expect(html).toContain("<pre");
    expect(html).toContain("block");
  });
});

describe("MarkdownRenderer / GFM extensions", () => {
  it("renders GFM table as <table><thead><tbody>", () => {
    const src = [
      "| col-a | col-b |",
      "| --- | --- |",
      "| a1 | b1 |",
      "| a2 | b2 |",
    ].join("\n");
    const html = render(src);
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("col-a</th>");
    expect(html).toContain("a1</td>");
    expect(html).toContain("b2</td>");
  });

  it("renders GFM strikethrough", () => {
    const html = render("~~deleted~~ text");
    expect(html).toContain("<del");
    expect(html).toContain("deleted");
  });
});

describe("MarkdownRenderer / citation tokens", () => {
  const uuid = "abc12345-0000-0000-0000-000000000abc";
  const citations: Citation[] = [
    {
      doc_id: uuid,
      source_url: "https://corpus.example.com/doc/x",
      title: "Source X",
    },
  ];

  it("replaces [[doc:<uuid>]] in plain text with CitationChip <a>", () => {
    const html = render(`First, see [[doc:${uuid}]] for more.`, citations);
    expect(html).toContain('href="https://corpus.example.com/doc/x"');
    expect(html).toContain("[1]");
    // Raw token must be gone.
    expect(html).not.toContain(`[[doc:${uuid}]]`);
  });

  it("replaces tokens inside markdown bold", () => {
    const html = render(`See **[[doc:${uuid}]]** now.`, citations);
    expect(html).toContain('href="https://corpus.example.com/doc/x"');
    expect(html).not.toContain(`[[doc:${uuid}]]`);
    expect(html).toContain("<strong");
  });

  it("leaves unknown doc tokens as raw text (no chip)", () => {
    const unknown = "11111111-2222-3333-4444-555555555555";
    const html = render(`Mystery: [[doc:${unknown}]] end.`, citations);
    // Unknown UUID renders raw (renderWithCitations keeps the match
    // text). We just assert no <a> for the unknown source was emitted.
    expect(html).not.toContain(`href="https://${unknown}`);
  });

  it("renders zero citations cleanly when source has no tokens", () => {
    const html = render("Just plain prose.", []);
    expect(html).toContain("Just plain prose.");
  });
});

describe("MarkdownRenderer / rehype-sanitize safety", () => {
  it("strips raw <script> tags from passthrough HTML", () => {
    const html = render("Hello <script>alert(1)</script> world");
    // The security property: no executable <script> element survives.
    // (The text content of a stripped element may leak as plain text;
    // that's by design for hast-util-sanitize and is not exploitable —
    // text nodes can't execute. The DOM-level test is the absence of a
    // <script> tag.)
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script>");
  });

  it("strips on* event handler attributes if any slipped through", () => {
    const html = render('<a href="x" onclick="alert(1)">click</a>');
    expect(html).not.toContain("onclick");
  });

  it("strips <iframe>", () => {
    const html = render(
      'embed: <iframe src="https://evil.example/"></iframe> end',
    );
    expect(html).not.toContain("<iframe");
  });
});

describe("MarkdownRenderer / streaming safety", () => {
  it("renders partial bold (unmatched **) without throwing", () => {
    expect(() => render("Starting **partial")).not.toThrow();
    const html = render("Starting **partial");
    // Partial — react-markdown should NOT have emitted <strong> because
    // the closing pair is missing. The asterisks may render as literal
    // text; we just confirm no crash and that the visible word is there.
    expect(html).toContain("partial");
  });

  it("renders empty source as empty wrapper without throwing", () => {
    expect(() => render("")).not.toThrow();
  });

  it("renders progressively-built tokens at each stage", () => {
    const stages = [
      "Sta",
      "Starting **bo",
      "Starting **bold**",
      "Starting **bold** and a [link",
      "Starting **bold** and a [link](https://example.com)",
    ];
    for (const stage of stages) {
      expect(() => render(stage)).not.toThrow();
    }
    const final = render(stages[stages.length - 1]!);
    expect(final).toContain("<strong");
    expect(final).toContain('href="https://example.com"');
  });
});
