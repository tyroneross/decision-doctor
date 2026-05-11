"use client";

// components/promotion/PromoteFlow.tsx
//
// Wraps AdoptionPathwayPicker. Owns the loading / error / success state
// when a rung is selected by the user.
//
// On promote: POST to /api/library/promote.
// On quality-gate failure (422): render structured diagnostics.
// On success: confirmation + deep link to /app/skills.
//
// Theme tokens only. Zero per-pain Tailwind colors.

import { useState } from "react";
import Link from "next/link";
import type { AdoptionPathway, AdoptionPathwayRung } from "@/lib/engine/types";
import { AdoptionPathwayPicker } from "@/components/promotion/AdoptionPathwayPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface QualityGateDiagnostic {
  passed: false;
  blockers: string[];
  warnings: string[];
}

interface PromoteSuccessResponse {
  skill?: { id: string; title: string };
  plugin?: { id: string; title: string };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FlowState =
  | { stage: "idle" }
  | { stage: "generating"; rung: AdoptionPathwayRung }
  | { stage: "success"; artifactId: string; artifactTitle: string; kind: string }
  | { stage: "quality_gate_failed"; blockers: string[]; warnings: string[]; rung: AdoptionPathwayRung }
  | { stage: "error"; message: string; rung: AdoptionPathwayRung };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PromoteFlowProps {
  adoptionPathway: AdoptionPathway;
  recommendationId: string;
  painPath: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromoteFlow({
  adoptionPathway,
  recommendationId,
  painPath,
}: PromoteFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>({ stage: "idle" });

  async function handlePromote(rung: AdoptionPathwayRung) {
    setFlowState({ stage: "generating", rung });

    try {
      const res = await fetch("/api/library/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: rung.kind === "checklist" ? "prompt" : rung.kind === "agent" ? "plugin" : rung.kind,
          recommendationId,
          painPath,
          payload: rung.builderHandoff.seed,
        }),
      });

      if (res.status === 422) {
        // Quality gate failure — structured diagnostics.
        const data = (await res.json()) as {
          error: string;
          diagnostics?: QualityGateDiagnostic;
        };
        const diag = data.diagnostics;
        setFlowState({
          stage: "quality_gate_failed",
          blockers: diag?.blockers ?? ["Artifact did not pass quality checks."],
          warnings: diag?.warnings ?? [],
          rung,
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        setFlowState({
          stage: "error",
          message: (data.error as string | undefined) ?? `Unexpected error (${res.status})`,
          rung,
        });
        return;
      }

      const data = (await res.json()) as PromoteSuccessResponse;
      const artifact = data.skill ?? data.plugin;
      setFlowState({
        stage: "success",
        artifactId: artifact?.id ?? "",
        artifactTitle: artifact?.title ?? rung.label,
        kind: data.skill ? "skill" : "plugin",
      });
    } catch (err) {
      setFlowState({
        stage: "error",
        message: err instanceof Error ? err.message : "Network error — please try again.",
        rung: flowState.stage !== "idle" ? (flowState as { rung: AdoptionPathwayRung }).rung : (adoptionPathway[0] as AdoptionPathwayRung),
      });
    }
  }

  function handleReset() {
    setFlowState({ stage: "idle" });
  }

  // ---- Generating skeleton ----
  if (flowState.stage === "generating") {
    return (
      <Card className="space-y-4 py-6">
        <div className="flex items-center gap-3">
          <GeneratingSpinner />
          <div>
            <p
              className="text-[15px] font-semibold"
              style={{ color: "var(--ink)" }}
            >
              Generating your {flowState.rung.kind}&hellip;
            </p>
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              The builder bridge is running. This typically takes 3&ndash;10
              seconds.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="text-[13px]"
        >
          Cancel
        </Button>
      </Card>
    );
  }

  // ---- Quality gate failure ----
  if (flowState.stage === "quality_gate_failed") {
    return (
      <Card className="space-y-4">
        <div>
          <p
            className="text-[15px] font-semibold"
            style={{ color: "var(--ink)" }}
          >
            Quality check didn&apos;t pass
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--mute)" }}>
            The generated artifact needs a few fixes before it can be saved.
          </p>
        </div>

        {flowState.blockers.length > 0 && (
          <div>
            <p
              className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--ink)" }}
            >
              Must fix
            </p>
            <ul className="space-y-1">
              {flowState.blockers.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13.5px]"
                  style={{ color: "var(--ink)" }}
                >
                  <span aria-hidden style={{ color: "var(--mute)" }}>
                    &mdash;
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {flowState.warnings.length > 0 && (
          <div>
            <p
              className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--mute)" }}
            >
              Warnings
            </p>
            <ul className="space-y-1">
              {flowState.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px]"
                  style={{ color: "var(--mute)" }}
                >
                  <span aria-hidden>&ndash;</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            onClick={() => handlePromote(flowState.rung)}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={handleReset}>
            Edit manually
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Error ----
  if (flowState.stage === "error") {
    return (
      <Card className="space-y-3">
        <p
          className="text-[15px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Something went wrong
        </p>
        <p className="text-[13.5px]" style={{ color: "var(--mute)" }}>
          {flowState.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => handlePromote(flowState.rung)}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={handleReset}>
            Back
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Success ----
  if (flowState.stage === "success") {
    return (
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-[22px] leading-none">
            {flowState.kind === "skill" ? "🛠️" : "🧩"}
          </span>
          <div>
            <p
              className="text-[15px] font-semibold"
              style={{ color: "var(--ok)" }}
            >
              {flowState.kind === "skill" ? "Skill" : "Plugin"} saved
            </p>
            <p
              className="mt-0.5 text-[14px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              {flowState.artifactTitle}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--mute)" }}>
              It&apos;s in your skills catalog. Review and install when ready.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/skills">
            <Button variant="primary">View in catalog →</Button>
          </Link>
          <Button variant="ghost" onClick={handleReset}>
            Promote another
          </Button>
        </div>
      </Card>
    );
  }

  // ---- Idle: show picker ----
  return (
    <AdoptionPathwayPicker
      adoptionPathway={adoptionPathway}
      recommendationId={recommendationId}
      onPromote={handlePromote}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GeneratingSpinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: "var(--mute)" }}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}
