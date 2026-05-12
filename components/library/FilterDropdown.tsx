"use client";

// components/library/FilterDropdown.tsx
//
// Compact multi-select dropdown replacing the two FilterChips rows on the
// library page. Built from scratch — no Headless UI, Radix, or Floating UI
// dependency (see project memory: "Build from scratch").
//
// UX:
//   - Single trigger button "Type: 2 selected" / "Path: All" — Calm Precision
//     S/N rule (one signal per dimension, not 14 chips on screen).
//   - Click opens a popover anchored to the trigger.
//   - Each option is a checkbox. "All" is a sentinel: selecting it deselects
//     every specific value; selecting any specific value deselects "All".
//   - Click outside or Esc closes. Tab/Shift-Tab move focus through items.
//   - ARIA: aria-haspopup="listbox", aria-expanded, role="listbox",
//     aria-multiselectable="true", role="option" + aria-selected per row.
//
// Mirrors FilterChips semantics so swapping the parent's chip array for the
// dropdown's options array is a one-to-one rename in LibraryPageClient.

import * as React from "react";
import { twMerge } from "tailwind-merge";
import { ChevronDown, Check } from "lucide-react";

export interface FilterDropdownOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  /** Label shown before the count/state in the trigger ("Type", "Path"). */
  label: string;
  options: FilterDropdownOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Override the auto-generated trigger summary. */
  triggerSummaryOverride?: string;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Optional id for testability / external label association. */
  id?: string;
}

/**
 * FilterDropdown — multi-select popover.
 *
 * The "all" sentinel behavior mirrors FilterChips so behavior callers don't
 * have to change: empty array or ["all"] means "all selected." Picking a
 * non-all value drops "all"; picking "all" clears specifics.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  triggerSummaryOverride,
  className,
  id,
}: FilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click + Esc.
  React.useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent | PointerEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const isAllActive =
    selected.length === 0 ||
    (selected.length === 1 && selected[0] === "all");

  function isSelected(value: string): boolean {
    return value === "all" ? isAllActive : selectedSet.has(value);
  }

  function handleToggle(value: string) {
    if (value === "all") {
      onChange(["all"]);
      return;
    }
    if (selectedSet.has(value)) {
      const next = selected.filter((v) => v !== value && v !== "all");
      onChange(next.length === 0 ? ["all"] : next);
    } else {
      const next = [...selected.filter((v) => v !== "all"), value];
      onChange(next);
    }
  }

  // Trigger summary: count of specific selected values, or "All".
  const specificSelected = options
    .filter((o) => o.value !== "all" && selectedSet.has(o.value));
  const summary =
    triggerSummaryOverride ??
    (isAllActive
      ? "All"
      : specificSelected.length === 1
        ? specificSelected[0]!.label
        : `${specificSelected.length} selected`);

  // Local ref to focus first option when opening (keyboard UX).
  const firstOptionRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (open) firstOptionRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className={twMerge("relative inline-block", className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen((v) => !v)}
        className={twMerge(
          "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-[7px]",
          "text-[13px] font-medium leading-none",
          "bg-paper text-text border border-line",
          "hover:border-ink hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20",
          "transition-[background-color,border-color,color] duration-150",
          open && "border-ink text-ink",
        )}
      >
        <span className="text-mute">{label}:</span>
        <span>{summary}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={twMerge(
            "transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className={twMerge(
            "absolute z-30 mt-1 min-w-[220px] max-w-[320px] p-1",
            "bg-paper border border-line rounded-[10px] shadow-card",
          )}
        >
          <ul className="flex flex-col gap-px list-none m-0 p-0">
            {options.map((opt, i) => {
              const selectedHere = isSelected(opt.value);
              return (
                <li key={opt.value} className="m-0 p-0">
                  <button
                    ref={i === 0 ? firstOptionRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selectedHere}
                    onClick={() => handleToggle(opt.value)}
                    className={twMerge(
                      "w-full flex items-center justify-between gap-3",
                      "px-2.5 py-2 rounded-[8px] text-left",
                      "text-[13px] leading-[18px]",
                      "text-text hover:bg-line/40",
                      selectedHere && "text-ink font-medium",
                      "focus-visible:outline-none focus-visible:bg-line/60",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    <span
                      aria-hidden
                      className={twMerge(
                        "shrink-0 w-4 h-4 rounded border flex items-center justify-center",
                        selectedHere
                          ? "bg-ink border-ink text-paper"
                          : "bg-paper border-line",
                      )}
                    >
                      {selectedHere && <Check size={11} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
