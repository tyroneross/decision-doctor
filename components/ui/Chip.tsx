import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Chip — UI Guidelines v0.1.
 *
 * Tones:
 *  - default  : bg-paper text-mute border-line — unselected
 *  - selected : bg-ink text-paper border-ink — picked
 *  - unsure   : dashed border-line text-mute italic — "I'm unsure" affordance
 *
 * Per spec: 12-14px type, ~6-10px vertical padding, rounded-full.
 * Used for AHP Saaty chips, filter chips, in-chat chips.
 */
export type ChipTone = "default" | "selected" | "unsure";

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  /** Used by parent-controlled groups to set `aria-pressed`. */
  pressed?: boolean;
}

const base =
  "inline-flex items-center justify-center select-none " +
  "rounded-full px-3 py-1.5 text-[13px] font-medium leading-none " +
  "transition-[background-color,border-color,color] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const tones: Record<ChipTone, string> = {
  default: "bg-paper text-mute border border-line hover:border-ink hover:text-text",
  selected: "bg-ink text-paper border border-ink",
  unsure:
    "bg-paper text-mute border border-dashed border-line italic hover:border-ink",
};

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  function Chip({ tone = "default", pressed, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        role="button"
        aria-pressed={pressed}
        className={twMerge(base, tones[tone], className)}
        {...rest}
      />
    );
  }
);
