"use client";

// components/recommendations/BaselineCapture.tsx
//
// Optional baseline capture form per PRD §"Baseline And Check-In" (Screen 6).
// Fields: time spent, frequency, confidence (1-5), frustration (1-5), workaround.
//
// P0 behavior:
//   - Save to localStorage as draft (route /api/recommendations/<id>/baseline
//     doesn't exist yet — TODO: Iteration P1).
//   - Authed-only (guests see a sign-in nudge).
//   - "Optional — capture in less than 1 minute to track impact later."
//
// Theme tokens only. Zero per-pain Tailwind colors.

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// TODO: Iteration P1 — POST to /api/recommendations/<id>/baseline when the
//       route ships. Until then, saves to localStorage under
//       "dd:baseline:<recommendationId>".

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const SCALE_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface BaselineCaptureProps {
  /** The recommendation ID. Used as the localStorage key. */
  recommendationId: string;
  /** Whether the viewing user is authenticated. Guests see a sign-in nudge. */
  authed: boolean;
  /** Called when the baseline is saved (localStorage or API). */
  onSaved?: () => void;
}

interface BaselineDraft {
  timeValue: string;
  timeUnit: "minutes" | "hours";
  frequency: string;
  confidence: number;
  frustration: number;
  workaround: string;
}

function loadDraft(id: string): Partial<BaselineDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`dd:baseline:${id}`);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<BaselineDraft>;
  } catch {
    return {};
  }
}

function saveDraft(id: string, draft: BaselineDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`dd:baseline:${id}`, JSON.stringify(draft));
  } catch {
    // Quota exceeded or private browsing — silent degrade.
  }
}

