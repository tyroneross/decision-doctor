"use client";

// C6b — In-chat slider clarifier. Wraps the Slider primitive in an
// assistant-side card with submit/unsure actions. Submission posts the
// numeric value back to the orchestrator via onSubmit.

import * as React from "react";
import { Slider } from "@/components/ui/Slider";
import { InChatActions } from "./InChatActions";
import type { ClarifierSlider, ClarifierSubmission } from "./types";

export interface InChatSliderProps {
  widget: ClarifierSlider;
  onSubmit: (s: ClarifierSubmission) => void;
  onUnsure: () => void;
  disabled?: boolean;
}

export function InChatSlider({
  widget,
  onSubmit,
  onUnsure,
  disabled,
}: InChatSliderProps) {
  const [value, setValue] = React.useState<number>(widget.defaultValue);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
      <Slider
        value={value}
        onChange={setValue}
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
            display: widget.unit ? `${value} ${widget.unit}` : String(value),
            raw: value,
          })
        }
        onUnsure={onUnsure}
      />
    </div>
  );
}
