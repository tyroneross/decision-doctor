"use client";

// components/qa/CitationList.tsx — Q1: Numbered citation list below each answer.
//
// Renders citations after streaming completes. Each entry shows a numbered
// badge, the kind badge (corpus/use_case/prompt/skill/plugin), and the title.

import * as React from "react";

export interface QACitation {
  uuid: string;
  kind: "use_case" | "prompt" | "skill" | "plugin" | "corpus";
  title: string;
}

const KIND_LABEL: Record<QACitation["kind"], string> = {
  use_case: "Use Case",
  prompt: "Prompt",
  skill: "Skill",
  plugin: "Plugin",
  corpus: "Library",
};

export interface CitationListProps {
  citations: QACitation[];
}

export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 mt-1">
      <p
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--mute)" }}
      >
        Sources
      </p>
      <ol className="flex flex-col gap-1.5 list-none p-0 m-0">
        {citations.map((c, i) => (
          <li key={c.uuid} className="flex items-start gap-2">
            <span
              className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-medium leading-none mt-[1px]"
              style={{
                background: "var(--line)",
                color: "var(--ink)",
              }}
            >
              {i + 1}
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="shrink-0 text-[11px] font-medium rounded px-1.5 py-px"
                style={{
                  background: "var(--line)",
                  color: "var(--mute)",
                }}
              >
                {KIND_LABEL[c.kind] ?? c.kind}
              </span>
              <span
                className="text-[13px] leading-[18px] truncate"
                style={{ color: "var(--ink)" }}
              >
                {c.title || c.uuid}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
