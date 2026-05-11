"use client";

// components/qa/AnswerStream.tsx — Q1: Streaming answer renderer.
//
// Renders tokens as they arrive with whitespace-pre-wrap break-words.
// Uses renderWithCitations() to swap [[doc:<uuid>]] tokens for CitationChip
// components as citations are received.

import * as React from "react";
import {
  renderWithCitations,
  type Citation,
} from "@/components/chat/CitationChip";

export interface AnswerStreamProps {
  tokens: string;
  citations: Citation[];
  isStreaming: boolean;
}

export function AnswerStream({ tokens, citations, isStreaming }: AnswerStreamProps) {
  const nodes = React.useMemo(
    () => renderWithCitations(tokens, citations),
    [tokens, citations],
  );

  if (!tokens && !isStreaming) return null;

  return (
    <div
      className="w-full rounded-[12px] p-4"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
    >
      <div
        className="text-[14px] leading-[22px] break-words"
        style={{
          whiteSpace: "pre-wrap",
          color: "var(--ink)",
        }}
      >
        {nodes}
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
