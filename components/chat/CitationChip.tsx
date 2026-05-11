"use client";

// F-11 — Inline citation chip for chat messages.
//
// Renders a compact "(1)" / "(2)" badge that opens `source_url` in a new
// tab. Designed to be inserted by a future `renderWithCitations()` helper
// that parses LLM output for citation tokens like `[[doc:<uuid>]]`. As of
// F-11 ship, the engine doesn't emit citation tokens yet — see
// docs/handover/integration-status.md for the gap. This component is
// fully wired and unit-testable; the integration is a Chat.tsx +
// engine-prompt change deferred to a follow-up.

import * as React from "react";

export interface CitationChipProps {
  /** 1-indexed citation number for human-readable bracketing. */
  index: number;
  /** Resolved corpus document URL the chip opens. */
  sourceUrl: string;
  /** Optional title for the hover tooltip. */
  title?: string;
}

export function CitationChip({ index, sourceUrl, title }: CitationChipProps) {
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={
        title ? `Citation ${index}: ${title}` : `Citation ${index}`
      }
      className="inline-flex items-baseline align-baseline rounded-md bg-line/60 px-1.5 py-px text-[11px] font-medium leading-none text-ink/80 hover:bg-ink hover:text-paper transition-colors"
    >
      [{index}]
    </a>
  );
}

export interface Citation {
  doc_id: string;
  source_url: string;
  title?: string;
}

/**
 * Render text that may contain `[[doc:<uuid>]]` tokens. Each token is
 * replaced with a numbered CitationChip pointing at the matching
 * citation's source_url. Tokens with no matching citation are left as
 * raw text.
 *
 * Pure function (returns React.ReactNode[]); safe to call inside any
 * memoized message renderer.
 */
export function renderWithCitations(
  text: string,
  citations: Citation[],
): React.ReactNode[] {
  if (!text || citations.length === 0) return [text];
  const byId = new Map(citations.map((c) => [c.doc_id, c] as const));
  const order: Citation[] = [];
  const indexOf = (c: Citation) => {
    const found = order.indexOf(c);
    if (found >= 0) return found + 1;
    order.push(c);
    return order.length;
  };
  const pattern = /\[\[doc:([0-9a-f-]{36})\]\]/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    nodes.push(text.slice(last, m.index));
    const docId = m[1]!;
    const cite = byId.get(docId);
    if (cite) {
      nodes.push(
        <CitationChip
          key={`${docId}-${m.index}`}
          index={indexOf(cite)}
          sourceUrl={cite.source_url}
          title={cite.title}
        />,
      );
    } else {
      nodes.push(m[0]);
    }
    last = pattern.lastIndex;
  }
  nodes.push(text.slice(last));
  return nodes;
}
