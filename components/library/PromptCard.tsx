"use client";

// components/library/PromptCard.tsx
//
// Card variant for a library_prompts row.
// Shows instructions body, required_inputs, output_format, safety_notes.
// Primary action: "Copy prompt" copies body to clipboard.
//
// Theme discipline: var(--ink), bg-paper, border-line, text-mute only.
// No per-pain colors.

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type { PainPath } from "@/lib/library";

const PATH_SHORT: Record<string, string> = {
  referrals: "Referrals",
  research: "Research",
  admin: "Admin",
  capacity_growth: "Capacity",
  follow_up: "Follow-up",
  custom: "Custom",
};

export interface PromptCardProps {
  id: string;
  title: string;
  /** The prompt body / instructions. */
  body: string;
  /** Short human-readable description of the prompt's purpose. */
  description?: string;
  painPath?: PainPath;
  score?: number;
  /**
   * Structured metadata fields. The schema stores these in `metadata` jsonb;
   * callers may pass them when available. All optional — card degrades gracefully.
   */
  requiredInputs?: string[];
  outputFormat?: string;
  safetyNotes?: string;
  /** Called when Save is clicked. Authed-only action. */
  onSave?: (id: string) => void;
  isAuthed?: boolean;
}

export function PromptCard({
  id,
  title,
  body,
  description,
  painPath,
  score,
  requiredInputs,
  outputFormat,
  safetyNotes,
  onSave,
  isAuthed = false,
}: PromptCardProps) {
  const [copied, setCopied] = React.useState(false);
  const pathLabel = painPath ? (PATH_SHORT[painPath] ?? painPath) : null;

  function handleCopy() {
    navigator.clipboard
      .writeText(body)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard API unavailable — silent degrade.
      });
  }

  return (
    <article className="bg-paper border border-line rounded-xl p-4 flex flex-col gap-3">
      {/* Top meta row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none border border-ink text-ink">
            prompt
          </span>
          {pathLabel && (
            <span className="text-[12px] text-mute">{pathLabel}</span>
          )}
        </div>
        {score !== undefined && score > 0 && (
          <span
            className="text-[11px] text-mute tabular-nums"
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

      {/* Description (optional) */}
      {description && (
        <p className="text-[12px] text-mute leading-relaxed">{description}</p>
      )}

      {/* Prompt body — 3-line clamp */}
      <p
        className="text-[12px] text-text leading-relaxed line-clamp-3 font-mono bg-line/30 rounded-lg px-3 py-2"
        title={body}
      >
        {body}
      </p>

      {/* Optional structured metadata */}
      {requiredInputs && requiredInputs.length > 0 && (
        <div className="text-[12px] text-mute">
          <span className="font-medium text-text">Requires: </span>
          {requiredInputs.join(", ")}
        </div>
      )}
      {outputFormat && (
        <div className="text-[12px] text-mute">
          <span className="font-medium text-text">Output: </span>
          {outputFormat}
        </div>
      )}
      {safetyNotes && (
        <div className="text-[12px] text-mute">
          <span className="font-medium text-text">Safety: </span>
          {safetyNotes}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          onClick={handleCopy}
          className="text-[13px] px-3 py-1.5"
          aria-label={`Copy prompt: ${title}`}
        >
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        {isAuthed && onSave && (
          <Button
            variant="ghost"
            onClick={() => onSave(id)}
            className="text-[13px] px-3 py-1.5"
            aria-label={`Save ${title}`}
          >
            Save
          </Button>
        )}
      </div>
    </article>
  );
}
