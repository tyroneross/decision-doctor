"use client";

// components/qa/AskComposer.tsx — Q1: Question input bar for /app/ask.
//
// Wraps PillSearchBar with multiline maxRows=8, Q&A-specific placeholder,
// and a small "No PHI" hint below the input.

import * as React from "react";
import { PillSearchBar } from "@/components/ui/PillSearchBar";

export interface AskComposerProps {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function AskComposer({ onSubmit, disabled, autoFocus }: AskComposerProps) {
  const [value, setValue] = React.useState("");

  function handleSubmit(q: string) {
    if (!q.trim()) return;
    onSubmit(q.trim());
    setValue("");
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <PillSearchBar
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Ask about AI tools, adoption, or how to start…"
        multiline
        maxRows={8}
        disabled={disabled}
        autoFocus={autoFocus}
        ariaLabel="Ask a question about AI adoption"
        leftIcon={false}
      />
      <p className="text-[11px] leading-[16px]" style={{ color: "var(--mute)" }}>
        Do not include patient names, MRNs, or other protected health information.
      </p>
    </div>
  );
}
