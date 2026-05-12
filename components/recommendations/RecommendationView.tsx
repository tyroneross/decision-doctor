"use client";

// components/recommendations/RecommendationView.tsx
//
// 6-tier pyramid layout for AiTaskRecommendation.
// Distinct from V1's components/recommendation/RecommendationView (which renders Decision rows).
//
// Tier 1 (HERO):    Recommended first task — eyebrow, big title, approach, success estimate.
// Tier 2 (WHY):     Plain-English rationale + method-trace supporting bullets.
// Tier 3 (STARTER): Starter solution with Copy/Use action.
// Tier 4 (TRY):     How to try it this week — numbered concrete actions.
// Tier 5 (METRIC):  Success metric + optional BaselineCapture form.
// Tier 6 (WORK):    Collapsible "show the work" — CandidateTasksList + method trace JSON.
//
// Plus: Guardrails callout, AdoptionPathwayPicker after Tier 5.
//
// Theme tokens only. Zero per-pain Tailwind colors.
// whitespace-pre-wrap on all multi-paragraph text fields.

import { useState } from "react";
import Link from "next/link";
import type { AiTaskRecommendation } from "@/lib/engine/types";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Pill } from "@/components/ui/Pill";
import { PromoteFlow } from "@/components/promotion/PromoteFlow";
import { CandidateTasksList } from "@/components/recommendations/CandidateTasksList";
import { BaselineCapture } from "@/components/recommendations/BaselineCapture";
import { splitTaskHeadline } from "@/lib/recommendations/split-headline";

// ---------------------------------------------------------------------------
// Pain path display label
// ---------------------------------------------------------------------------

const PAIN_PATH_LABELS: Record<string, string> = {
  referrals: "Referral Network",
  research: "Medical Research",
  admin: "Administrative",
  capacity_growth: "Capacity & Growth",
  follow_up: "Patient Follow-Up",
  custom: "Custom Path",
};

function painPathLabel(path: string): string {
  return PAIN_PATH_LABELS[path] ?? path;
}

// ---------------------------------------------------------------------------
// Approach labels
// ---------------------------------------------------------------------------

const APPROACH_LABELS: Record<string, string> = {
  existing_tool: "Existing Tool",
  prompt: "AI Prompt",
  checklist: "Checklist",
  sop: "Standard Operating Procedure",
  skill: "Claude Skill",
  plugin: "Claude Plugin",
  agent: "AI Agent",
  human_only: "Human-Only",
};

function approachLabel(approach: string): string {
  return APPROACH_LABELS[approach] ?? approach;
}

