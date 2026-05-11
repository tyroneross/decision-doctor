"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";
import { Minus, Plus } from "lucide-react";

/**
 * Stepper — UI Guidelines v0.1.
 *
 *  ± ghost buttons flanking an ink-bordered center display.
 *  Center: 22/700 ink number; below: caption (label + unit + hint).
 *
 * Controlled component. Bound: min ≤ value ≤ max.
 */
export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Inline unit suffix on the value (e.g. "hrs/wk"). */
  unit?: string;
  /** Label rendered above. */
  label?: string;
  /** Hint shown beneath the number. */
  hint?: string;
  className?: string;
  /** Aria label fallback when no visible label is set. */
  ariaLabel?: string;
}

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  label,
  hint,
  className,
  ariaLabel,
}: StepperProps) {
  const decDisabled = value - step < min;
  const incDisabled = value + step > max;

  return (
    <div className={twMerge("inline-flex flex-col items-center gap-1", className)}>
      {label && (
        <span className="text-[12px] font-medium text-mute">{label}</span>
      )}
      <div className="inline-flex items-stretch gap-2">
        <button
          type="button"
          aria-label="decrement"
          disabled={decDisabled}
          onClick={() => onChange(Math.max(min, value - step))}
          className={
            "inline-flex items-center justify-center w-9 h-9 rounded-[10px] " +
            "text-ink hover:bg-line/40 disabled:opacity-30 disabled:cursor-not-allowed " +
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          }
        >
          <Minus size={16} />
        </button>
        <div
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={Number.isFinite(min) ? min : undefined}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-label={ariaLabel ?? label}
          className={
            "min-w-[88px] inline-flex items-baseline justify-center gap-1 " +
            "px-3 py-1.5 rounded-[10px] border-2 border-ink bg-paper " +
            "text-ink text-[22px] font-bold leading-none tabular-nums"
          }
        >
          <span>{value}</span>
          {unit && (
            <span className="text-[13px] font-medium text-mute">{unit}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="increment"
          disabled={incDisabled}
          onClick={() => onChange(Math.min(max, value + step))}
          className={
            "inline-flex items-center justify-center w-9 h-9 rounded-[10px] " +
            "text-ink hover:bg-line/40 disabled:opacity-30 disabled:cursor-not-allowed " +
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          }
        >
          <Plus size={16} />
        </button>
      </div>
      {hint && <span className="text-[12px] text-mute">{hint}</span>}
    </div>
  );
}
