"use client";

// components/library/UseCaseCard.tsx
//
// Card for a library_use_cases row (or a generic library item with kind prop).
// Also used as a generic card for skill/plugin rows until those get their
// own dedicated card variants.
//
// Layout:
//   Top row: kind badge (ink chip) + pain-path label (mute)
//   Title: 15px/600 ink
//   Body excerpt: 12px/400 text, 3-line clamp
//   Footer: "Save" + "Try it →" buttons (use_case/prompt), or "Open source →" (corpus)
//
// Theme discipline: var(--ink), bg-paper, border-line, text-mute only.
// No per-pain colors.

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type { LibraryKind, PainPath } from "@/lib/library";

// Label maps for display.
const KIND_LABELS: Record<LibraryKind, string> = {
  use_case: "use case",
  prompt: "prompt",
  skill: "skill",
  plugin: "plugin",
  corpus: "corpus",
};

// Map PainPath IDs to human-readable short labels for the card meta row.
const PATH_SHORT: Record<string, string> = {
  referrals: "Referrals",
  research: "Research",
  admin: "Admin",
  capacity_growth: "Capacity",
  follow_up: "Follow-up",
  custom: "Custom",
};

export interface UseCaseCardProps {
  id: string;
  kind: LibraryKind;
  title: string;
  /** Body text — will be truncated to 3 lines via line-clamp. */
  body: string;
  painPath?: PainPath;
  score?: number;
  /** External URL for corpus cards. */
  sourceUrl?: string;
  /** Called when Save is clicked. Authed-only action. */
  onSave?: (id: string) => void;
  /** Whether the current user is authenticated. Hides Save for guests. */
  isAuthed?: boolean;
}

export function UseCaseCard({
  id,
  kind,
  title,
  body,
  painPath,
  score,
  sourceUrl,
  onSave,
  isAuthed = false,
}: UseCaseCardProps) {
  const kindLabel = KIND_LABELS[kind] ?? kind;
  const pathLabel = painPath ? (PATH_SHORT[painPath] ?? painPath) : null;

  return (
    <article className="bg-paper border border-line rounded-xl p-4 flex flex-col gap-3">
      {/* Top meta row: kind badge + pain-path label + optional score dot */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Kind badge — ink-on-paper small chip */}
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none border border-ink text-ink"
            aria-label={`Kind: ${kindLabel}`}
          >
            {kindLabel}
          </span>
          {pathLabel && (
            <span className="text-[12px] text-mute">{pathLabel}</span>
          )}
        </div>
        {score !== undefined && score > 0 && (
          <span
            className="text-[11px] text-mute tabular-nums"
            aria-label={`Relevance score ${score.toFixed(2)}`}
            title={`Relevance: ${score.toFixed(4)}`}
          >
            {score.toFixed(2)}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-semibold leading-snug text-ink">
        {title}
      </h3>

      {/* Body excerpt — 3-line clamp */}
      <p
        className="text-[12px] text-text leading-relaxed line-clamp-3"
        title={body}
      >
        {body}
      </p>

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-1">
        {kind === "corpus" ? (
          sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline"
            >
              Open source
              <span aria-hidden>→</span>
            </a>
          ) : null
        ) : (
          <>
            {isAuthed && onSave && (
              <Button
                variant="secondary"
                onClick={() => onSave(id)}
                className="text-[13px] px-3 py-1.5"
                aria-label={`Save ${title}`}
              >
                Save
              </Button>
            )}
            <a
              href={`/app/recommendations/new?path=${painPath ?? "custom"}&seed_use_case=${id}`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline"
            >
              Try it
              <span aria-hidden>→</span>
            </a>
          </>
        )}
      </div>
    </article>
  );
}
