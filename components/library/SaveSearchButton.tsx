"use client";

// components/library/SaveSearchButton.tsx
//
// Tiny inline action placed beside the "Only my content" toggle on the
// library page. Captures the current search state (query + filters +
// onlyMine) and pins it as a saved search. Authed-only — guests see a
// sign-in hint instead.

import * as React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SaveSearchButtonProps {
  /** Current search query text. */
  query: string;
  /** Current kind filter values. */
  kindFilter: string[];
  /** Current path filter values. */
  pathFilter: string[];
  /** Current onlyMine toggle. */
  onlyMine: boolean;
  /** Authed actors can save; guests see a sign-in hint. */
  isAuthed: boolean;
  /** Notified when a save completes so the parent can refresh the strip. */
  onSaved?: () => void;
}

type Status = "idle" | "naming" | "saving" | "saved" | "error";

export function SaveSearchButton({
  query,
  kindFilter,
  pathFilter,
  onlyMine,
  isAuthed,
  onSaved,
}: SaveSearchButtonProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [name, setName] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (status === "naming") {
      // Focus the inline name input on open.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [status]);

  // Auto-fade "saved" pill back to idle after 1.6s so the affordance stays
  // available for back-to-back saves.
  React.useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 1600);
    return () => clearTimeout(t);
  }, [status]);

  if (!isAuthed) {
    return (
      <span className="text-[12px] text-mute">
        <a href="/sign-in" className="text-ink font-medium hover:underline">
          Sign in
        </a>{" "}
        to save searches
      </span>
    );
  }

  async function performSave(label: string | null) {
    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/library/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          kindFilter,
          pathFilter,
          onlyMine,
          name: label,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(data.error ?? "Save failed");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setName("");
      onSaved?.();
    } catch {
      setErrorMessage("Network error");
      setStatus("error");
    }
  }

  function handleStartNaming() {
    // No query AND filters all-default AND not onlyMine → nothing meaningful
    // to save; show a soft hint instead of pinging the API with empty state.
    const isFiltered =
      query.trim().length > 0 ||
      (kindFilter.length > 0 && !kindFilter.includes("all")) ||
      (pathFilter.length > 0 && !pathFilter.includes("all")) ||
      onlyMine;
    if (!isFiltered) {
      setErrorMessage("Run a search first, then save it.");
      setStatus("error");
      // Auto-clear the inline error after 2s.
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage(null);
      }, 2000);
      return;
    }
    setStatus("naming");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    void performSave(trimmed.length > 0 ? trimmed : null);
  }

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-ok">
        <BookmarkCheck size={14} aria-hidden />
        Saved
      </span>
    );
  }

  if (status === "naming" || status === "saving") {
    return (
      <form
        onSubmit={handleSubmit}
        className="inline-flex items-center gap-2"
        aria-label="Name this search"
      >
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional name"
          maxLength={120}
          disabled={status === "saving"}
          className="rounded-[8px] border border-line bg-paper px-2.5 py-[6px] text-[13px] leading-none text-text focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={status === "saving"}
          className="text-[12px] px-3 py-[6px]"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setStatus("idle");
            setName("");
          }}
          disabled={status === "saving"}
          className="text-[12px] px-2 py-[6px]"
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleStartNaming}
        className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-[6px] text-[12px] font-medium text-ink hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
        aria-label="Save this search"
      >
        <Bookmark size={14} aria-hidden />
        Save this search
      </button>
      {status === "error" && errorMessage && (
        <span className="text-[12px] text-warn" role="status">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