// ---------------------------------------------------------------------------
// Copy button sub-component
// ---------------------------------------------------------------------------

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (typeof navigator === "undefined") return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        // fallback: user can select and copy manually
      });
  }

  return (
    <Button
      variant="secondary"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : label}
    >
      <span className="inline-flex w-[80px] items-center justify-center">
        {copied ? "Copied!" : label}
      </span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecommendationViewProps {
  recommendation: AiTaskRecommendation;
  /** 'authed' = full interactive view. 'guest' = read-only, no baseline form. */
  mode: "authed" | "guest";
  /** Optional recommendation ID — needed for BaselineCapture localStorage key. */
  recommendationId?: string;
  /** Called when baseline is saved. */
  onBaselineSubmit?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendationView({
  recommendation,
  mode,
  recommendationId = "draft",
  onBaselineSubmit,
}: RecommendationViewProps) {
  const {
    selectedPainPath,
    recommendedTask,
    recommendedApproach,
    whyThisTask,
    starterSolution,
    guardrails,
    tryThisWeek,
    successMetric,
    adoptionPathway,
    confidence,
    candidateTasks,
    methodTrace,
  } = recommendation;

  return (
    <article className="space-y-8">

      {/* ── TIER 1: HERO ─────────────────────────────────────────────── */}
      <section aria-label="Recommended task">
        <p
          className="text-[12px] font-medium uppercase tracking-[0.12em]"
          style={{ color: "var(--ink)" }}
        >
          RECOMMENDED · {confidence}% · {painPathLabel(selectedPainPath)}
        </p>
        {(() => {
          const parsed = splitTaskHeadline(recommendedTask);
          return (
            <>
              <h1
                className="mt-2 text-display sm:text-display-lg tracking-tight"
                style={{ color: "var(--ink)" }}
              >
                {parsed.headline || recommendedTask}
              </h1>
              {parsed.stack.length > 0 && (
                <div
                  className="mt-3 flex flex-wrap gap-1.5"
                  title="Tools in this stack"
                  aria-label="Tools in this stack"
                >
                  {parsed.stack.map((tool) => (
                    <Pill key={tool} tone="mute">
                      {tool}
                    </Pill>
                  ))}
                </div>
              )}
              <p
                className="mt-2 text-[15px] leading-relaxed"
                style={{ color: "var(--mute)" }}
              >
                {approachLabel(recommendedApproach)}
              </p>
            </>
          );
        })()}
        {successMetric && (
          <p
            className="mt-3 inline-flex items-baseline gap-1 text-[14px] font-semibold"
            style={{ color: "var(--ok)" }}
          >
            {successMetric}
          </p>
        )}
      </section>

      {/* Guardrails — surface near top per spec */}
      {guardrails.length > 0 && (
        <Callout eyebrow="Safety notes">
          <ul className="space-y-1">
            {guardrails.map((g, i) => (
              <li
                key={i}
                className="text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--mute)" }}
              >
                {g}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {/* ── TIER 2: WHY THIS TASK ────────────────────────────────────── */}
      <section
        aria-label="Why this task"
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
      >
        <p
          className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-3"
          style={{ color: "var(--mute)" }}
        >
          Why this task first
        </p>
        <p
          className="text-[14px] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--ink)" }}
        >
          {whyThisTask}
        </p>
        {/* Supporting bullets from methodTrace top scores */}
        {methodTrace.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {methodTrace.slice(0, 3).map((entry, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px]"
                style={{ color: "var(--mute)" }}
              >
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--ink)" }}
                >
                  {entry.stage.replace(/-/g, " ")}
                </span>
                <span className="leading-relaxed">{entry.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── TIER 3: STARTER SOLUTION ─────────────────────────────────── */}
      <section
        aria-label="Starter solution"
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--mute)" }}
          >
            Starter solution · {approachLabel(recommendedApproach)}
          </p>
          <CopyButton text={starterSolution} label="Copy" />
        </div>
        <div
          className="rounded-lg border p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words"
          style={{
            borderColor: "var(--line)",
            backgroundColor: "var(--paper)",
            color: "var(--ink)",
          }}
        >
          {starterSolution}
        </div>
      </section>

      {/* ── TIER 4: HOW TO TRY IT THIS WEEK ─────────────────────────── */}
      {tryThisWeek.length > 0 && (
        <section
          aria-label="How to try it this week"
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
        >
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-3"
            style={{ color: "var(--mute)" }}
          >
            How to try it this week
          </p>
          <ol className="space-y-3">
            {tryThisWeek.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                >
                  {i + 1}
                </span>
                <p
                  className="text-[14px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--ink)" }}
                >
                  {action}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── TIER 5: SUCCESS METRIC + BASELINE ───────────────────────── */}
      <section aria-label="Success metric and baseline">
        <div
          className="rounded-xl border p-5 mb-4"
          style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
        >
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-2"
            style={{ color: "var(--mute)" }}
          >
            Success metric
          </p>
          <p
            className="text-[14px] leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--ink)" }}
          >
            {successMetric}
          </p>
        </div>
        <BaselineCapture
          recommendationId={recommendationId}
          authed={mode === "authed"}
          onSaved={onBaselineSubmit}
        />
      </section>

      {/* ── ADOPTION PATHWAY PICKER (U4) ─────────────────────────────── */}
      {mode === "authed" && (
        <section aria-label="Adoption pathway">
          <PromoteFlow
            adoptionPathway={adoptionPathway}
            recommendationId={recommendationId}
            painPath={selectedPainPath}
          />
        </section>
      )}

      {/* ── TIER 6: SHOW THE WORK ────────────────────────────────────── */}
      <details className="group rounded-xl border" style={{ borderColor: "var(--line)" }}>
        <summary
          className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-5 py-4 text-[14px] font-medium hover:bg-line/30 [&::-webkit-details-marker]:hidden"
          style={{ color: "var(--ink)" }}
        >
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 transition-transform duration-150 group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[15px] font-semibold">show the work</span>
          </div>
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            For the curious
          </span>
        </summary>

        <div
          className="space-y-6 border-t px-5 pb-6 pt-4"
          style={{ borderColor: "var(--line)" }}
        >
          {/* Candidate tasks section */}
          <CandidateTasksList
            candidates={candidateTasks}
            recommendedTaskName={recommendedTask}
          />

          {/* Method trace JSON */}
          {methodTrace.length > 0 && (
            <div>
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--mute)" }}
              >
                Method trace
              </p>
              <pre
                className="max-h-72 overflow-auto rounded-xl border p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
                style={{
                  borderColor: "var(--line)",
                  backgroundColor: "var(--paper)",
                  color: "var(--ink)",
                }}
              >
                {JSON.stringify(
                  methodTrace.map((e) => ({
                    stage: e.stage,
                    name: e.name,
                    output: e.output,
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      </details>

      {/* ── GUEST FOOTER (sign-in CTA) ───────────────────────────────── */}
      {mode === "guest" && (
        <div
          className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
        >
          <p className="flex-1 text-[13px]" style={{ color: "var(--mute)" }}>
            Sign in to save this recommendation, track progress, and promote it
            to a skill or plugin.
          </p>
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-[10px] px-4 py-[9px] text-[14px] font-semibold"
            style={{
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            Sign in to save
          </Link>
        </div>
      )}
    </article>
  );
}
