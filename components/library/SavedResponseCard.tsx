"use client";

// components/library/SavedResponseCard.tsx
//
// Renders a LibraryHit of kind="saved_response" as a card in the library
// results grid. Collapsed by default — shows the question + first answer
// snippet + citation count. Expanding reveals the full answer + cited
// sources.
//
// Theme discipline: ink/mute/line/paper only, mirrors UseCaseCard/PromptCard.

import * as React from "react";
import { ChevronDown, ChevronUp, MessageSquare, Trash2 } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { SavedResponsePayload } from "@/lib/library";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

export interface SavedResponseCardProps {
  id: string;
  payload: SavedResponsePayload;
  /** Notified when the user clicks Delete. Authed-only — parent must
   *  already have rendered this card for an authed actor. */
  onDelete?: (id: string) => void;
}

export function SavedResponseCard({
  id,
  payload,
  onDelete,
}: SavedResponseCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Saved at — short relative-ish format (createdAt is iso8601 from API).
  const savedAt = React.useMemo(() => {
    try {
      const d = new Date(payload.createdAt);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [payload.createdAt]);

  return (
    <article
      className={twMerge(
        "bg-paper border border-line rounded-xl p-4 flex flex-col gap-3",
        expanded && "shadow-card",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute">
        <MessageSquare size={12} aria-hidden />
        <span className="font-semibold">Saved response</span>
        {savedAt && <span aria-hidden>·</span>}
        {savedAt && <span>{savedAt}</span>}
        {!payload.wasGrounded && (
          <span className="text-warn font-medium">· no grounding</span>
        )}
      </div>

      <h3 className="text-h3 text-ink">
        {payload.question}
      </h3>

      {!expanded ? (
        <p className="text-[13px] leading-relaxed text-text line-clamp-3">
          {payload.answer.slice(0, 320).replace(/\s+/g, " ")}
          {payload.answer.length > 320 ? "…" : ""}
        </p>
      ) : (
        <MarkdownRenderer
          source={payload.answer}
          className="text-[14px] leading-[22px] text-text break-words"
        />
      )}

      {expanded && payload.citations.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-mute">
            Sources
          </p>
          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {payload.citations.map((c, i) => (
              <li
                key={`${c.uuid}-${i}`}
                className="flex items-start gap-2 text-[12px] leading-[16px] text-text"
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-medium leading-none mt-[1px] bg-line text-ink"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="truncate">
                  <span className="text-mute mr-1">{c.kind}</span>
                  {c.title || c.uuid}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 rounded"
        >
          {expanded ? (
            <>
              Hide answer
              <ChevronUp size={12} aria-hidden />
            </>
          ) : (
            <>
              Show full answer
              <ChevronDown size={12} aria-hidden />
            </>
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(id)}
            aria-label="Delete saved response"
            className="inline-flex items-center gap-1 text-[12px] text-mute hover:text-warn focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 rounded"
          >
            <Trash2 size={12} aria-hidden />
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
