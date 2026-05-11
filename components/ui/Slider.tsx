"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Slider — UI Guidelines v0.1.
 *
 * Wraps <input type="range"> with accent-color: var(--ink). Renders a
 * large value (24/700 ink + unit) above the track.
 *
 * Controlled.
 */
export interface SliderProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Inline label above. */
  label?: string;
  /** Unit suffix on the displayed value (e.g. "$/visit"). */
  unit?: string;
  /** Hint beneath the track. */
  hint?: string;
  className?: string;
  ariaLabel?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit,
  hint,
  className,
  ariaLabel,
}: SliderProps) {
  return (
    <div className={twMerge("flex flex-col gap-1 w-full", className)}>
      <div className="flex items-baseline justify-between gap-2">
        {label && (
          <span className="text-[12px] font-medium text-mute">{label}</span>
        )}
        <span className="text-[24px] font-bold leading-none text-ink tabular-nums">
          {value}
          {unit && (
            <span className="ml-1 text-[13px] font-medium text-mute">
              {unit}
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel ?? label}
        className={
          "w-full h-1.5 rounded-full appearance-none cursor-pointer " +
          "bg-line " +
          // accent-color paints the thumb + filled track in supporting browsers
          "[accent-color:var(--ink)] " +
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
        }
      />
      {hint && <span className="text-[12px] text-mute">{hint}</span>}
    </div>
  );
}
