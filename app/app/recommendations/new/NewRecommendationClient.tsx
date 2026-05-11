"use client";

// app/app/recommendations/new/NewRecommendationClient.tsx
//
// Lightweight intake form per PRD P0-02: max 5 clarifier questions before
// the first recommendation.
//
// Step flow:
//   Step 1 — Challenge description (PillSearchBar multiline maxRows=6).
//   Step 2 — Path selection (skip if initialPath provided; otherwise 6 chips).
//   Steps 3-5 — 5 critical ClarifierChips: frequency, time burden, severity,
//               risk tolerance, AI comfort. Defaults shown; user adjusts.
//
// On submit: POST /api/recommendations.
//   - Authed: redirect to /app/recommendations/<id>.
//   - Guest: stash recommendation in sessionStorage, redirect to guest-preview.
//
// Progress UI: 4-stage indicator (~12-15s engine end-to-end).
// Error: 404 or engine not deployed → "retry" button.
//
// Theme tokens only. Zero per-pain colors.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PainPathId } from "@/lib/engine/types";
import type { ResolvedActor } from "@/lib/auth-session";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { Button } from "@/components/ui/Button";
import { NoPhiNotice } from "@/components/recommendations/NoPhiNotice";
import { detectPHI } from "@/lib/phi-guard";
import { PAIN_PATHS } from "@/components/pain-cards/PainCardGrid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRESS_STAGES = [
  "Classifying your challenge...",
  "Retrieving use-case library...",
  "Scoring candidates...",
  "Building your recommendation...",
];

// The 5 intake clarifier questions (chip-based, per PRD P0-02).
// fieldId matches ScoringInput fields.

const INTAKE_QUESTIONS = [
  {
    fieldId: "frequency",
    label: "How often does this challenge come up?",
    hint: "Rough estimate is fine.",
    options: [
      { value: "0.25", label: "Rarely (monthly)" },
      { value: "0.5", label: "Occasionally (weekly)" },
      { value: "0.75", label: "Often (several times a week)" },
      { value: "1", label: "Constantly (daily)" },
    ],
    defaultValue: "0.5",
  },
  {
    fieldId: "time_burden",
    label: "How much time does it take per occurrence?",
    hint: "Pick the closest option.",
    options: [
      { value: "0.2", label: "Under 15 minutes" },
      { value: "0.5", label: "15 to 60 minutes" },
      { value: "0.75", label: "1 to 3 hours" },
      { value: "1", label: "More than 3 hours" },
    ],
    defaultValue: "0.5",
  },
  {
    fieldId: "pain_severity",
    label: "How much does it slow your practice down?",
    hint: "Your honest gut read.",
    options: [
      { value: "0.2", label: "Minor inconvenience" },
      { value: "0.5", label: "Noticeable friction" },
      { value: "0.75", label: "Real drag on my day" },
      { value: "1", label: "Serious bottleneck" },
    ],
    defaultValue: "0.5",
  },
  {
    fieldId: "risk_tolerance",
    label: "How comfortable are you with AI making mistakes on this?",
    hint: "Higher risk tolerance = faster AI adoption.",
    options: [
      { value: "0.2", label: "Very cautious — I review everything" },
      { value: "0.5", label: "Moderate — I spot-check outputs" },
      { value: "0.75", label: "Comfortable — errors are easy to catch" },
      { value: "1", label: "Relaxed — low-stakes task" },
    ],
    defaultValue: "0.5",
  },
  {
    fieldId: "ai_comfort",
    label: "How familiar are you with AI tools for this type of work?",
    hint: "Honest — it helps us pick the right starting level.",
    options: [
      { value: "0.2", label: "Never tried AI for this" },
      { value: "0.5", label: "Used it a few times" },
      { value: "0.75", label: "Use AI tools regularly" },
      { value: "1", label: "Very experienced with AI workflows" },
    ],
    defaultValue: "0.5",
  },
] as const;

