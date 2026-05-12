"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import type { KbArticleFull } from "@/lib/kb";

export interface ArticleViewProps {
  article: KbArticleFull;
}

/**
 * Article detail view. Renders markdown via an in-house parser to avoid
 * adding a runtime dependency. The parser supports H1-H4, paragraphs,
 * ordered/unordered lists (single-level), fenced code blocks, inline
 * code, bold, and italic. Output is React nodes — no
 * dangerouslySetInnerHTML, so XSS via markdown content is structurally
 * prevented for our seed content.
 *
 * If richer markdown (tables, nested lists, footnotes, callouts) ships
 * later, swap to `react-markdown` — this component is the only swap site.
 */
export function ArticleView({ article }: ArticleViewProps) {
  return (
    <article>
      <div className="mb-6">
        <Link
          href="/app/learn"
          className="inline-flex items-center gap-1 text-[12px] text-mute hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden />
          All articles
        </Link>
      </div>
      <header className="mb-6 pb-4 border-b border-line">
        <h1 className="text-[22px] font-bold text-ink leading-tight mb-2">
          {article.title}
        </h1>
        {article.reading_minutes ? (
          <p className="inline-flex items-center gap-1 text-[12px] text-mute">
            <Clock size={12} aria-hidden />
            {article.reading_minutes} min read
          </p>
        ) : null}
      </header>
      <div className="prose prose-sm max-w-none">
        <Markdown source={article.body} />
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------------
// Minimal markdown → React renderer.
// ----------------------------------------------------------------------------

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string | null; content: string }
  | { kind: "hr" }
  | { kind: "blockquote"; text: string };

function parseMarkdown(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Blank line → skip
    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = trimmed.match(/^```(\S*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || null;
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test((lines[i] ?? "").trim())) {
        contentLines.push(lines[i] ?? "");
        i++;
      }
      // Skip closing fence if present.
      if (i < lines.length) i++;
      blocks.push({ kind: "code", lang, content: contentLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(trimmed) || /^\*\*\*+\s*$/.test(trimmed)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length as 1 | 2 | 3 | 4;
      const text = headingMatch[2]!.trim();
      blocks.push({ kind: "heading", level, text });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        if (!/^>\s?/.test(t)) break;
        quoteLines.push(t.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        const m = t.match(/^[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!);
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        const m = t.match(/^\d+\.\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!);
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — consume contiguous non-blank, non-special lines.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const t = (lines[i] ?? "").trim();
      if (
        t === "" ||
        /^#{1,4}\s/.test(t) ||
        /^```/.test(t) ||
        /^---+$/.test(t) ||
        /^[-*+]\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^>\s/.test(t)
      )
        break;
      paraLines.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "paragraph", text: paraLines.join(" ").trim() });
  }
  return blocks;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`, [text](url).
 * Returns a stable array of React nodes. No HTML injection.
 */
function renderInline(text: string): React.ReactNode[] {
  // Split on a single regex capturing each marker. Order matters: longest
  // tokens first so ** is not eaten by *.
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  const out: React.ReactNode[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    if (!tok) continue;
    if (tok.startsWith("**") && tok.endsWith("**")) {
      out.push(
        <strong key={idx} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      out.push(
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-line/40 text-[12px] font-mono text-ink"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
      out.push(
        <em key={idx} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    } else {
      const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const url = linkMatch[2]!;
        // External links open new tab; internal /app/... links stay in app.
        const external = /^https?:\/\//.test(url);
        out.push(
          <a
            key={idx}
            href={url}
            className="text-ink underline decoration-line hover:decoration-ink"
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer noopener" : undefined}
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        out.push(tok);
      }
    }
  }
  return out;
}

function Markdown({ source }: { source: string }) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  return (
    <>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "heading": {
            const sizes: Record<1 | 2 | 3 | 4, string> = {
              1: "text-[20px] font-bold text-ink mt-6 mb-3",
              2: "text-[17px] font-bold text-ink mt-6 mb-2",
              3: "text-[15px] font-semibold text-ink mt-5 mb-2",
              4: "text-[14px] font-semibold text-ink mt-4 mb-2",
            };
            const cls = sizes[b.level];
            if (b.level === 1)
              return (
                <h1 key={idx} className={cls}>
                  {renderInline(b.text)}
                </h1>
              );
            if (b.level === 2)
              return (
                <h2 key={idx} className={cls}>
                  {renderInline(b.text)}
                </h2>
              );
            if (b.level === 3)
              return (
                <h3 key={idx} className={cls}>
                  {renderInline(b.text)}
                </h3>
              );
            return (
              <h4 key={idx} className={cls}>
                {renderInline(b.text)}
              </h4>
            );
          }
          case "paragraph":
            return (
              <p
                key={idx}
                className="text-[14px] leading-relaxed text-text mb-3"
              >
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={idx}
                className="list-disc list-outside pl-5 mb-3 space-y-1 text-[14px] text-text"
              >
                {b.items.map((it, j) => (
                  <li key={j} className="leading-relaxed">
                    {renderInline(it)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={idx}
                className="list-decimal list-outside pl-5 mb-3 space-y-1 text-[14px] text-text"
              >
                {b.items.map((it, j) => (
                  <li key={j} className="leading-relaxed">
                    {renderInline(it)}
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="my-4 p-3 rounded-md bg-line/40 overflow-x-auto text-[12px] font-mono text-ink"
              >
                <code>{b.content}</code>
              </pre>
            );
          case "hr":
            return <hr key={idx} className="my-6 border-line" />;
          case "blockquote":
            return (
              <blockquote
                key={idx}
                className="my-3 pl-4 border-l-2 border-line text-mute italic text-[14px]"
              >
                {renderInline(b.text)}
              </blockquote>
            );
        }
      })}
    </>
  );
}
