"use client";

// C6b — In-chat chip clarifier. Renders a row of Chip primitives. Selecting
// one sets local state; the user confirms via "Use this →" so the click is
// intentional.

import * as React from "react";
import { Chip } from "@/components/ui/Chip";
import { InChatActions } from "./InChatActions";
import type { ClarifierChips, ClarifierSubmission } from "./types";

export interface InChatChipsProps {
  widget: ClarifierChips;
  onSubmit: (s: ClarifierSubmission) => void;
  onUnsure: () => void;
  disabled?: boolean;
}

export function InChatChips({
  widget,
  onSubmit,
  onUnsure,
  disabled,
}: InChatChipsProps) {
  const [picked, setPicked] = React.useState<string | undefined>(
    widget.defaultValue,
  );

  const selected = widget.options.find((o) => o.value === picked);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
      {widget.label && (
        <p className="mb-2 text-[12px] font-medium text-mute">
          {widget.label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {widget.options.map((opt) => (
          <Chip
            key={opt.value}
            tone={picked === opt.value ? "selected" : "default"}
            pressed={picked === opt.value}
            onClick={() => setPicked(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
      {widget.hint && (
        <p className="mt-2 text-[12px] text-mute">{widget.hint}</p>
      )}
      <InChatActions
        disabled={disabled || !selected}
        onUse={() => {
          if (!selected) return;
          onSubmit({
            fieldId: widget.fieldId,
            display: selected.label,
            raw: selected.value,
          });
        }}
        onUnsure={onUnsure}
      />
    </div>
  );
}
