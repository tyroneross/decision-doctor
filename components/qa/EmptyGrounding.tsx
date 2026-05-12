"use client";

// components/qa/EmptyGrounding.tsx — Q1: Empty-grounding state for /app/ask.
//
// Shown when the synthesizer returns wasGrounded=false (retrieval returned
// fewer than 2 relevant hits or all hits scored below the relevance floor).
// Surfaces actionable suggestions rather than a dead end.

import * as React from "react";

export interface EmptyGroundingProps {
  question?: string;
}

const SUGGESTIONS = [
  'Ask about a specific AI tool (e.g. "scheduling automation", "note drafting")',
  'Describe the workflow you want to improve (e.g. "patient follow-up reminders")',
  "Browse the library for curated use cases and prompts",
  "Try a shorter or more specific question",
];

export function EmptyGrounding({ question }: EmptyGroundingProps) {
  return (
    <div
      className="w-full rounded-[12px] p-5 flex flex-col gap-3"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
    >
      <div className="flex flex-col gap-1">
        <p
          className="text-[15px] font-medium leading-[22px]"
          style={{ color: "var(--ink)" }}
        >
          Aida doesn&apos;t have grounded sources for that yet.
        </p>
        {question && (
          <p className="text-[13px] leading-[18px]" style={{ color: "var(--mute)" }}>
            &ldquo;{question.length > 100 ? question.slice(0, 100) + "…" : question}&rdquo;
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p
          className="text-[12px] font-medium uppercase tracking-wide"
          style={{ color: "var(--mute)" }}
        >
          Try instead
        </p>
        <ul className="flex flex-col gap-1 list-none p-0 m-0">
          {SUGGESTIONS.map((s, i) => (
            <li
              key={i}
              className="text-[13px] leading-[19px] pl-3"
              style={{
                color: "var(--ink)",
                borderLeft: "2px solid var(--line)",
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] leading-[17px]" style={{ color: "var(--mute)" }}>
        The library grows with each session. Content that isn&apos;t covered today may be available soon.
      </p>
    </div>
  );
}
