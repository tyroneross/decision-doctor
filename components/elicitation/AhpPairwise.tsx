"use client";

// F-10 AHP elicitation UI — pairwise comparison of criterion importance using
// Saaty's 1–9 scale. Mobile-first. UI Guidelines v0.1 (ink-only).
//
// Contract with the engine:
//   • Caller owns the comparisons dict keyed `${i}:${j}` (i < j).
//   • Selection emits { i, j, value } via onChange.
//   • Computed weights + CR come from runStage1bAhp() outside this component.
//
// Inconsistency UX: when CR > 0.10, surface the worstPair as inline ink text
// ("Conflicts with your other answers — revise?") not a colored background pill.
//
// E4 — Interaction-state matrix (`resolveAhpPairwiseState()` in
// lib/component-state.ts is the test-covered resolver):
//
//   default   — at least 2 criteria but 0 pairs answered yet.
//   populated — partial progress (1..total-1 answered).
//   loading   — `loading=true` (rare; reserved for future server-side
//               eigenvector compute).
//   success   — all pairs answered AND `consistent=true` (CR ≤ 0.10).
//   error     — `error` truthy.
//   empty     — fewer than 2 criteria; pairwise can't run.
//
// E3 — Raw-matrix JSON disclosure: a collapsed <details> below the grid
// reveals an editable JSON view of the comparison matrix. Paste-back
// re-validates and propagates via onChange.
//
// Round-2 change (UI Guidelines v0.1):
//   • Removed coarse 5-chip mode + scale-granularity toggle (per plan §AHP D3).
//   • Replaced all V2 Sunrise palette classes (cat-*, plum, grad-coral,
//     focus-coral, ring-coral-glow, bg-cream-2, text-ink-700, border-rule)
//     with ink-only tokens (text-ink, text-mute, border-line, bg-paper).

import { useState } from "react";
import { resolveAhpPairwiseState } from "@/lib/component-state";

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
  onChange: (
    next: Record<string, number>,
    changed: { i: number; j: number; value: number },
  ) => void;
  /** E4: forces the loading variant. */
  loading?: boolean;
  /** E4: forces the error variant. */
  error?: string | null;
  /**
   * E4: when truthy AND all pairs answered, renders the success-banner
   * variant. Derived from CR ≤ 0.10 at the call site.
   */
  consistent?: boolean;
  /** E4: error retry callback. */
  onRetry?: () => void;
}

// Saaty's 1–9 scale anchors. Single canonical scale; coarse mode removed.
const SAATY_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: 1, label: "Equal", hint: "Same importance" },
  { value: 3, label: "Moderate", hint: "Slightly more important" },
  { value: 5, label: "Strong", hint: "Strongly more important" },
  { value: 7, label: "Very strong", hint: "Demonstrably more important" },
  { value: 9, label: "Extreme", hint: "Absolutely more important" },
];

