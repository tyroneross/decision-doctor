"use client";

// C6b — Form-fallback link. Renders inside the FIRST clarifier bubble of a
// thread, when the orchestrator has classified the decision into a known
// template. Lets power-users escape the conversational flow into the
// existing structured intake form (kept mounted, re-skinned in C11).
//
// Hidden when:
//   - inferredTemplateId is missing (decision-type unknown yet), OR
//   - this is not the first clarifier in the thread (only first one shows it,
//     to keep the affordance discoverable but not noisy).

import * as React from "react";
import Link from "next/link";

export interface FormFallbackLinkProps {
  inferredTemplateId: "capacity" | "pricing" | "admin-hire" | null | undefined;
  isFirstClarifier?: boolean;
}

export function FormFallbackLink({
  inferredTemplateId,
  isFirstClarifier,
}: FormFallbackLinkProps) {
  if (!inferredTemplateId) return null;
  if (isFirstClarifier === false) return null;

  return (
    <p className="mt-2 text-[12px] text-mute">
      <Link
        href={`/app/decisions/new/${inferredTemplateId}`}
        className="text-text underline decoration-line underline-offset-2 hover:text-ink"
      >
        Use the survey form instead →
      </Link>
    </p>
  );
}
