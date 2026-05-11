"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * RangePicker — UI Guidelines v0.1.
 *
 * Two-thumb range picker, custom (no new dep). Track bg-line, fill bg-ink,
 * thumbs bg-paper border-2 border-ink. Renders large lo–hi values above
 * the track.
 *
 * Implementation: stacks two <input type="range"> with pointer-events
 * controlled per-thumb so clicks land on the nearer thumb. The visible
 * track + filled segment + thumbs are absolutely-positioned overlays.
 *
 * Controlled. Bounds: min ≤ lo ≤ hi ≤ max.
 */
export interface RangePickerProps {
  lo: number;
  hi: number;
  onChange: (next: { lo: number; hi: number }) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  hint?: string;
  className?: string;
}

export function RangePicker({
  lo,
  hi,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit,
  hint,
  className,
}: RangePickerProps) {
  const span = max - min;
  const loPct = span === 0 ? 0 : ((lo - min) / span) * 100;
  const hiPct = span === 0 ? 100 : ((hi - min) / span) * 100;

  return (
    <div className={twMerge("flex flex-col gap-2 w-full", className)}>
      <div className="flex items-baseline justify-between gap-2">
        {label && (
          <span className="text-[12px] font-medium text-mute">{label}</span>
        )}
        <span className="text-[18px] font-bold leading-none text-ink tabular-nums">
          {lo}–{hi}
          {unit && (
            <span className="ml-1 text-[12px] font-medium text-mute">
              {unit}
            </span>
          )}
        </span>
      </div>

      <div className="relative h-6 w-full">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-line" />
        {/* Filled segment */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-ink"
          style={{ left: `${loPct}%`, width: `${Math.max(0, hiPct - loPct)}%` }}
        />
        {/* Lo thumb input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={`${label ?? "range"} minimum`}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), hi);
            onChange({ lo: next, hi });
          }}
          className={
            "absolute inset-0 w-full h-6 appearance-none bg-transparent " +
            "pointer-events-auto cursor-pointer " +
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 " +
            "[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full " +
            "[&::-webkit-slider-thumb]:bg-paper [&::-webkit-slider-thumb]:border-2 " +
            "[&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:shadow-card " +
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full " +
            "[&::-moz-range-thumb]:bg-paper [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink " +
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          }
          style={{ zIndex: lo > max - (span / 100) * 5 ? 5 : 4 }}
        />
        {/* Hi thumb input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label={`${label ?? "range"} maximum`}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), lo);
            onChange({ lo, hi: next });
          }}
          className={
            "absolute inset-0 w-full h-6 appearance-none bg-transparent " +
            "pointer-events-auto cursor-pointer " +
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 " +
            "[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full " +
            "[&::-webkit-slider-thumb]:bg-paper [&::-webkit-slider-thumb]:border-2 " +
            "[&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:shadow-card " +
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full " +
            "[&::-moz-range-thumb]:bg-paper [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink " +
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          }
          style={{ zIndex: 5 }}
        />
      </div>

      {hint && <span className="text-[12px] text-mute">{hint}</span>}
    </div>
  );
}
