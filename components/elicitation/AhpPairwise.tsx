"use client";

// F-10 AHP elicitation UI — pairwise comparison of criterion importance using
// Saaty's 1–9 scale (default) or a coarsened 5-chip fallback. Mobile-first.
// Sunrise tokens only — no new design tokens introduced.
//
// Contract with the engine:
//   • Caller owns the comparisons dict keyed `${i}:${j}` (i < j).
//   • Selection emits { i, j, value } via onChange.
//   • Computed weights + CR come from runStage1bAhp() outside this component.
//
// Inconsistency UX: when CR > 0.10, surface the worstPair as a "your answers
// conflict on X vs Y" hint with a one-tap revise affordance.

import { useState } from "react";

export interface AhpCriterion {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  criteria: AhpCriterion[];
  /** Current comparisons keyed `${i}:${j}` where i < j. */
  comparisons: Record<string, number>;
  /** Inconsistency hint: when set, shows a "revise this pair" callout. */
  worstPair?: { i: number; j: number } | null;
  /** Saaty 1–9 (default) vs coarsened 5-chip mode. */
  mode?: "saaty" | "coarse";
  onChange: (
    next: Record<string, number>,
    changed: { i: number; j: number; value: number },
  ) => void;
}

// Saaty's 1–9 scale anchors.
const SAATY_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: 1, label: "Equal", hint: "Same importance" },
  { value: 3, label: "Moderate", hint: "Slightly more important" },
  { value: 5, label: "Strong", hint: "Strongly more important" },
  { value: 7, label: "Very strong", hint: "Demonstrably more important" },
  { value: 9, label: "Extreme", hint: "Absolutely more important" },
];

// Coarsened 5-chip (when Saaty's 1–9 feels too granular).
const COARSE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 5, label: "A matters much more" },
  { value: 3, label: "A matters more" },
  { value: 1, label: "Equal" },
  { value: 1 / 3, label: "B matters more" },
  { value: 1 / 5, label: "B matters much more" },
];

