"use client";

// components/SearchScopeToggle.tsx — Track A: hard toggle between Focused / Broad.
//
// Design (calm-precision):
//   - One pill, two states. Click flips. No dropdown, no menu.
//   - Selected state uses font-weight + 2px bottom border, not background pill
//     (nav-state rule from CLAUDE.md).
//   - 24px desktop touch target satisfied; tabbable; aria-pressed reflects state.
//   - Adjacent helper text names the active scope plainly.
//
// State comes from useSearchScope(); click delegates to setScope() which handles
// optimistic + server roundtrip.

import * as React from "react";
import { useSearchScope, type SearchScope } from "@/lib/search-scope/context";
import { clsx } from "clsx";

export interface SearchScopeToggleProps {
  /** Optional className for outer wrapper. */
  className?: string;
  /** When true, render a compact variant (icons-only label hidden on small screens). */
  compact?: boolean;
}

const LABELS: Record<SearchScope, string> = {
  focused: "Focused (Adoption)",
  broad: "Broad (All AI)",
};

const HELP: Record<SearchScope, string> = {
  focused:
    "Search is limited to AI-adoption content curated for solo practice.",
  broad: "Search includes all AI research alongside adoption content.",
};

export function SearchScopeToggle({
  className,
  compact = false,
}: SearchScopeToggleProps) {
  const { scope, setScope, isLoaded } = useSearchScope();

  const handleClick = React.useCallback(() => {
    const next: SearchScope = scope === "focused" ? "broad" : "focused";
    void setScope(next);
  }, [scope, setScope]);

  return (
    <div
      className={clsx("flex items-center gap-2", className)}
      data-testid="search-scope-toggle"
    >
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={scope === "broad"}
        aria-label={`Search scope: ${LABELS[scope]}. Click to switch to ${
          scope === "focused" ? LABELS.broad : LABELS.focused
        }.`}
        disabled={!isLoaded}
        className={clsx(
          "inline-flex items-center gap-1 px-1 py-0.5 text-sm transition",
          // Selected-state rule: weight + 2px bottom border. No pill background.
          "border-b-2",
          scope === "focused"
            ? "text-gray-900 font-medium border-gray-900"
            : "text-gray-700 font-medium border-gray-700",
          // Hover / focus
          "hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400",
          !isLoaded && "opacity-60 cursor-wait",
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "h-2 w-2 rounded-full",
            scope === "focused" ? "bg-gray-900" : "bg-gray-400",
          )}
        />
        {compact ? <span className="sr-only">{LABELS[scope]}</span> : LABELS[scope]}
      </button>
      {!compact ? (
        <span className="text-xs text-gray-500" aria-live="polite">
          {HELP[scope]}
        </span>
      ) : null}
    </div>
  );
}
