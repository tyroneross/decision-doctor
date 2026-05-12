"use client";

// components/qa/SaveResponseButton.tsx
//
// Pin an /app/ask answer to the user's library as a saved_response. Placed
// next to the CitationList on each completed assistant turn. Authed-only —
// guests see a sign-in hint instead.

import * as React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { QACitation } from "@/components/qa/CitationList";

export interface SaveResponseButtonProps {
  question: string;
  answer: string;
  citations: QACitation[];
  wasGrounded: boolean;
  isAuthed: boolean;
}

type Status = "idle" | "saving" | "saved" | "error";

export function SaveResponseButton({
  question,
  answer,
  citations,
  wasGrounded,
  isAuthed,
}: SaveResponseButtonProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 1800);
    return () => clearTimeout(t);
  }, [status]);

  if (!isAuthed) {
    return (
      <span className="text-[12px] text-mute">
        <a href="/sign-in" className="text-ink font-medium hover:underline">
          Sign in
        </a>{" "}
        to save responses
      </span>
    );
  }

  // Empty answer = nothing to save.
  if (!answer.trim()) {
    return null;
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/library/saved-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          answer,
          citations,
          wasGrounded,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(data.error ?? "Save failed");
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch {
      setErrorMessage("Network error");
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-ok">
        <BookmarkCheck size={14} aria-hidden />
        Saved to library
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={status === "saving"}
        className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-[6px] text-[12px] font-medium text-ink hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Save this response to your library"
      >
        <Bookmark size={14} aria-hidden />
        {status === "saving" ? "Saving…" : "Save to library"}
      </button>
      {status === "error" && errorMessage && (
        <span className="text-[12px] text-warn" role="status">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
