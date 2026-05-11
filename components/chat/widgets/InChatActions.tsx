"use client";

// C6b — Action row for every clarifier widget.
//
// Primary "Use this →" submits the current value back to the orchestrator.
// Secondary "I'm unsure" routes through onUnsure — typical handler reverts
// the conversation to a free-text question for that field.

import * as React from "react";
import { Button } from "@/components/ui/Button";

export interface InChatActionsProps {
  onUse: () => void;
  onUnsure: () => void;
  /** Disable both buttons (e.g. while a submission is in flight, or while
   *  the chips widget has nothing selected). */
  disabled?: boolean;
}

export function InChatActions({ onUse, onUnsure, disabled }: InChatActionsProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      <Button
        variant="ghost"
        type="button"
        onClick={onUnsure}
        disabled={disabled}
      >
        I'm unsure
      </Button>
      <Button
        variant="primary"
        type="button"
        onClick={onUse}
        disabled={disabled}
      >
        Use this →
      </Button>
    </div>
  );
}
