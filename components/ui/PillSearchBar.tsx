"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";
import { Search, ArrowUp } from "lucide-react";
import { type BodyKind, bodyKindBadgeLabel } from "@/lib/corpus/body-kind";

export interface PillSearchSuggestion {
  id: string;
  title: string;
  kind: string;
  source?: string | null;
  bodyKind?: BodyKind | null;
}

/**
 * PillSearchBar — UI Guidelines v0.1.
 *
 *   28px radius, 1.5px ink border, bg-paper. Search icon left, send
 *   right. Anchored to the bottom of F1 home + at the foot of the chat
 *   composer.
 *
 *   Submit on Enter or send-button click, value passed via onSubmit
 *   (controlled or uncontrolled by parent).
 *
 *   `multiline` swaps the single-line input for an auto-growing textarea
 *   (1..maxRows lines, then scrolls). Shift+Enter adds a newline; Enter
 *   submits. Pill shape adapts to the expanded height. Use for chat,
 *   Q&A, and any surface where users paste paragraphs of context.
 */
export interface PillSearchBarProps {
  value?: string;
  onChange?: (next: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  /** Render the search icon on the left. Default true. */
  leftIcon?: boolean;
  /** Render the send (arrow up) button on the right. Default true. */
  sendButton?: boolean;
  /** Disable submit until value.trim().length >= minLength. Default 1. */
  minLength?: number;
  className?: string;
  /** A11y label for the input. */
  ariaLabel?: string;
  /** Disable the entire bar — used while a parent submission is in flight. */
  disabled?: boolean;
  /** Autofocus on mount — F1 home uses this. */
  autoFocus?: boolean;
  /** Enable multi-line auto-growing textarea mode. Default false (single-line). */
  multiline?: boolean;
  /** Max visible rows in multiline mode before content scrolls. Default 8. */
  maxRows?: number;
  /** Predictive suggestions shown as the user types. */
  suggestions?: PillSearchSuggestion[];
  /** Called when the user picks a predictive suggestion. */
  onSuggestionSelect?: (suggestion: PillSearchSuggestion) => void;
  /** Place suggestions above sticky bottom composers. Default below. */
  suggestionsPlacement?: "above" | "below";
  suggestionsLoading?: boolean;
}

export function PillSearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "describe a decision you're stuck on…",
  leftIcon = true,
  sendButton = true,
  minLength = 1,
  className,
  ariaLabel = "search",
  disabled,
  autoFocus,
  multiline = false,
  maxRows = 8,
  suggestions = [],
  onSuggestionSelect,
  suggestionsPlacement = "below",
  suggestionsLoading = false,
}: PillSearchBarProps) {
  const [internal, setInternal] = React.useState("");
  const isControlled = value !== undefined;
  const v = isControlled ? value : internal;
  const set = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  const canSubmit = v.trim().length >= minLength && !disabled;

  function submit() {
    if (!canSubmit) return;
    onSubmit(v.trim());
    if (!isControlled) setInternal("");
  }

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea on value change (multiline mode only).
  React.useEffect(() => {
    if (!multiline) return;
    const el = textareaRef.current;
    if (!el) return;
    // Reset so the new scrollHeight reflects current content, not prior layout.
    el.style.height = "auto";
    // 15px font-size × ~1.5 line-height ≈ 22.5px per line; clamp to maxRows.
    const lineHeight = 22;
    const maxHeight = lineHeight * maxRows;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [v, multiline, maxRows]);

  const showSuggestions = suggestions.length > 0 || suggestionsLoading;

  return (
    <div className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={twMerge(
          "flex w-full bg-paper border-[1.5px] border-ink shadow-card " +
            // pill shape works for single-line; for multi-line, the rounded
            // corners still read as pill at the top and a soft tray at the bottom.
            "rounded-[28px] pl-4 pr-1.5 " +
            (multiline ? "items-end gap-2 py-2" : "items-center gap-2 py-1.5"),
          disabled && "opacity-60",
          className
        )}
      >
        {leftIcon && (
          <Search
            size={18}
            className={twMerge(
              "text-mute shrink-0",
              // In multiline mode anchor the icon to the first line so it
              // doesn't drift up as the textarea grows.
              multiline && "mb-[5px]"
            )}
            aria-hidden
          />
        )}

        {multiline ? (
          <textarea
            ref={textareaRef}
            rows={1}
            aria-label={ariaLabel}
            placeholder={placeholder}
            value={v}
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter (or Cmd/Ctrl+Enter) adds a newline.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={disabled}
            autoFocus={autoFocus}
            className={
              "flex-1 min-w-0 resize-none bg-transparent border-0 outline-none " +
              "text-[15px] leading-[22px] text-text placeholder:text-mute " +
              "focus:ring-0 py-[5px]"
            }
          />
        ) : (
          <input
            type="text"
            aria-label={ariaLabel}
            placeholder={placeholder}
            value={v}
            onChange={(e) => set(e.target.value)}
            disabled={disabled}
            autoFocus={autoFocus}
            className={
              "flex-1 min-w-0 bg-transparent border-0 outline-none " +
              "text-[15px] text-text placeholder:text-mute " +
              "focus:ring-0"
            }
          />
        )}

        {sendButton && (
          <button
            type="submit"
            aria-label="send"
            disabled={!canSubmit}
            className={twMerge(
              "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full " +
                "transition-[background-color,color] duration-150 " +
                (canSubmit
                  ? "bg-ink text-paper hover:bg-ink/90"
                  : "bg-line text-mute cursor-not-allowed") +
                " focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20",
              // In multiline mode keep the send button pinned to the bottom
              // so it sits at the end of the textarea, not floating beside line 1.
              multiline && "self-end"
            )}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </form>

      {showSuggestions && (
        <div
          role="listbox"
          className={twMerge(
            "absolute left-0 right-0 z-40 max-h-[260px] overflow-y-auto " +
              "rounded-[12px] border border-line bg-paper shadow-card p-1",
            suggestionsPlacement === "above" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          {suggestionsLoading && suggestions.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-mute">Searching...</div>
          ) : (
            suggestions.map((suggestion) => {
              const badge = bodyKindBadgeLabel(suggestion.bodyKind);
              return (
                <button
                  key={`${suggestion.kind}:${suggestion.id}`}
                  type="button"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSuggestionSelect?.(suggestion)}
                  className={
                    "block w-full rounded-[8px] px-3 py-2 text-left " +
                    "hover:bg-line/50 focus:bg-line/50 focus:outline-none"
                  }
                >
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {suggestion.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-mute">
                    <span>{labelForSuggestionKind(suggestion.kind)}</span>
                    {suggestion.source && <span>{suggestion.source}</span>}
                    {badge && <span>{badge}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function labelForSuggestionKind(kind: string): string {
  switch (kind) {
    case "corpus":
      return "Corpus";
    case "use_case":
      return "Use case";
    case "prompt":
      return "Prompt";
    case "skill":
      return "Skill";
    case "plugin":
      return "Plugin";
    case "kb_article":
      return "Learn";
    default:
      return kind;
  }
}
