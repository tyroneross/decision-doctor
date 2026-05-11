import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Pill — UI Guidelines v0.1.
 *
 * Tones (deliberately small palette — color carries meaning ONLY here):
 *  - ok   : bg-ok/12 text-ok — hours-saved + audit "keep" verdicts
 *  - bad  : bg-red-50 text-red-700 — audit "retire" verdict only
 *  - ink  : bg-paper text-ink border-ink — neutral status / count
 *  - mute : bg-paper text-mute border-line — secondary tag
 *
 * Small, rounded-full, 12px type. Never used for category or confidence-
 * band labeling per the strict ink-only rule.
 */
export type PillTone = "ok" | "bad" | "ink" | "mute";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

const tones: Record<PillTone, string> = {
  // Use rgba directly so the tint is consistent across themes (the --ok
  // var is a single hex; we want a 12% mix without depending on
  // arbitrary tailwind opacity for arbitrary colors).
  ok: "bg-[rgba(21,128,61,0.10)] text-ok",
  bad: "bg-red-50 text-red-700",
  ink: "bg-paper text-ink border border-ink",
  mute: "bg-paper text-mute border border-line",
};

export function Pill({ tone = "mute", className, ...rest }: PillProps) {
  return (
    <span
      className={twMerge(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 " +
          "text-[12px] font-medium leading-tight whitespace-nowrap",
        tones[tone],
        className
      )}
      {...rest}
    />
  );
}
