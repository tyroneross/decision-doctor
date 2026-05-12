"use client";

// components/recommendations/CandidateTasksList.tsx
//
// Collapsible list of non-recommended candidate tasks.
// Rendered inside RecommendationView Tier 6 (Show the work).
//
// Each row shows: task name, 0-100 score (text only — no chip), and
// a one-line reason it ranked lower than the top recommendation.
//
// Theme tokens only. Zero per-pain Tailwind colors.

import { useState } from "react";
import type { CandidateTask } from "@/lib/engine/types";

export interface CandidateTasksListProps {
  /** All candidate tasks including the recommended one. The component
   *  displays only non-top candidates (index > 0 when sorted by score). */
  candidates: CandidateTask[];
  /** The task name that was recommended (used to label why others ranked lower). */
  recommendedTaskName: string;
}

export function CandidateTasksList({
  candidates,
  recommendedTaskName,
}: CandidateTasksListProps) {
  const [expanded, setExpanded] = useState(false);

  // Sort descending by score; filter out the recommended task.
  const others = [...candidates]
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.title !== recommendedTaskName);

  if (others.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No other tasks were considered. The engine surfaced one candidate.
      </p>
    );
  }

  const visible = expanded ? others : others.slice(0, 3);

  return (
    <div>
      <p
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--mute)" }}
      >
        Other tasks considered ({others.length})
      </p>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {visible.map((c) => (
          <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p
                className="text-[14px] font-medium leading-snug"
                style={{ color: "var(--ink)" }}
              >
                {c.title}
              </p>
              <span
                className="shrink-0 text-[12px] tabular-nums"
                style={{ color: "var(--mute)" }}
                aria-label={`Score: ${c.score} out of 100`}
              >
                {c.score}/100
              </span>
            </div>
            <p
              className="mt-0.5 text-[12.5px] leading-relaxed"
              style={{ color: "var(--mute)" }}
            >
              {c.description}
            </p>
            {c.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {c.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-[4px] border px-1.5 py-[1px] text-[10px] font-medium"
                    style={{ borderColor: "var(--line)", color: "var(--mute)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {others.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[13px] font-medium focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          style={{ color: "var(--ink)" }}
        >
          {expanded
            ? "Show fewer candidates"
            : `Show all ${others.length} candidates`}
        </button>
      )}
    </div>
  );
}