export function AhpPairwise({
  criteria,
  comparisons,
  worstPair,
  onChange,
  loading = false,
  error = null,
  consistent = false,
  onRetry,
}: Props) {
  const n = criteria.length;
  // E3: raw-matrix JSON disclosure state. The textarea holds a draft of the
  // matrix as JSON; on submit we parse + validate + propagate via onChange.
  const [rawDraft, setRawDraft] = useState<string>("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawApplied, setRawApplied] = useState(false);

  // Compute the list of (i, j) pairs with i < j.
  const pairs: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push({ i, j });
  }
  const total = pairs.length;
  const answered = pairs.filter((p) => comparisons[`${p.i}:${p.j}`] !== undefined).length;
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;

  // E4: resolve the rendered state. See lib/component-state.ts for branches.
  const viewState = resolveAhpPairwiseState({
    criteriaCount: n,
    answeredCount: answered,
    totalPairs: total,
    loading,
    error,
    consistent,
  });

  const setPair = (i: number, j: number, value: number) => {
    const next = { ...comparisons, [`${i}:${j}`]: value };
    onChange(next, { i, j, value });
  };

  // E3: build the raw-matrix JSON for the disclosure. Keys are
  // `${i}:${j}` with i < j to match the engine contract.
  const rawMatrix = JSON.stringify(comparisons, null, 2);

  // E3: paste-back parses the textarea and re-emits via onChange. Validates
  // (1) JSON shape, (2) every key matches `i:j` with i < j and i,j < n,
  // (3) every value is a positive finite number. Any failure surfaces a
  // friendly error inside the disclosure; the prior state is preserved.
  const applyRawDraft = () => {
    setRawError(null);
    setRawApplied(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawDraft);
    } catch {
      setRawError("Couldn't parse — make sure it's valid JSON.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setRawError("Expected an object with `i:j` keys.");
      return;
    }
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const m = /^(\d+):(\d+)$/.exec(key);
      if (!m) {
        setRawError(`Key "${key}" is not in i:j form.`);
        return;
      }
      const i = Number(m[1]);
      const j = Number(m[2]);
      if (!(i < j) || i < 0 || j >= n) {
        setRawError(
          `Key "${key}" out of range (i must be < j and both < ${n}).`,
        );
        return;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        setRawError(`Value for "${key}" must be a positive number.`);
        return;
      }
      next[key] = value;
    }
    // Emit once via onChange so the parent's reducer state stays the source
    // of truth. Use the last-changed pair as a placeholder when we can't
    // identify a single user-changed pair.
    const keys = Object.keys(next);
    const lastKey = keys[keys.length - 1] ?? "0:1";
    const [li, lj] = lastKey.split(":").map(Number) as [number, number];
    onChange(next, { i: li, j: lj, value: next[lastKey]! });
    setRawApplied(true);
    setTimeout(() => setRawApplied(false), 1800);
  };

  // E4: short-circuit branches — empty/loading/error render the whole
  // surface; success adds a banner above the populated grid.
  if (viewState === "empty") {
    return (
      <section
        aria-label="Pairwise criterion comparison (AHP)"
        className="rounded-xl border border-dashed border-line bg-paper p-6"
        role="status"
      >
        <p className="text-[14px] font-semibold text-ink">
          Not enough criteria to compare.
        </p>
        <p className="mt-1 text-[12.5px] text-mute">
          Pairwise comparison needs at least 2 criteria. Add more in the
          previous step.
        </p>
      </section>
    );
  }
  if (viewState === "loading") {
    return (
      <section
        aria-label="Pairwise criterion comparison (AHP)"
        className="space-y-3"
        role="status"
        aria-live="polite"
      >
        <span className="skeleton block h-4 w-1/2 rounded-full" />
        <span className="skeleton block h-3 w-full rounded-full" />
        <span className="skeleton block h-20 w-full rounded-xl" />
        <span className="skeleton block h-20 w-full rounded-xl" />
        <p className="text-[12.5px] text-mute">Preparing comparisons…</p>
      </section>
    );
  }
  if (viewState === "error") {
    return (
      <section
        aria-label="Pairwise criterion comparison (AHP)"
        className="rounded-xl border border-ink bg-paper p-6"
        role="alert"
      >
        <p className="text-[14px] font-semibold text-ink">
          Couldn't load the comparison.
        </p>
        <p className="mt-1 text-[12.5px] text-mute">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-ink bg-paper px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          >
            Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Pairwise criterion comparison (AHP)"
      className="space-y-4"
    >
      {/* E4 success banner — all answered + consistent.
          Ink-only: text-ink on bg-paper with a single ink border. The
          previous V2 Sunrise version used bg-conf-strong-bg / text-conf-strong
          which violated the strict ink-only rule (color carries meaning
          ONLY on Pill `ok` for hours-saved + Pill `bad` for audit retire). */}
      {viewState === "success" && (
        <div
          className="rounded-xl border border-ink bg-paper px-4 py-3 text-[13px] font-medium text-ink"
          role="status"
        >
          ✓ Weights look consistent — you're done. Move on to compute results.
        </div>
      )}

      {/* HEADER — coarse/numeric toggle removed per plan §AHP D3. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold leading-snug text-ink">
            Set your weights yourself
          </h2>
          <p className="mt-1 max-w-prose text-[13px] text-mute">
            For each pair below, choose which criterion matters more to you and
            by how much. The math turns these into weights — and flags any
            answers that conflict.
          </p>
        </div>
      </header>

      {/* PROGRESS — ink fill on line track. No gradient. */}
      <div
        aria-label="Pairs answered"
        className="flex items-center gap-3 text-[12px] text-mute"
      >
        <span>
          {answered} / {total} pair{total === 1 ? "" : "s"}
        </span>
        <div
          className="h-1 flex-1 rounded-full bg-line"
          aria-hidden
        >
          <div
            className="h-1 rounded-full bg-ink transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* PAIRS — populated/default states (default = 0 answered, just renders empty grid).
          Worst-pair callout: ink text only, not a colored background pill. */}
      <ol className="space-y-3">
        {pairs.map((p) => {
          const key = `${p.i}:${p.j}`;
          const value = comparisons[key];
          const isWorst =
            worstPair?.i === p.i && worstPair?.j === p.j;
          return (
            <li
              key={key}
              className={`rounded-xl border bg-paper p-4 ${
                isWorst ? "border-ink" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14.5px] font-semibold leading-snug text-ink">
                  <span>{criteria[p.i]!.label}</span>
                  <span className="mx-1.5 text-mute">vs</span>
                  <span>{criteria[p.j]!.label}</span>
                </p>
                {isWorst && (
                  <span className="text-[11px] font-semibold text-ink">
                    Conflicts with your other answers — revise?
                  </span>
                )}
              </div>
              {(criteria[p.i]!.description || criteria[p.j]!.description) && (
                <p className="mt-1 text-[12px] text-mute">
                  Compare on the dimension that matters more to you right now.
                </p>
              )}

              <SaatyScale
                iLabel={criteria[p.i]!.label}
                jLabel={criteria[p.j]!.label}
                value={value}
                onSelect={(v) => setPair(p.i, p.j, v)}
              />
            </li>
          );
        })}
      </ol>

      {/* E3 — Raw-matrix JSON disclosure.
          Per memory feedback_show_wire_format.md: friendly UIs over JSON
          payloads must keep the raw JSON one tab away. Paste-back parses +
          re-validates, friendly errors stay inside the disclosure. */}
      <details
        className="group rounded-xl border border-line bg-paper"
        onToggle={(e) => {
          // When opening, seed the textarea from current state so the user
          // can edit. When closing, leave their draft intact.
          const el = e.target as HTMLDetailsElement;
          if (el.open && rawDraft.length === 0) {
            setRawDraft(rawMatrix);
          }
        }}
      >
        <summary
          className="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-4 py-3 text-[13px] font-medium text-ink transition-colors hover:bg-line/40 [&::-webkit-details-marker]:hidden"
          aria-label="Show raw comparison matrix as JSON"
        >
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[14px] font-semibold text-ink">
              Show raw matrix (advanced)
            </span>
          </span>
          <span className="text-[12px] text-mute">
            Edit JSON directly · advanced users
          </span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 pb-4 pt-3 sm:px-5">
          <p className="text-[12px] leading-relaxed text-mute">
            Comparison matrix as JSON. Keys are{" "}
            <code className="rounded bg-line/40 px-1 py-0.5 text-[11px] text-ink">
              i:j
            </code>{" "}
            with i &lt; j. Values are positive numbers on Saaty's 1–9 scale
            (or their reciprocals). Paste a matrix and tap Apply to replace
            the current answers.
          </p>
          <label htmlFor="ahp-raw-matrix" className="sr-only">
            Raw comparison matrix JSON
          </label>
          <textarea
            id="ahp-raw-matrix"
            value={rawDraft}
            onChange={(e) => {
              setRawDraft(e.target.value);
              setRawError(null);
            }}
            rows={Math.min(12, Math.max(4, rawMatrix.split("\n").length))}
            spellCheck={false}
            className="block w-full rounded-[10px] border border-line bg-paper p-3 font-mono text-[12.5px] leading-relaxed text-ink focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/20"
          />
          {rawError && (
            <p className="text-[12.5px] text-ink" role="alert">
              {rawError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyRawDraft}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-4 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 ${
                rawApplied
                  ? "border-ink bg-paper text-ink"
                  : "border-ink bg-ink text-paper shadow-card hover:bg-ink/90"
              }`}
              aria-label="Apply pasted matrix"
            >
              {rawApplied ? "✓ Applied" : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRawDraft(rawMatrix);
                setRawError(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-ink bg-paper px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              aria-label="Reset draft to current matrix"
            >
              Reset
            </button>
            <span className="text-[11.5px] text-mute">
              Edits sync to the chip grid above.
            </span>
          </div>
        </div>
      </details>
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
      <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold uppercase tracking-wider text-mute">
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
              label={opt.label}
              hint={opt.hint}
            />
          ))}
        <ScaleChip
          value={1}
          selected={value === 1}
          onClick={() => onSelect(1)}
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
              label={opt.label}
              hint={opt.hint}
            />
          );
        })}
      </div>
    </div>
  );
}

function ScaleChip({
  value,
  selected,
  onClick,
  label,
  hint,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
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
      className={`inline-flex h-10 min-w-[44px] items-center justify-center rounded-full border px-3 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 ${
        selected
          ? "border-ink bg-ink text-paper"
          : "border-line bg-paper text-mute hover:border-ink hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
