"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Clock } from "lucide-react";
import type { KbArticleFull } from "@/lib/kb";

export interface ArticleViewProps {
  article: KbArticleFull;
}

/**
 * Article detail view. Renders markdown via an in-house parser to avoid
 * adding a runtime dependency. Supports H1-H4, paragraphs, lists, fenced
 * code, inline code/bold/italic/links, blockquotes, hr, and pipe tables.
 * Output is React nodes — no dangerouslySetInnerHTML.
 *
 * Long-form articles are sectioned by H2 into collapsible cards so the
 * reader can scan headings + summary before drilling in (progressive
 * disclosure). The first section is expanded by default; an "Expand all"
 * affordance is provided.
 */
export function ArticleView({ article }: ArticleViewProps) {
  const allBlocks = React.useMemo(
    () => parseMarkdown(article.body),
    [article.body],
  );

  // Strip a leading H1 that duplicates the article title (seed content
  // typically opens with the same H1 as the page header).
  const blocks = React.useMemo(() => {
    const first = allBlocks[0];
    if (
      first &&
      first.kind === "heading" &&
      first.level === 1 &&
      normalize(first.text) === normalize(article.title)
    ) {
      return allBlocks.slice(1);
    }
    return allBlocks;
  }, [allBlocks, article.title]);

  const { preamble, sections } = React.useMemo(
    () => splitIntoSections(blocks),
    [blocks],
  );

  const [expandAll, setExpandAll] = React.useState(false);

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
        <h1 className="text-h1 sm:text-h1-lg text-ink mb-2">
          {article.title}
        </h1>
        {article.reading_minutes ? (
          <p className="inline-flex items-center gap-1 text-[12px] text-mute">
            <Clock size={12} aria-hidden />
            {article.reading_minutes} min read
          </p>
        ) : null}
      </header>

      {preamble.length > 0 && (
        <div className="mb-6">
          <BlockList blocks={preamble} />
        </div>
      )}

      {sections.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
            {sections.length} {sections.length === 1 ? "section" : "sections"}
          </p>
          <button
            type="button"
            onClick={() => setExpandAll((v) => !v)}
            className="text-[12px] font-medium text-mute underline-offset-2 hover:text-ink hover:underline"
          >
            {expandAll ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sections.map((section, idx) => (
          <SectionCard
            key={idx}
            heading={section.heading}
            blocks={section.blocks}
            defaultOpen={idx === 0 || expandAll}
            // Force re-mount when expandAll flips so <details> picks up new default.
            forceKey={`${idx}-${expandAll ? "open" : "default"}`}
          />
        ))}
      </div>
    </article>
  );
}

function SectionCard({
  heading,
  blocks,
  defaultOpen,
  forceKey,
}: {
  heading: string;
  blocks: Block[];
  defaultOpen: boolean;
  forceKey: string;
}) {
  return (
    <details
      key={forceKey}
      open={defaultOpen}
      className="group rounded-xl border border-line bg-paper transition-colors open:border-ink/20"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
        <h2 className="text-[16px] font-semibold leading-snug text-ink">
          {heading}
        </h2>
        <ChevronDown
          size={16}
          aria-hidden
          className="shrink-0 text-mute transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-line/60 px-5 pt-4 pb-5">
        <BlockList blocks={blocks} />
      </div>
    </details>
  );
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitIntoSections(blocks: Block[]): {
  preamble: Block[];
  sections: { heading: string; blocks: Block[] }[];
} {
  const preamble: Block[] = [];
  const sections: { heading: string; blocks: Block[] }[] = [];
  let current: { heading: string; blocks: Block[] } | null = null;

  for (const b of blocks) {
    if (b.kind === "heading" && b.level === 2) {
      if (current) sections.push(current);
      current = { heading: b.text, blocks: [] };
      continue;
    }
    // Drop horizontal rules used as section dividers — the card border
    // already provides that separation visually.
    if (b.kind === "hr" && current) continue;
    if (current) {
      current.blocks.push(b);
    } else {
      preamble.push(b);
    }
  }
  if (current) sections.push(current);
  return { preamble, sections };
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
  | { kind: "blockquote"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

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

    // Pipe table: header row, separator row (|---|---|), then rows.
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < lines.length &&
      /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(
        (lines[i + 1] ?? "").trim(),
      )
    ) {
      const headers = splitTableRow(trimmed);
      const rows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        if (!t.startsWith("|") || !t.endsWith("|")) break;
        rows.push(splitTableRow(t));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
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
        /^>\s/.test(t) ||
        t.startsWith("|")
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

function splitTableRow(line: string): string[] {
  // Strip leading/trailing pipes, then split on remaining `|`.
  const inner = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "heading": {
            // Inside a section card, H2 has already been promoted to the
            // card title — anything left collapses one level up so the
            // visual rhythm stays tight.
            const sizes: Record<1 | 2 | 3 | 4, string> = {
              1: "text-[20px] font-bold text-ink mt-5 mb-3",
              2: "text-[17px] font-bold text-ink mt-5 mb-2",
              3: "text-[15px] font-semibold text-ink mt-4 mb-2",
              4: "text-[14px] font-semibold text-ink mt-3 mb-2",
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
                className="text-[15px] leading-[1.7] text-text mb-3"
              >
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={idx}
                className="list-disc list-outside pl-5 mb-3 space-y-1.5 text-[15px] leading-[1.7] text-text"
              >
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={idx}
                className="list-decimal list-outside pl-5 mb-3 space-y-1.5 text-[15px] leading-[1.7] text-text"
              >
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="my-4 p-3 rounded-md bg-line/40 overflow-x-auto text-[12.5px] font-mono text-ink"
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
                className="my-3 pl-4 border-l-2 border-line text-mute italic text-[14.5px] leading-[1.7]"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case "table":
            return (
              <div
                key={idx}
                className="my-4 overflow-x-auto rounded-lg border border-line"
              >
                <table className="w-full text-[13.5px] text-text">
                  <thead className="bg-line/30 text-ink">
                    <tr>
                      {b.headers.map((h, j) => (
                        <th
                          key={j}
                          className="px-3 py-2 text-left font-semibold border-b border-line"
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className="border-b border-line/60 last:border-b-0"
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-3 py-2 align-top leading-relaxed"
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