export function AhpPairwise({
  criteria,
  comparisons,
  worstPair,
  mode = "saaty",
  onChange,
}: Props) {
  const n = criteria.length;
  const [activeMode, setActiveMode] = useState<"saaty" | "coarse">(mode);

  // Compute the list of (i, j) pairs with i < j.
  const pairs: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push({ i, j });
  }
  const total = pairs.length;
  const answered = pairs.filter((p) => comparisons[`${p.i}:${p.j}`] !== undefined).length;
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;

  const setPair = (i: number, j: number, value: number) => {
    const next = { ...comparisons, [`${i}:${j}`]: value };
    onChange(next, { i, j, value });
  };

  return (
    <section
      aria-label="Pairwise criterion comparison (AHP)"
      className="space-y-4"
    >
      {/* HEADER + MODE TOGGLE */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold leading-snug">
            Set your weights yourself
          </h2>
          <p className="mt-1 max-w-prose text-[13px] text-ink-700">
            For each pair below, choose which criterion matters more to you and
            by how much. The math turns these into weights — and flags any
            answers that conflict.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Scale granularity"
          className="inline-flex h-9 items-center rounded-full border border-rule bg-white p-0.5 text-[12.5px] font-medium"
        >
          <button
            role="tab"
            type="button"
            aria-selected={activeMode === "saaty"}
            onClick={() => setActiveMode("saaty")}
            className={`ease-soft inline-flex h-8 items-center rounded-full px-3 ${
              activeMode === "saaty"
                ? "bg-cream-2 text-ink-900"
                : "text-ink-500 hover:text-ink-700"
            }`}
          >
            Saaty 1–9
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeMode === "coarse"}
            onClick={() => setActiveMode("coarse")}
            className={`ease-soft inline-flex h-8 items-center rounded-full px-3 ${
              activeMode === "coarse"
                ? "bg-cream-2 text-ink-900"
                : "text-ink-500 hover:text-ink-700"
            }`}
          >
            5 chips
          </button>
        </div>
      </header>

      {/* PROGRESS */}
      <div
        aria-label="Pairs answered"
        className="flex items-center gap-3 text-[12px] text-ink-500"
      >
        <span>
          {answered} / {total} pair{total === 1 ? "" : "s"}
        </span>
        <div
          className="h-1 flex-1 rounded-full bg-cream-2"
          aria-hidden
        >
          <div
            className="grad-coral h-1 rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* PAIRS */}
      <ol className="space-y-3">
        {pairs.map((p) => {
          const key = `${p.i}:${p.j}`;
          const value = comparisons[key];
          const isWorst =
            worstPair?.i === p.i && worstPair?.j === p.j;
          return (
            <li
              key={key}
              className={`rounded-2xl border bg-white p-4 ${
                isWorst ? "border-cat-cap" : "border-rule"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14.5px] font-semibold leading-snug">
                  <span>{criteria[p.i]!.label}</span>
                  <span className="mx-1.5 text-ink-500">vs</span>
                  <span>{criteria[p.j]!.label}</span>
                </p>
                {isWorst && (
                  <span className="inline-flex h-6 items-center rounded-full bg-cat-cap-bg px-2 text-[11px] font-semibold text-cat-cap-deep">
                    Conflicts with your other answers — revise?
                  </span>
                )}
              </div>
              {(criteria[p.i]!.description || criteria[p.j]!.description) && (
                <p className="mt-1 text-[12px] text-ink-500">
                  Compare on the dimension that matters more to you right now.
                </p>
              )}

              {activeMode === "saaty" ? (
                <SaatyScale
                  iLabel={criteria[p.i]!.label}
                  jLabel={criteria[p.j]!.label}
                  value={value}
                  onSelect={(v) => setPair(p.i, p.j, v)}
                />
              ) : (
                <CoarseScale
                  iLabel={criteria[p.i]!.label}
                  jLabel={criteria[p.j]!.label}
                  value={value}
                  onSelect={(v) => setPair(p.i, p.j, v)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Saaty 1–9: 9 chips spanning [1/9 ... 1 ... 9] ─────────────────────────

function SaatyScale({
  iLabel,
  jLabel,
  value,
  onSelect,
}: {
  iLabel: string;
  jLabel: string;
  value: number | undefined;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        <span>{iLabel} matters more</span>
        <span className="text-right">{jLabel} matters more</span>
      </div>
      <div className="mt-2 flex flex-wrap items-stretch gap-1.5">
        {[...SAATY_OPTIONS]
          .slice()
          .reverse()
          .map((opt) => (
            <ScaleChip
              key={`i-${opt.value}`}
              value={opt.value}
              selected={value === opt.value}
              onClick={() => onSelect(opt.value)}
              tone="i"
              label={opt.label}
              hint={opt.hint}
            />
          ))}
        <ScaleChip
          value={1}
          selected={value === 1}
          onClick={() => onSelect(1)}
          tone="eq"
          label="Equal"
          hint="Same importance"
        />
        {SAATY_OPTIONS.slice(1).map((opt) => {
          const inverted = 1 / opt.value;
          return (
            <ScaleChip
              key={`j-${opt.value}`}
              value={inverted}
              selected={typeof value === "number" && Math.abs(value - inverted) < 1e-9}
              onClick={() => onSelect(inverted)}
              tone="j"
              label={opt.label}
              hint={opt.hint}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Coarse 5-chip ─────────────────────────────────────────────────────────

function CoarseScale({
  iLabel,
  jLabel,
  value,
  onSelect,
}: {
  iLabel: string;
  jLabel: string;
  value: number | undefined;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
      {COARSE_OPTIONS.map((opt, i) => {
        const selected =
          typeof value === "number" && Math.abs(value - opt.value) < 1e-9;
        const tone =
          opt.value > 1 ? "i" : opt.value < 1 ? "j" : "eq";
        const label = opt.label
          .replace("A", iLabel)
          .replace("B", jLabel);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(opt.value)}
            aria-pressed={selected}
            className={`ease-soft inline-flex min-h-[44px] items-center justify-center rounded-xl border px-3 text-[12.5px] ${
              selected
                ? toneSelectedClass(tone)
                : "border-rule bg-white text-ink-700 hover:border-ink-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScaleChip({
  value,
  selected,
  onClick,
  tone,
  label,
  hint,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
  tone: "i" | "j" | "eq";
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${label} (${hint}, value ${value.toFixed(2)})`}
      title={`${label} — ${hint}`}
      className={`ease-soft inline-flex h-10 min-w-[44px] items-center justify-center rounded-full border px-3 text-[11.5px] font-semibold ${
        selected ? toneSelectedClass(tone) : "border-rule bg-white text-ink-700 hover:border-ink-200"
      }`}
    >
      {label}
    </button>
  );
}

function toneSelectedClass(tone: "i" | "j" | "eq"): string {
  if (tone === "i") return "border-cat-skill bg-cat-skill-bg text-cat-skill-deep";
  if (tone === "j") return "border-plum bg-plum-bg text-plum";
  return "border-ink-200 bg-cream-2 text-ink-900";
}
