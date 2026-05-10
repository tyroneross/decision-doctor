"use client";

import { useState } from "react";
import Link from "next/link";
import type { Decision } from "@/lib/db/schema";
import {
  categoryFor,
  confidenceBand,
  formatHrs,
  relativeDay,
  totalHoursSaved,
} from "@/lib/decision-display";

// ─── JSON-column shapes (defensive — DB types are unknown at boundary) ──

type Recommendation = {
  option: string;
  confidence: number;
  rationale: string;
};
type Alternative = {
  option: string;
  eliminatedAtStage?: 2 | 4;
  reason: string;
};
type Robust = { option: string; rationale?: string; why?: string };
type MethodTraceEntry = { stage: number; label: string; detail: string };
type WorkloadReducer = {
  type?: "prompt" | "playbook" | "skill";
  title: string;
  description: string;
  estTimeSavingHrsPerWeek?: number;
  artifact?: {
    promptText?: string;
    playbookSteps?: string[];
    skillName?: string;
  };
};

// ─── Component ──────────────────────────────────────────────────────────

export function RecommendationView({ row }: { row: Decision }) {
  const rec = (row.recommendation as Recommendation | null) ?? null;
  const alternatives = (row.alternatives as Alternative[] | null) ?? [];
  const robust = (row.robustAlternative as Robust | null) ?? null;
  const trace = (row.methodTrace as MethodTraceEntry[] | null) ?? [];
  const reducers = (row.workloadReducers as WorkloadReducer[] | null) ?? [];

  if (!rec) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Decision incomplete</h1>
        <p className="text-sm text-ink-500">
          The engine did not return a recommendation. Status: {row.status}.
        </p>
      </section>
    );
  }

  const cat = categoryFor(row.templateId);
  const band = confidenceBand(rec.confidence);
  const hoursBack = totalHoursSaved(reducers);
  const topReducer = reducers[0];
  const thisWeek = reducers.slice(0, 3);
  const robustReason = robust?.why ?? robust?.rationale ?? "";

  return (
    <article className="space-y-6">
      {/* BREADCRUMB + TOP ACTIONS */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1.5 text-[13px] text-ink-500"
        >
          <Link href="/app/decisions" className="hover:text-ink-700">
            History
          </Link>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.fg}`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${cat.stripe}`}
            />
            {cat.label}
          </span>
          <span>·</span>
          <span>{relativeDay(row.createdAt)}</span>
        </nav>
        <div className="flex items-center gap-1">
          <PrintButton />
        </div>
      </div>

      {/* PYRAMID TIER 1 — TIME-SAVED HERO */}
      <section
        aria-label="Recommendation"
        className="grad-coral relative overflow-hidden rounded-3xl p-7 text-white sm:p-9"
      >
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white opacity-15 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-white opacity-10 blur-2xl"
        />
        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-8 md:items-center">
          <div className="md:col-span-7">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] opacity-80 sm:text-[12px]">
              What we built · primary outcome
            </p>
            {hoursBack > 0 ? (
              <>
                <p className="mt-3 text-[44px] font-semibold leading-[.95] tracking-tight sm:text-[56px] md:text-[64px]">
                  🕐 {formatHrs(hoursBack)}/wk back
                </p>
                <p className="mt-3 max-w-xl text-[16px] leading-snug opacity-95 sm:text-[18px]">
                  {rec.option}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">
                {rec.option}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[12px] font-semibold backdrop-blur">
                {band.icon} {band.label} · {rec.confidence}%
              </span>
              {robust && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[12px] font-semibold backdrop-blur">
                  🛡️ Reversal point built in
                </span>
              )}
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="rounded-2xl bg-white/15 p-5 backdrop-blur">
              <p className="text-[11px] uppercase tracking-wider opacity-80">
                In plain language
              </p>
              <p className="mt-2 text-[14.5px] leading-relaxed sm:text-[15.5px]">
                {rec.rationale}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PYRAMID TIER 2 — 3 MECE SUPPORTING CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        {/* MECE 1 — Skill ready (PRIMARY card, teal accent) */}
        {topReducer ? (
          <article className="relative overflow-hidden rounded-2xl border-2 border-cat-skill bg-white p-6">
            <div
              aria-hidden
              className="grad-skill absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-15 blur-2xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="grad-skill inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[.14em] text-white">
                  🛠️ Skill ready
                </span>
                <span className="text-[11px] font-semibold text-cat-skill-deep">
                  ~1 min to ship
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold leading-snug">
                {topReducer.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
                {topReducer.description}
              </p>
              {topReducer.artifact?.promptText && (
                <CopyPromptButton text={topReducer.artifact.promptText} />
              )}
              {topReducer.estTimeSavingHrsPerWeek && (
                <p className="mt-3 text-[11.5px] text-ink-500">
                  Saves ~{formatHrs(topReducer.estTimeSavingHrsPerWeek)}/week
                </p>
              )}
            </div>
          </article>
        ) : (
          <article className="rounded-2xl border border-dashed border-rule bg-cream-2/40 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-500">
              🛠️ Skill ready
            </p>
            <p className="mt-3 text-[14px] text-ink-500">
              No starter skill was generated for this decision.
            </p>
          </article>
        )}

        {/* MECE 2 — What changes */}
        <article className="rounded-2xl border border-rule bg-white p-6">
          <span
            className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[.14em] ${cat.bg} ${cat.fg}`}
          >
            🎯 What changes
          </span>
          <h3 className="mt-3 text-lg font-semibold leading-snug">
            ~{formatHrs(hoursBack)}/wk recovered
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
            {rec.rationale}
          </p>
          <ul className="mt-4 space-y-1.5 text-[13.5px]">
            <li className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${cat.stripe}`}
              />
              <span>
                {reducers.length} {reducers.length === 1 ? "skill" : "skills"} to ship this week
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${cat.stripe}`}
              />
              <span>
                {alternatives.filter((a) => a.eliminatedAtStage === 2).length > 0
                  ? `${alternatives.filter((a) => a.eliminatedAtStage === 2).length} path${alternatives.filter((a) => a.eliminatedAtStage === 2).length === 1 ? "" : "s"} ruled out by your hard constraints`
                  : `Compared against ${alternatives.length} alternative${alternatives.length === 1 ? "" : "s"}`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${cat.stripe}`}
              />
              <span>Robust fallback queued — see card 3</span>
            </li>
          </ul>
        </article>

        {/* MECE 3 — If this stops working */}
        <article className="rounded-2xl border border-rule bg-white p-6">
          <span className="inline-flex h-7 items-center rounded-full bg-plum-bg px-2.5 text-[11px] font-semibold uppercase tracking-[.14em] text-plum">
            🛡️ If this stops working
          </span>
          {robust ? (
            <>
              <h3 className="mt-3 text-lg font-semibold leading-snug">
                {robust.option}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
                {robustReason || "Switch to this path if conditions shift."}
              </p>
              <ul className="mt-4 space-y-1.5 text-[13.5px]">
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-plum"
                  />
                  <span>Lower regret if the goal weakens</span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-plum"
                  />
                  <span>Calendared revisit recommended</span>
                </li>
              </ul>
            </>
          ) : (
            <p className="mt-3 text-[14px] text-ink-500">
              No robust alternative — the engine couldn't surface a strong
              fallback. Re-run with revised priorities if conditions change.
            </p>
          )}
        </article>
      </div>

      {/* THIS WEEK — bento mini-cards (Miller-friendly: ≤3) */}
      {thisWeek.length > 0 && (
        <section className="rounded-2xl border border-rule bg-cream-2 p-5 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-500">
                This week
              </p>
              <h3 className="mt-0.5 text-lg font-semibold">
                {thisWeek.length} thing{thisWeek.length === 1 ? "" : "s"} to actually do
              </h3>
            </div>
            <span className="text-[12px] text-ink-500">
              ~{thisWeek.length * 15} min total
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {thisWeek.map((r, i) => (
              <li
                key={i}
                className="ease-soft lift rounded-2xl border border-rule bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <span className="text-[22px]" aria-hidden>
                    {r.type === "playbook" ? "📋" : r.type === "skill" ? "🛠️" : "📝"}
                  </span>
                  <span className="grad-skill rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white">
                    ~{formatHrs(r.estTimeSavingHrsPerWeek ?? 0)}/wk
                  </span>
                </div>
                <p className="mt-3 text-[14.5px] font-semibold leading-snug">
                  {r.title}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                  {r.description}
                </p>
                {r.artifact?.promptText ? (
                  <CopyPromptButton
                    text={r.artifact.promptText}
                    variant="compact"
                  />
                ) : r.artifact?.playbookSteps ? (
                  <details className="mt-3">
                    <summary className="ease-soft inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-rule bg-white text-[13px] font-semibold hover:border-cat-cap [&::-webkit-details-marker]:hidden">
                      Open playbook
                    </summary>
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[12px] text-ink-700">
                      {r.artifact.playbookSteps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PAIRED PATHS — anti-nudge framing */}
      {robust && (
        <section className="rounded-2xl border border-rule bg-white p-6 sm:p-7">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-500">
                Two paths the math supports
              </p>
              <h3 className="mt-0.5 text-lg font-semibold">
                You choose. Both clear your constraints.
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <article
              className={`relative rounded-xl border-2 ${cat.bg} p-5`}
              style={{ borderColor: cat.hex }}
            >
              <span
                className="absolute -top-2.5 left-4 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white"
                style={{ backgroundColor: cat.hex }}
              >
                Higher upside · selected
              </span>
              <p className={`mt-1 text-[11.5px] font-semibold uppercase tracking-wider ${cat.fg}`}>
                Path A
              </p>
              <h4 className="mt-1.5 text-[16px] font-semibold leading-snug">
                {rec.option}
              </h4>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                +~{formatHrs(hoursBack)}/wk back · {band.label.toLowerCase()} ({rec.confidence}%)
              </p>
            </article>
            <article className="rounded-xl border border-rule bg-white p-5">
              <span className="rounded-full bg-plum-bg px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-plum">
                Lower regret
              </span>
              <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-wider text-ink-500">
                Path B
              </p>
              <h4 className="mt-1.5 text-[16px] font-semibold leading-snug">
                {robust.option}
              </h4>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                {robustReason || "Lower-regret alternative if conditions shift."}
              </p>
            </article>
          </div>
        </section>
      )}

      {/* SHOW THE MATH — disclosure */}
      <ShowTheMath
        confidence={rec.confidence}
        alternatives={alternatives}
        trace={trace}
      />

      {/* PRIMARY-VS-SECONDARY framing */}
      <div className="rounded-2xl border border-rule bg-cream-2 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-cat-cap-deep">
              Primary path
            </p>
            <p className="mt-1.5 text-[14.5px] font-semibold">
              Find where AI saves you time
            </p>
            <p className="mt-1 text-[13px] text-ink-700">
              This decision shipped {reducers.length} starter skill{reducers.length === 1 ? "" : "s"}.
              More drains? Run another decision and stack the time-back.
            </p>
            <Link
              href="/app/chat"
              className="ease-soft mt-2 inline-flex items-center gap-1 text-[13.5px] font-semibold text-coral hover:gap-2"
            >
              Find another drain →
            </Link>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-plum">
              Secondary path
            </p>
            <p className="mt-1.5 text-[14.5px] font-semibold">
              Help me decide given my constraints
            </p>
            <p className="mt-1 text-[13px] text-ink-700">
              Same engine for "should I, when, given X" decisions when AI alone
              won't solve it.
            </p>
            <Link
              href="/app/chat"
              className="ease-soft mt-2 inline-flex items-center gap-1 text-[13.5px] font-semibold text-plum hover:gap-2"
            >
              Start a decide-flow →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ease-soft inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-700 hover:bg-cream-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
      aria-label="Print or save as PDF"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print
    </button>
  );
}

function CopyPromptButton({
  text,
  variant = "full",
}: {
  text: string;
  variant?: "full" | "compact";
}) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* ignore */
      });
  };
  // Width-stable label slot so the button doesn't twitch between states.
  const compactLabel = (
    <span className="inline-flex w-[88px] items-center justify-center">
      {copied ? (
        <span className="dd-fade-up inline-flex items-center gap-1">
          <CheckIcon /> Copied
        </span>
      ) : (
        <span>Copy prompt</span>
      )}
    </span>
  );
  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={copied ? "Prompt copied to clipboard" : "Copy prompt"}
        className={
          "ease-soft mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white hover:-translate-y-0.5 " +
          (copied ? "bg-conf-strong" : "grad-coral")
        }
      >
        {compactLabel}
      </button>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={copied ? "Prompt copied to clipboard" : "Copy prompt"}
        className={
          "ease-soft inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white hover:-translate-y-0.5 " +
          (copied ? "bg-conf-strong" : "grad-skill")
        }
      >
        <span className="inline-flex w-[120px] items-center justify-center">
          {copied ? (
            <span className="dd-fade-up inline-flex items-center gap-1.5">
              <CheckIcon /> Copied to clipboard
            </span>
          ) : (
            <span>📋 Copy prompt</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          const w = window.open("", "_blank", "noopener");
          if (w) {
            w.document.write(
              `<pre style="white-space:pre-wrap;padding:24px;font:14px ui-monospace,Menlo,monospace">${escapeHtml(
                text,
              )}</pre>`,
            );
            w.document.close();
          }
        }}
        className="ease-soft inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rule bg-white text-[13px] font-semibold hover:border-cat-skill"
      >
        ▶️ Try it
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ShowTheMath({
  confidence,
  alternatives,
  trace,
}: {
  confidence: number;
  alternatives: Alternative[];
  trace: MethodTraceEntry[];
}) {
  return (
    <details className="group rounded-2xl border border-rule bg-white">
      <summary className="ease-soft flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-6 py-4 text-[14.5px] font-medium text-ink-700 hover:bg-cream-2 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="ease-soft h-4 w-4 group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-[15px] font-semibold">Show the math</span>
          <span className="hidden text-[12.5px] text-ink-500 sm:inline">
            — what we ruled out, MCDA stages, why this won
          </span>
        </div>
        <span className="text-[12px] text-ink-500">For the curious</span>
      </summary>
      <div className="space-y-5 border-t border-rule px-6 pb-6 pt-4 sm:px-7">
        {/* Plain-language explainer FIRST */}
        <div className="rounded-xl bg-cream-2 p-4 text-[13px] leading-relaxed text-ink-700">
          We compared {alternatives.length + 1} paths against your stated
          priorities. The top option scored{" "}
          <strong className="text-ink-900">{confidence}/100</strong>.
          {alternatives.filter((a) => a.eliminatedAtStage === 2).length > 0 && (
            <>
              {" "}
              {alternatives.filter((a) => a.eliminatedAtStage === 2).length}{" "}
              path{alternatives.filter((a) => a.eliminatedAtStage === 2).length ===
              1
                ? ""
                : "s"}{" "}
              failed your hard constraints (so they were dropped before
              ranking).
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-500">
                What we ruled out
              </p>
              <ul className="mt-2 space-y-2 text-[13.5px]">
                {alternatives.map((a, i) => (
                  <li key={i} className="text-ink-700">
                    <span className="font-medium text-ink-900">{a.option}</span>{" "}
                    — {a.reason}
                    {a.eliminatedAtStage && (
                      <span className="text-ink-500">
                        {" "}
                        (stage {a.eliminatedAtStage})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trace.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-500">
                How we ranked
              </p>
              <dl className="mt-2 space-y-1 text-[13px]">
                {trace.map((s, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <dt className="text-ink-500">Stage {s.stage}</dt>
                    <dd className="text-right text-ink-700">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