export function BaselineCapture({
  recommendationId,
  authed,
  onSaved,
}: BaselineCaptureProps) {
  const persisted = loadDraft(recommendationId);

  const [timeValue, setTimeValue] = useState(persisted.timeValue ?? "");
  const [timeUnit, setTimeUnit] = useState<"minutes" | "hours">(
    persisted.timeUnit ?? "minutes"
  );
  const [frequency, setFrequency] = useState(persisted.frequency ?? "");
  const [confidence, setConfidence] = useState(persisted.confidence ?? 0);
  const [frustration, setFrustration] = useState(persisted.frustration ?? 0);
  const [workaround, setWorkaround] = useState(persisted.workaround ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authed) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
      >
        <p className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>
          Capture a baseline to track impact
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--mute)" }}>
          Sign in to record how much time this task currently takes, so you
          can measure the improvement after trying the recommendation.
        </p>
        <a
          href="/sign-in"
          className="mt-3 inline-flex items-center rounded-[10px] border px-4 py-[9px] text-[14px] font-semibold"
          style={{
            borderColor: "var(--ink)",
            color: "var(--ink)",
            backgroundColor: "var(--paper)",
          }}
        >
          Sign in to save baseline
        </a>
      </div>
    );
  }

  if (saved) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
      >
        <p className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>
          Baseline captured
        </p>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--mute)" }}>
          We&rsquo;ll remind you to check in after you&rsquo;ve tried the recommendation.
        </p>
      </div>
    );
  }

  function handleSave() {
    if (!timeValue.trim()) {
      setError("Enter how much time this currently takes.");
      return;
    }
    if (!frequency) {
      setError("Select how often you do this task.");
      return;
    }
    setError(null);

    const draft: BaselineDraft = {
      timeValue: timeValue.trim(),
      timeUnit,
      frequency,
      confidence,
      frustration,
      workaround,
    };

    // TODO: Iteration P1 — replace localStorage with POST to
    //       /api/recommendations/<recommendationId>/baseline.
    saveDraft(recommendationId, draft);
    setSaved(true);
    onSaved?.();
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
    >
      <div>
        <p className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>
          Capture a baseline (optional)
        </p>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--mute)" }}>
          Takes less than 1 minute. Lets you measure the impact after trying
          the recommendation.
        </p>
      </div>

      {error && (
        <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
          {error}
        </p>
      )}

      {/* Time spent */}
      <fieldset>
        <legend
          className="text-[13px] font-medium mb-1.5"
          style={{ color: "var(--ink)" }}
        >
          Current time spent on this task
        </legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={999}
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            placeholder="e.g. 30"
            className="w-24 rounded-lg border px-3 py-2 text-[14px] bg-paper outline-none focus:ring-[2px] focus:ring-ink/20"
            style={{
              borderColor: "var(--line)",
              color: "var(--ink)",
              backgroundColor: "var(--paper)",
            }}
            aria-label="Time value"
          />
          <div className="flex gap-1">
            {(["minutes", "hours"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setTimeUnit(u)}
                className="rounded-[8px] border px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: timeUnit === u ? "var(--ink)" : "var(--line)",
                  color: timeUnit === u ? "var(--ink)" : "var(--mute)",
                  backgroundColor: "var(--paper)",
                }}
                aria-pressed={timeUnit === u}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {/* Frequency */}
      <fieldset>
        <legend
          className="text-[13px] font-medium mb-1.5"
          style={{ color: "var(--ink)" }}
        >
          How often do you do this?
        </legend>
        <div className="flex flex-wrap gap-2">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFrequency(opt.value)}
              className="rounded-[8px] border px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                borderColor: frequency === opt.value ? "var(--ink)" : "var(--line)",
                color: frequency === opt.value ? "var(--ink)" : "var(--mute)",
                backgroundColor: "var(--paper)",
              }}
              aria-pressed={frequency === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Confidence 1-5 */}
      <fieldset>
        <legend
          className="text-[13px] font-medium mb-1.5"
          style={{ color: "var(--ink)" }}
        >
          Current confidence in your approach (1 = low, 5 = high)
        </legend>
        <div className="flex gap-2">
          {SCALE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfidence(n)}
              className="h-9 w-9 rounded-[8px] border text-[14px] font-semibold transition-colors"
              style={{
                borderColor: confidence === n ? "var(--ink)" : "var(--line)",
                color: confidence === n ? "var(--paper)" : "var(--mute)",
                backgroundColor: confidence === n ? "var(--ink)" : "var(--paper)",
              }}
              aria-label={`Confidence ${n}`}
              aria-pressed={confidence === n}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Frustration 1-5 */}
      <fieldset>
        <legend
          className="text-[13px] font-medium mb-1.5"
          style={{ color: "var(--ink)" }}
        >
          Current frustration level (1 = low, 5 = high)
        </legend>
        <div className="flex gap-2">
          {SCALE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFrustration(n)}
              className="h-9 w-9 rounded-[8px] border text-[14px] font-semibold transition-colors"
              style={{
                borderColor: frustration === n ? "var(--ink)" : "var(--line)",
                color: frustration === n ? "var(--paper)" : "var(--mute)",
                backgroundColor: frustration === n ? "var(--ink)" : "var(--paper)",
              }}
              aria-label={`Frustration ${n}`}
              aria-pressed={frustration === n}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Current workaround */}
      <div>
        <label
          className="block text-[13px] font-medium mb-1.5"
          style={{ color: "var(--ink)" }}
          htmlFor="baseline-workaround"
        >
          Current workaround (optional)
        </label>
        <textarea
          id="baseline-workaround"
          rows={3}
          value={workaround}
          onChange={(e) => setWorkaround(e.target.value)}
          placeholder="How do you handle this today? (no patient details)"
          className="w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed resize-none outline-none focus:ring-[2px] focus:ring-ink/20"
          style={{
            borderColor: "var(--line)",
            color: "var(--ink)",
            backgroundColor: "var(--paper)",
          }}
        />
      </div>

      <Button variant="secondary" onClick={handleSave}>
        Save baseline
      </Button>
    </div>
  );
}
