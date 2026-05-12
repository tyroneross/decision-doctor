"use client";

// components/ui/NoPhiNotice.tsx
//
// PHI guard notice — promoted from components/recommendations/NoPhiNotice.tsx
// for shared use across free-text surfaces (Chat, history/new intake, ask Q&A).
//
// Reuses the Callout primitive (bg-paper/60 border-l-[3px] border-ink).
// Pairs with lib/phi-guard.ts (server-side) and the client-side
// detectPHI hint in the intake form.
//
// Props:
//   warning — when true, renders a transient orange-variant warning
//              telling the user PHI was detected in their input.
//   reasons — optional array of detected-PHI reason strings from detectPHI().
//
// Theme tokens only. Zero per-pain Tailwind colors.

import { Callout } from "@/components/ui/Callout";

export interface NoPhiNoticeProps {
  /** When true, renders the PHI-detected warning state instead of the advisory. */
  warning?: boolean;
  /** Reasons returned by detectPHI() — shown in warning state. */
  reasons?: string[];
}

export function NoPhiNotice({ warning = false, reasons = [] }: NoPhiNoticeProps) {
  if (warning) {
    return (
      <Callout
        eyebrow="PHI detected"
        className="border-ink/60"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink)" }}>
          It looks like your description may include patient-identifiable information.
          Please rephrase using general terms — no patient names, MRNs, dates of birth,
          or specific clinical details.
        </p>
        {reasons.length > 0 && (
          <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
            {reasons.map((r, i) => (
              <li key={i} className="text-[12px]" style={{ color: "var(--mute)" }}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </Callout>
    );
  }

  return (
    <Callout eyebrow="Privacy reminder">
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--mute)" }}>
        Don&rsquo;t include patient names, MRNs, dates of birth, or specific clinical
        details. Aida processes general descriptions of your workflow
        challenges, not patient data.
      </p>
    </Callout>
  );
}
