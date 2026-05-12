"use client";

// components/library/FilterChips.tsx
//
// Renders a scrollable row of filter chips. Each chip is a toggle.
// Multi-select within a row, AND across rows.
//
// Used twice on the library page:
//   - Kind filter: "All" | "Use cases" | "Prompts" | "Skills" | "Plugins" | "Corpus"
//   - Pain-path filter: "All" + the 6 pain path labels from PAIN_PATHS.
//
// Selected chip: bg-ink text-paper (via Chip tone="selected").
// Unselected chip: bg-paper border-line text-mute (via Chip tone="default").

import * as React from "react";
import { Chip } from "@/components/ui/Chip";

export interface FilterChipOption {
  /** Machine-readable value passed to onChange. */
  value: string;
  /** Human-readable label shown on the chip. */
  label: string;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  /** Currently selected values. Empty array or ["all"] means all selected. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Accessible label for the chip group. */
  ariaLabel?: string;
  /** Per-chip Tailwind classes — e.g. `max-w-[180px] truncate` for long
   *  pain-path labels. Falls through `Chip`'s twMerge so callers can
   *  override base styling. */
  chipClassName?: string;
}

/**
 * FilterChips — a row of toggleable Chip primitives.
 *
 * Special "all" value: selecting "all" deselects every specific value;
 * selecting any specific value deselects "all". Single "all" active means
 * no filter is applied for this dimension.
 */
export function FilterChips({
  options,
  selected,
  onChange,
  ariaLabel,
  chipClassName,
}: FilterChipsProps) {
  const selectedSet = new Set(selected);
  const isAllActive =
    selected.length === 0 ||
    (selected.length === 1 && selected[0] === "all");

  function handleClick(value: string) {
    if (value === "all") {
      onChange(["all"]);
      return;
    }
    // Toggle this value.
    if (selectedSet.has(value)) {
      const next = selected.filter((v) => v !== value);
      // If nothing left, fall back to "all".
      onChange(next.length === 0 || next.every((v) => v === "all") ? ["all"] : next.filter((v) => v !== "all"));
    } else {
      // Add this value; remove "all" sentinel.
      const next = [...selected.filter((v) => v !== "all"), value];
      onChange(next);
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2"
    >
      {options.map((opt) => {
        const isSelected =
          opt.value === "all" ? isAllActive : selectedSet.has(opt.value);
        return (
          <Chip
            key={opt.value}
            tone={isSelected ? "selected" : "default"}
            pressed={isSelected}
            onClick={() => handleClick(opt.value)}
            aria-pressed={isSelected}
            title={opt.label}
            className={chipClassName}
          >
            {opt.label}
          </Chip>
        );
      })}
    </div>
  );
}
