"use client";

// components/ui/MarkdownRenderer.tsx — Shared markdown renderer.
//
// Pipeline:
//   ReactMarkdown
//     + remark-gfm    → tables, task lists, strikethrough, autolinks, footnotes
//     + rehype-sanitize → allowlist HTML safety (defaults + `data-citation-uuid`
//                         attribute on <span> so CitationChip nodes survive)
//
// Custom component overrides give the project its own typography while
// preserving citation tokens. Element types that wrap plain text (p, li,
// td, th, em, strong, a-text) run their string children through
// `renderWithCitations()` so `[[doc:<uuid>]]` markers in the LLM output
// still become CitationChip components.
//
// Streaming-safe: react-markdown parses partial input idempotently. We
// memoize the JSX tree by source identity so untouched segments don't
// reflow when new tokens append.
//
// Carve-out: this is one of the few project files allowed to depend on
// third-party packages (react-markdown / remark-gfm / rehype-sanitize)
// rather than build-from-scratch. Markdown + HTML sanitization is a
// security-pitfall area; rebuilding it would be multi-week, error-prone
// work. See the build brief that introduced this file.

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
  renderWithCitations,
  type Citation,
} from "@/components/chat/CitationChip";

export interface MarkdownRendererProps {
  source: string;
  citations?: Citation[];
  className?: string;
}

// Extend the default rehype-sanitize allowlist so:
//   1. `data-citation-uuid` may live on <span> (room for future CitationChip
//      data-attribute carriers without re-emitting raw HTML).
//   2. checkbox inputs from task-list items survive (GFM emits them).
// Everything else stays at the rehype-sanitize default — no <script>,
// <iframe>, <style>, <link>, <meta>, etc.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["data-citation-uuid"],
      ["className"],
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked"],
      ["disabled"],
    ],
  },
};

// ─── helpers ───────────────────────────────────────────────────────────

/**
 * Walk children, replacing any plain-string node with the result of
 * `renderWithCitations()`. Non-string nodes (already-rendered React
 * elements from nested inline markdown like **bold** or `code`) pass
 * through untouched.
 */
function renderChildrenWithCitations(
  children: React.ReactNode,
  citations: Citation[],
): React.ReactNode {
  if (citations.length === 0) return children;
  return React.Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      // renderWithCitations returns ReactNode[]; wrap in fragment so the
      // outer mapper's key still works.
      return (
        <React.Fragment key={`cit-${idx}`}>
          {renderWithCitations(child, citations)}
        </React.Fragment>
      );
    }
    return child;
  });
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
}

// ─── component ─────────────────────────────────────────────────────────

