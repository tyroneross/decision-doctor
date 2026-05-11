"use client";

// C6b — In-chat range clarifier. Wraps the RangePicker primitive.

import * as React from "react";
import { RangePicker } from "@/components/ui/RangePicker";
import { InChatActions } from "./InChatActions";
import type { ClarifierRange, ClarifierSubmission } from "./types";

export interface InChatRangePickerProps {
  widget: ClarifierRange;
  onSubmit: (s: ClarifierSubmission) => void;
  onUnsure: () => void;
  disabled?: boolean;
}

export function InChatRangePicker({
  widget,
  onSubmit,
  onUnsure,
  disabled,
}: InChatRangePickerProps) {
  const [lo, setLo] = React.useState<number>(widget.defaultLo);
  const [hi, setHi] = React.useState<number>(widget.defaultHi);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
      <RangePicker
        lo={lo}
        hi={hi}
        onChange={({ lo: nextLo, hi: nextHi }) => {
          setLo(nextLo);
          setHi(nextHi);
        }}
        min={widget.min}
        max={widget.max}
        step={widget.step ?? 1}
        label={widget.label}
        unit={widget.unit}
        hint={widget.hint}
      />
      <InChatActions
        disabled={disabled}
        onUse={() =>
          onSubmit({
            fieldId: widget.fieldId,
            display: widget.unit
              ? `${lo}–${hi} ${widget.unit}`
              : `${lo}–${hi}`,
            raw: { lo, hi },
          })
        }
        onUnsure={onUnsure}
      />
    </div>
  );
}
