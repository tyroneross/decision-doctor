"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Single-section disclosure primitive used on the custom-challenge kickoff
 * to hide explainer content (Privacy / First-Advice / Starter-Assets) for
 * returning users while keeping it discoverable for first-timers.
 *
 * Triangle marker: ▸ collapsed / ▾ expanded.
 * aria-expanded reflects open state; aria-controls links to the content panel.
 *
 * Default-open is determined by the caller (first-visit cookie). Inside the
 * component we track only the local toggle state — the cookie write is owned
 * by the parent.
 */
export interface CollapsibleSectionProps {
  /** Single-line summary shown both collapsed and expanded (in the header). */
  title: string;
  /** Short "what's in here" line shown only when collapsed. */
  summary?: string;
  /** Default open state. Cookie-driven from parent. */
  defaultOpen?: boolean;
  /** Stable id used for aria-controls. */
  id: string;
  /** Optional eyebrow above the title (e.g. "PRIVACY REMINDER"). */
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  id,
  eyebrow,
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = `${id}-panel`;
  const headerId = `${id}-header`;

  return (
    <section
      className={twMerge(
        "rounded-xl border border-line bg-paper",
        className,
      )}
      aria-labelledby={headerId}
    >
      <button
        type="button"
        id={headerId}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={twMerge(
          "flex w-full items-start gap-3 px-4 py-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
          "min-h-[44px] sm:min-h-[40px]", // touch target
        )}
      >
        <span
          aria-hidden
          className="mt-[2px] inline-block text-[12px] text-mute"
        >
          {open ? "▾" : "▸"}
        </span>
        <div className="flex-1 space-y-0.5">
          {eyebrow && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-mute">
              {eyebrow}
            </p>
          )}
          <p className="text-[14px] font-semibold leading-snug text-ink">
            {title}
          </p>
          {!open && summary && (
            <p className="text-[12px] leading-relaxed text-mute">{summary}</p>
          )}
        </div>
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