export function MarkdownRenderer({
  source,
  citations = [],
  className,
}: MarkdownRendererProps) {
  // Memoize the components map by citations identity. The map captures
  // `citations` in closures, so a stable identity = a stable map = lets
  // react-markdown's internal memoization actually kick in on token
  // updates that don't change citation set.
  const components: Components = React.useMemo(() => {
    const wrap = (children: React.ReactNode) =>
      renderChildrenWithCitations(children, citations);

    return {
      // Block text / list content — route plain-string children through
      // renderWithCitations so [[doc:uuid]] becomes a CitationChip.
      p: ({ node: _node, children, ...props }) => (
        <p
          {...props}
          className="text-[14px] leading-[22px] text-text my-2 first:mt-0 last:mb-0"
        >
          {wrap(children)}
        </p>
      ),
      li: ({ node: _node, children, ...props }) => (
        <li
          {...props}
          className="text-[14px] leading-[22px] text-text my-1"
        >
          {wrap(children)}
        </li>
      ),
      td: ({ node: _node, children, ...props }) => (
        <td
          {...props}
          className="border border-line px-2 py-1 text-[13px] text-text align-top"
        >
          {wrap(children)}
        </td>
      ),
      th: ({ node: _node, children, ...props }) => (
        <th
          {...props}
          className="border border-line px-2 py-1 text-[13px] font-semibold text-ink text-left align-top bg-line/30"
        >
          {wrap(children)}
        </th>
      ),

      // Headings — map to project-style sizes. Inside an answer we never
      // want display tier; even h1 stays modest.
      h1: ({ node: _node, children, ...props }) => (
        <h1
          {...props}
          className="text-[20px] font-semibold leading-snug text-ink mt-4 mb-2 first:mt-0"
        >
          {wrap(children)}
        </h1>
      ),
      h2: ({ node: _node, children, ...props }) => (
        <h2
          {...props}
          className="text-[17px] font-semibold leading-snug text-ink mt-4 mb-2 first:mt-0"
        >
          {wrap(children)}
        </h2>
      ),
      h3: ({ node: _node, children, ...props }) => (
        <h3
          {...props}
          className="text-[15px] font-semibold leading-snug text-ink mt-3 mb-1.5 first:mt-0"
        >
          {wrap(children)}
        </h3>
      ),

      // Lists
      ul: ({ node: _node, children, ...props }) => (
        <ul {...props} className="list-disc pl-5 my-2 space-y-0.5">
          {children}
        </ul>
      ),
      ol: ({ node: _node, children, ...props }) => (
        <ol {...props} className="list-decimal pl-5 my-2 space-y-0.5">
          {children}
        </ol>
      ),

      // Inline & block code
      code: ({ node: _node, className: cls, children, ...props }) => {
        // react-markdown @ v10: no `inline` prop. Inline vs fenced is
        // detected by whether `className` carries a `language-*` token.
        const isFenced = typeof cls === "string" && /language-/.test(cls);
        if (isFenced) {
          // Let `pre` wrap; just style the inner <code>.
          return (
            <code
              {...props}
              className={`${cls ?? ""} font-mono text-[13px] text-text`}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            {...props}
            className="font-mono text-[13px] bg-line/40 text-ink px-1 py-0.5 rounded"
          >
            {children}
          </code>
        );
      },
      pre: ({ node: _node, children, ...props }) => (
        <pre
          {...props}
          className="bg-line/30 border border-line rounded-lg p-3 my-2 overflow-x-auto text-[13px] font-mono leading-[20px]"
        >
          {children}
        </pre>
      ),

      // Anchors — open external in new tab w/ noopener; relative URLs as
      // plain <a> (Next.js <Link> would require server boundary checks we
      // don't need for in-answer links).
      a: ({ node: _node, children, href, ...props }) => {
        const target = href && isExternalHref(href) ? "_blank" : undefined;
        const rel =
          href && isExternalHref(href) ? "noopener noreferrer" : undefined;
        return (
          <a
            {...props}
            href={href}
            target={target}
            rel={rel}
            className="text-ink underline underline-offset-2 hover:text-ink/80"
          >
            {wrap(children)}
          </a>
        );
      },

      // Tables — wrap in overflow container so wide tables scroll on
      // narrow viewports without breaking layout.
      table: ({ node: _node, children, ...props }) => (
        <div className="my-3 overflow-x-auto">
          <table
            {...props}
            className="w-full border-collapse text-[14px] border border-line"
          >
            {children}
          </table>
        </div>
      ),

      // Blockquote
      blockquote: ({ node: _node, children, ...props }) => (
        <blockquote
          {...props}
          className="border-l-2 border-ink/40 pl-3 my-2 text-text italic"
        >
          {children}
        </blockquote>
      ),

      // Horizontal rule
      hr: ({ node: _node, ...props }) => (
        <hr {...props} className="my-4 border-t border-line" />
      ),

      // Inline emphasis — still route their string children through
      // citations because em/strong can contain `[[doc:uuid]]` if the LLM
      // bolds a citation.
      em: ({ node: _node, children, ...props }) => (
        <em {...props} className="italic">
          {wrap(children)}
        </em>
      ),
      strong: ({ node: _node, children, ...props }) => (
        <strong {...props} className="font-semibold text-ink">
          {wrap(children)}
        </strong>
      ),
    } satisfies Components;
  }, [citations]);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
