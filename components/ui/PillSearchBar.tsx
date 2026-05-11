"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";
import { Search, ArrowUp } from "lucide-react";

/**
 * PillSearchBar — UI Guidelines v0.1.
 *
 *   28px radius, 1.5px ink border, bg-paper. Search icon left, send
 *   right. Anchored to the bottom of F1 home + at the foot of the chat
 *   composer.
 *
 *   Submit on Enter or send-button click, value passed via onSubmit
 *   (controlled or uncontrolled by parent).
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

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={twMerge(
        "flex items-center gap-2 w-full bg-paper border-[1.5px] border-ink rounded-[28px] " +
          "pl-4 pr-1.5 py-1.5 shadow-card",
        disabled && "opacity-60",
        className
      )}
    >
      {leftIcon && (
        <Search size={18} className="text-mute shrink-0" aria-hidden />
      )}
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
      {sendButton && (
        <button
          type="submit"
          aria-label="send"
          disabled={!canSubmit}
          className={
            "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full " +
            "transition-[background-color,color] duration-150 " +
            (canSubmit
              ? "bg-ink text-paper hover:bg-ink/90"
              : "bg-line text-mute cursor-not-allowed") +
            " focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          }
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
