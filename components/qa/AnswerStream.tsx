"use client";

// components/qa/AnswerStream.tsx — Q1: Streaming answer renderer.
//
// Renders tokens as they arrive through the shared MarkdownRenderer
// pipeline (CommonMark + GFM + rehype-sanitize). The renderer routes
// `[[doc:<uuid>]]` placeholders in plain-text nodes through
// renderWithCitations() so citation chips still appear even though the
// answer is now parsed as markdown.
//
// Streaming safety: react-markdown handles partial input — unmatched
// `**` reads as text until the closing pair arrives. The streaming
// cursor lives OUTSIDE the rendered markdown so partial trees don't
// flicker it.

import * as React from "react";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import type { Citation } from "@/components/chat/CitationChip";

export interface AnswerStreamProps {
  tokens: string;
  citations: Citation[];
  isStreaming: boolean;
}

export function AnswerStream({ tokens, citations, isStreaming }: AnswerStreamProps) {
  if (!tokens && !isStreaming) return null;

  return (
    <div
      className="w-full rounded-[12px] p-4"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
    >
      <div className="break-words" style={{ color: "var(--ink)" }}>
        <MarkdownRenderer source={tokens} citations={citations} />
        {isStreaming && (
          <span
            className="inline-block w-[2px] h-[14px] ml-[2px] align-middle animate-pulse"
            style={{ background: "var(--mute)" }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
