"use client";

// C6b — In-chat stepper clarifier. Wraps the Stepper primitive.

import * as React from "react";
import { Stepper } from "@/components/ui/Stepper";
import { InChatActions } from "./InChatActions";
import type { ClarifierStepper, ClarifierSubmission } from "./types";

export interface InChatStepperProps {
  widget: ClarifierStepper;
  onSubmit: (s: ClarifierSubmission) => void;
  onUnsure: () => void;
  disabled?: boolean;
}

export function InChatStepper({
  widget,
  onSubmit,
  onUnsure,
  disabled,
}: InChatStepperProps) {
  const [value, setValue] = React.useState<number>(widget.defaultValue);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
      <Stepper
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
