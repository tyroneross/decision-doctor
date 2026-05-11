"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PainCard } from "./PainCard";
import type { PainPath } from "@/lib/engine/types";

/**
 * PAIN_PATHS — canonical ordered list of all 6 pain-path entries.
 * Exported for reuse by U3 library page and any other surface that
 * needs to enumerate paths.
 *
 * PRD §"Initial Pain Paths" — 5 wedge paths + custom.
 */
export interface PainPathEntry {
  pathId: PainPath;
  label: string;
  oneLineHook: string;
}

export const PAIN_PATHS: PainPathEntry[] = [
  {
    pathId: "referrals",
    label: "Grow or manage my referral network",
    oneLineHook: "Prioritize sources, draft follow-ups, manage outreach",
  },
  {
    pathId: "research",
    label: "Keep up with latest research in my specialty",
    oneLineHook: "Weekly digest, relevance ranking, evidence caveats",
  },
  {
    pathId: "admin",
    label: "Reduce administrative overload",
    oneLineHook: "Request triage, message drafts, repetitive workflow cleanup",
  },
  {
    pathId: "capacity_growth",
    label: "Plan capacity, pricing, or growth",
    oneLineHook: "Capacity-aware growth, pricing decisions, workload tradeoffs",
  },
  {
    pathId: "follow_up",
    label: "Improve follow-up consistency",
    oneLineHook: "Follow-up checklists, reminder categories, unresolved tasks",
  },
  {
    pathId: "custom",
    label: "Add my own challenge",
    oneLineHook: "Describe a pain point — we'll classify and find the best fit",
  },
];

/**
 * PainCardGrid — 6-card grid (2-col mobile, 3-col desktop).
 * Each card navigates to /app/recommendations/new?path=<pathId>.
 * Route ships in U2; until then, Next.js returns 404 gracefully.
 */
export function PainCardGrid() {
  const router = useRouter();

  function onCardClick(pathId: PainPath) {
    router.push(`/app/recommendations/new?path=${pathId}`);
  }

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-3 gap-3"
      role="list"
      aria-label="Pain paths"
    >
      {PAIN_PATHS.map((entry) => (
        <div key={entry.pathId} role="listitem">
          <PainCard
            pathId={entry.pathId}
            label={entry.label}
            oneLineHook={entry.oneLineHook}
            onClick={() => onCardClick(entry.pathId)}
          />
        </div>
      ))}
    </div>
  );
}