type IntakeAnswers = Record<string, string>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NewRecommendationClientProps {
  initialPath: PainPathId | null;
  initialChallenge: string | null;
  actor: ResolvedActor | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewRecommendationClient({
  initialPath,
  initialChallenge,
  actor,
}: NewRecommendationClientProps) {
  const router = useRouter();

  // Step state: 1=challenge, 2=path (skip if initialPath), 3-7=intake questions
  const startStep = initialPath ? 2 : 1;
  const [step, setStep] = useState<number>(
    initialChallenge ? (initialPath ? 2 : 2) : 1
  );

  const [challenge, setChallenge] = useState(initialChallenge ?? "");
  const [selectedPath, setSelectedPath] = useState<PainPathId | null>(
    initialPath
  );
  // Intake answers — pre-filled with defaults
  const [answers, setAnswers] = useState<IntakeAnswers>(() => {
    const defaults: IntakeAnswers = {};
    INTAKE_QUESTIONS.forEach((q) => {
      defaults[q.fieldId] = q.defaultValue;
    });
    return defaults;
  });

  // Current intake question index (0-4)
  const [questionIdx, setQuestionIdx] = useState(0);

  // PHI detection
  const [phiWarning, setPhiWarning] = useState(false);
  const [phiReasons, setPhiReasons] = useState<string[]>([]);

  // Progress + submit state
  const [submitting, setSubmitting] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);

  // Handle step skip logic: if initialPath and initialChallenge are both set,
  // jump straight to the first intake question.
  useEffect(() => {
    if (initialPath && initialChallenge) {
      setStep(3);
    } else if (initialPath && !initialChallenge) {
      setStep(1);
    } else if (!initialPath && initialChallenge) {
      setStep(2);
    }
  }, []);

  // PHI check on challenge text (client-side hint only; server enforces).
  function handleChallengeChange(text: string) {
    setChallenge(text);
    if (text.length > 10) {
      const { hasPHI, reasons } = detectPHI(text);
      setPhiWarning(hasPHI);
      setPhiReasons(reasons);
    } else {
      setPhiWarning(false);
      setPhiReasons([]);
    }
  }

  function handleChallengeSubmit(text: string) {
    if (!text.trim()) return;
    setChallenge(text.trim());
    // Move to path selection or first intake question.
    setStep(initialPath ? 3 : 2);
  }

  function handlePathSelect(pathId: PainPathId) {
    setSelectedPath(pathId);
    setStep(3);
    setQuestionIdx(0);
  }

  function handleAnswer(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  function handleNextQuestion() {
    if (questionIdx < INTAKE_QUESTIONS.length - 1) {
      setQuestionIdx((i) => i + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!challenge.trim()) {
      setStep(1);
      return;
    }

    const painPath = selectedPath ?? "custom";

    setSubmitting(true);
    setEngineError(null);

    // Animate progress stages over ~12 seconds.
    const intervals: ReturnType<typeof setInterval>[] = [];
    PROGRESS_STAGES.forEach((_, idx) => {
      const timeout = setTimeout(
        () => setProgressStage(idx),
        idx * 3000
      );
      intervals.push(timeout as unknown as ReturnType<typeof setInterval>);
    });

    function clearTimers() {
      intervals.forEach((t) => clearTimeout(t as unknown as ReturnType<typeof setTimeout>));
    }

    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          painPath,
          challengeText: challenge.trim(),
          goal: "", // TODO: Iteration P1 — add goal capture step
        }),
      });

      clearTimers();

      if (res.status === 404 || res.status === 503) {
        setEngineError(
          "The recommendation engine route isn't deployed yet. Try again in a moment."
        );
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEngineError(
          (body as { error?: string }).error ?? `Engine error (${res.status}). Please try again.`
        );
        setSubmitting(false);
        return;
      }

      const data = (await res.json()) as {
        guestMode: boolean;
        id?: string;
        recommendation: unknown;
      };

      if (data.guestMode) {
        // Store in sessionStorage and redirect to guest-preview.
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "dd:guest:lastRecommendation",
            JSON.stringify({ recommendation: data.recommendation, painPath })
          );
        }
        router.push("/app/recommendations/guest-preview");
      } else {
        // Authed — redirect to the persisted recommendation detail.
        router.push(`/app/recommendations/${data.id}`);
      }
    } catch {
      clearTimers();
      setEngineError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render — progress overlay
  // ---------------------------------------------------------------------------

  if (submitting) {
    return (
      <div className="max-w-xl mx-auto px-5 py-12 space-y-6">
        <div className="space-y-2">
          <p
            className="text-[14px] font-medium"
            style={{ color: "var(--ink)" }}
          >
            {PROGRESS_STAGES[progressStage]}
          </p>
          {/* Stage dots */}
          <div className="flex gap-2 items-center">
            {PROGRESS_STAGES.map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: i <= progressStage ? "32px" : "8px",
                  backgroundColor: i <= progressStage ? "var(--ink)" : "var(--line)",
                }}
              />
            ))}
          </div>
          <p
            className="text-[12px]"
            style={{ color: "var(--mute)" }}
          >
            This usually takes 12-15 seconds.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — engine error
  // ---------------------------------------------------------------------------

  if (engineError) {
    return (
      <div className="max-w-xl mx-auto px-5 py-12 space-y-4">
        <h2
          className="text-[18px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Something went wrong
        </h2>
        <p className="text-[14px]" style={{ color: "var(--mute)" }}>
          {engineError}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setEngineError(null);
            setStep(3);
            setQuestionIdx(INTAKE_QUESTIONS.length - 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Challenge description
  // ---------------------------------------------------------------------------

  if (step === 1) {
    return (
      <div className="max-w-xl mx-auto px-5 py-10 space-y-6">
        <header className="space-y-1">
          <p
            className="text-[12px] font-medium uppercase tracking-wider"
            style={{ color: "var(--mute)" }}
          >
            Step 1 of {initialPath ? "5" : "6"}
          </p>
          <h1
            className="text-[24px] font-bold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            What do you want AI to help with?
          </h1>
          <p className="text-[14px]" style={{ color: "var(--mute)" }}>
            Describe the challenge in your own words.
          </p>
        </header>

        <NoPhiNotice warning={phiWarning} reasons={phiReasons} />

        <PillSearchBar
          multiline
          maxRows={6}
          value={challenge}
          onChange={handleChallengeChange}
          onSubmit={handleChallengeSubmit}
          placeholder="e.g. I spend hours every week following up on referrals manually..."
          ariaLabel="Describe your challenge"
          autoFocus
        />
        {phiWarning && (
          <p className="text-[12px]" style={{ color: "var(--mute)" }}>
            Remove patient-identifiable details before continuing.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Pain path selection (skip if initialPath was set)
  // ---------------------------------------------------------------------------

  if (step === 2) {
    return (
      <div className="max-w-xl mx-auto px-5 py-10 space-y-6">
        <header className="space-y-1">
          <p
            className="text-[12px] font-medium uppercase tracking-wider"
            style={{ color: "var(--mute)" }}
          >
            Step 2 of 6
          </p>
          <h2
            className="text-[24px] font-bold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            Which area does this affect most?
          </h2>
          <p className="text-[14px]" style={{ color: "var(--mute)" }}>
            Pick the closest match. We use this to find the most relevant
            AI tasks.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-2">
          {PAIN_PATHS.map((entry) => (
            <button
              key={entry.pathId}
              type="button"
              onClick={() => handlePathSelect(entry.pathId as PainPathId)}
              className="flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:border-ink"
              style={{
                borderColor: "var(--line)",
                backgroundColor: "var(--paper)",
              }}
            >
              <div>
                <p
                  className="text-[14px] font-medium"
                  style={{ color: "var(--ink)" }}
                >
                  {entry.label}
                </p>
                <p className="text-[12px]" style={{ color: "var(--mute)" }}>
                  {entry.oneLineHook}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Steps 3-7 — Intake clarifier questions
  // ---------------------------------------------------------------------------

  const currentQuestion = INTAKE_QUESTIONS[questionIdx];
  if (!currentQuestion) return null;

  const stepNum = (initialPath ? 1 : 2) + questionIdx + 1;
  const totalSteps = (initialPath ? 1 : 2) + INTAKE_QUESTIONS.length;
  const isLast = questionIdx === INTAKE_QUESTIONS.length - 1;
  const currentAnswer = answers[currentQuestion.fieldId] ?? currentQuestion.defaultValue;

  return (
    <div className="max-w-xl mx-auto px-5 py-10 space-y-6">
      <header className="space-y-1">
        <p
          className="text-[12px] font-medium uppercase tracking-wider"
          style={{ color: "var(--mute)" }}
        >
          Step {stepNum} of {totalSteps}
        </p>
        <h2
          className="text-[22px] font-bold leading-snug"
          style={{ color: "var(--ink)" }}
        >
          {currentQuestion.label}
        </h2>
        {currentQuestion.hint && (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            {currentQuestion.hint}
          </p>
        )}
      </header>

      {/* Chip options */}
      <div className="flex flex-col gap-2">
        {currentQuestion.options.map((opt) => {
          const isSelected = currentAnswer === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAnswer(currentQuestion.fieldId, opt.value)}
              className="rounded-xl border px-4 py-3 text-left text-[14px] font-medium transition-colors"
              style={{
                borderColor: isSelected ? "var(--ink)" : "var(--line)",
                color: isSelected ? "var(--ink)" : "var(--mute)",
                backgroundColor: "var(--paper)",
              }}
              aria-pressed={isSelected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (questionIdx > 0) {
              setQuestionIdx((i) => i - 1);
            } else {
              setStep(initialPath ? 1 : 2);
            }
          }}
          className="text-[13px] font-medium"
          style={{ color: "var(--mute)" }}
        >
          Back
        </button>
        <Button
          variant="primary"
          onClick={handleNextQuestion}
          disabled={!currentAnswer}
        >
          {isLast ? "Get my recommendation" : "Next"}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {INTAKE_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              backgroundColor:
                i <= questionIdx ? "var(--ink)" : "var(--line)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
