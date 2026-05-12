"use client";

// components/library/SavedSearchesStrip.tsx
//
// Horizontal pinned-strip rendered above the library SearchBar when the user
// is signed in AND has any saved searches. Each chip is clickable to
// re-apply the captured query + filters. A per-chip menu surfaces Rename
// + Delete inline.
//
// Mounts at the top of LibraryPageClient. The parent owns the saved-search
// list state (so newly-saved entries appear immediately after POST) and
// passes onApply, onRename, onDelete handlers.

import * as React from "react";
import { Bookmark, MoreHorizontal, Pencil, Trash2, X, Check } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { LibrarySavedSearch } from "@/lib/library";

export interface SavedSearchesStripProps {
  /** Sorted (newest first) — parent owns ordering. */
  items: LibrarySavedSearch[];
  /** Re-apply this saved search to the current page state. */
  onApply: (item: LibrarySavedSearch) => void;
  /** Update name; receives the new name (null clears it). */
  onRename: (id: string, name: string | null) => Promise<void> | void;
  /** Delete the saved search. */
  onDelete: (id: string) => Promise<void> | void;
}

export function SavedSearchesStrip({
  items,
  onApply,
  onRename,
  onDelete,
}: SavedSearchesStripProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Saved searches"
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Bookmark size={12} aria-hidden className="text-mute" />
        <h2 className="text-h3 text-mute uppercase tracking-wide">
          Saved searches
        </h2>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="list"
      >
        {items.map((item) => (
          <SavedSearchChip
            key={item.id}
            item={item}
            onApply={() => onApply(item)}
            onRename={(name) => onRename(item.id, name)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

// ---- Chip ------------------------------------------------------------------

interface SavedSearchChipProps {
  item: LibrarySavedSearch;
  onApply: () => void;
  onRename: (name: string | null) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function SavedSearchChip({
  item,
  onApply,
  onRename,
  onDelete,
}: SavedSearchChipProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(item.name ?? "");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync local rename buffer when item changes externally.
  React.useEffect(() => {
    setRenameValue(item.name ?? "");
  }, [item.name]);

  // Close menu on outside click + Esc.
  React.useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  // Visible label fallback ladder: explicit name → query echo → "(saved search)".
  const visibleLabel =
    item.name?.trim() ||
    (item.query?.trim() ? item.query.trim() : "(saved search)");

  async function handleRenameCommit() {
    const trimmed = renameValue.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setRenaming(false);
    setMenuOpen(false);
    if (next !== (item.name ?? null)) {
      await onRename(next);
    }
  }

  if (renaming) {
    return (
      <div
        ref={rootRef}
        role="listitem"
        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-ink bg-paper px-2 py-1"
      >
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleRenameCommit();
            } else if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(item.name ?? "");
            }
          }}
          maxLength={120}
          className="bg-paper text-text text-[13px] leading-none px-1.5 py-1 outline-none min-w-[120px] max-w-[220px]"
          placeholder="(no name)"
          aria-label="Rename saved search"
        />
        <button
          type="button"
          onClick={() => void handleRenameCommit()}
          className="rounded-full p-1 text-ink hover:bg-line/60"
          aria-label="Confirm rename"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            setRenaming(false);
            setRenameValue(item.name ?? "");
          }}
          className="rounded-full p-1 text-mute hover:bg-line/60"
          aria-label="Cancel rename"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="listitem"
      className="relative shrink-0 inline-flex items-stretch"
    >
      <button
        type="button"
        onClick={onApply}
        title={item.query}
        aria-label={`Apply saved search: ${visibleLabel}`}
        className={twMerge(
          "inline-flex items-center gap-1.5 rounded-l-full border border-line border-r-0 bg-paper",
          "pl-3 pr-2 py-1 text-[13px] leading-none text-text",
          "hover:border-ink hover:text-ink transition-[border-color,color] duration-150",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20",
          "max-w-[220px]",
        )}
      >
        <Bookmark size={12} aria-hidden className="text-mute shrink-0" />
        <span className="truncate">{visibleLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Saved search options"
        className={twMerge(
          "inline-flex items-center justify-center rounded-r-full border border-line bg-paper",
          "px-2 py-1 text-mute",
          "hover:border-ink hover:text-ink transition-[border-color,color] duration-150",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20",
        )}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 z-20 min-w-[140px] p-1 bg-paper border border-line rounded-[10px] shadow-card"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setRenameValue(item.name ?? "");
              setRenaming(true);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-left text-[13px] text-text hover:bg-line/40"
          >
            <Pencil size={12} aria-hidden />
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void onDelete();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-left text-[13px] text-text hover:bg-line/40"
          >
            <Trash2 size={12} aria-hidden />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
