"use client";

// components/library/UniversalSearchToggle.tsx
//
// "Only my content" toggle that scopes library search to user-owned rows.
// Default = unchecked (universal search across all curated content + corpus).
// Persists state to localStorage so preference survives page refresh.
//
// Auth-gated: guests see the toggle but it is disabled with a sign-in nudge.

import * as React from "react";

const STORAGE_KEY = "dd:library:onlyMine";

export interface UniversalSearchToggleProps {
  /** Whether the user is authenticated. Guests see a disabled toggle. */
  isAuthed: boolean;
  /** Controlled value — parent can override (e.g. on page reset). */
  value?: boolean;
  /** Called when the user changes the toggle. */
  onChange: (next: boolean) => void;
}

/**
 * Reads the persisted preference from localStorage.
 * Returns false (universal) when localStorage is unavailable or unset.
 */
function readStoredValue(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function UniversalSearchToggle({
  isAuthed,
  value,
  onChange,
}: UniversalSearchToggleProps) {
  // Internal state: initialize from localStorage, then defer to parent via value.
  const [internal, setInternal] = React.useState<boolean>(false);

  // Hydrate from localStorage on mount (client-only).
  React.useEffect(() => {
    const stored = readStoredValue();
    if (stored !== internal) {
      setInternal(stored);
      onChange(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checked = value !== undefined ? value : internal;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isAuthed) return;
    const next = e.target.checked;
    setInternal(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage blocked — proceed without persistence
    }
    onChange(next);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        className="flex items-center gap-2 cursor-pointer select-none"
        htmlFor="only-mine-toggle"
      >
        <input
          id="only-mine-toggle"
          type="checkbox"
          checked={isAuthed ? checked : false}
          onChange={handleChange}
          disabled={!isAuthed}
          className="w-4 h-4 rounded border-line accent-ink disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Only my content"
        />
        <span
          className={
            "text-[14px] font-medium " +
            (isAuthed ? "text-text" : "text-mute")
          }
        >
          Only my content
        </span>
      </label>
      <span className="text-[12px] text-mute">
        {isAuthed
          ? checked
            ? "search excludes global library and corpus"
            : "searching all curated content and corpus"
          : "sign in to save content"}
      </span>
    </div>
  );
}
