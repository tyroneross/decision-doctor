"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PainPathId } from "@/lib/engine/types";
import type { ResolvedActor } from "@/lib/auth-session";
import type {
  RecommendationIntakeAction,
  RecommendationIntakeQuestion,
  RecommendationIntakeState,
} from "@/shared/schema";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NoPhiNotice } from "@/components/recommendations/NoPhiNotice";
import { detectPHI } from "@/lib/phi-guard";

export interface NewRecommendationClientProps {
  initialPath: PainPathId | null;
  initialChallenge: string | null;
  actor: ResolvedActor | null;
}

type SubmitState = "idle" | "loading-next" | "saving-answer" | "finalizing";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (payload as { message?: string; error?: string }).message ??
      (payload as { error?: string }).error ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export function NewRecommendationClient({
  initialPath,
  initialChallenge,
  actor: _actor,
}: NewRecommendationClientProps) {
  const router = useRouter();
  const [challenge, setChallenge] = useState(initialChallenge ?? "");
  const [state, setState] = useState<RecommendationIntakeState | null>(null);
  const [action, setAction] = useState<RecommendationIntakeAction | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | number | null>(
    null,
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const phi = useMemo(
    () =>
      challenge.trim().length > 10
        ? detectPHI(challenge)
        : { hasPHI: false, reasons: [] },
    [challenge],
  );

  async function loadNext(
    nextState?: RecommendationIntakeState,
    challengeOverride?: string,
  ) {
    setSubmitState("loading-next");
    setError(null);
    setSelectedValue(null);
    try {
      const result = await postJson<RecommendationIntakeAction>(
        "/api/recommendations/intake/next",
        nextState
          ? { state: nextState }
          : {
              challengeText: (challengeOverride ?? challenge).trim(),
              ...(initialPath ? { painPath: initialPath } : {}),
            },
      );
      setAction(result);
      setState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load intake.");
    } finally {
      setSubmitState("idle");
    }
  }

  useEffect(() => {
    if (initialChallenge?.trim()) {
      void loadNext();
    }
    // Initial load only. The URL-derived values are immutable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChallengeSubmit(text: string) {
    if (!text.trim() || phi.hasPHI) return;
    const nextChallenge = text.trim();
    setChallenge(nextChallenge);
    setState(null);
    setAction(null);
    void loadNext(undefined, nextChallenge);
  }

  async function submitAnswer(question: RecommendationIntakeQuestion) {
    if (!state || selectedValue === null) return;

    const selectedOption =
      question.widget.kind === "chips"
        ? question.widget.options.find((o) => o.value === selectedValue)
        : null;
    const display =
      selectedOption?.label ??
      (question.widget.kind === "slider" && question.widget.unit
        ? `${selectedValue} ${question.widget.unit}`
        : String(selectedValue));

    setSubmitState("saving-answer");
    setError(null);
    try {
      const result = await postJson<{ state: RecommendationIntakeState }>(
        "/api/recommendations/intake/answer",
        {
          state,
          question,
          display,
          raw: selectedValue,
        },
      );
      setState(result.state);
      await loadNext(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer.");
      setSubmitState("idle");
    }
  }

  async function finalizeRecommendation(finalState: RecommendationIntakeState) {
    setSubmitState("finalizing");
    setError(null);
    try {
      const data = await postJson<{
        guestMode: boolean;
        id?: string;
        recommendation: unknown;
      }>("/api/recommendations/intake/finalize", { state: finalState });

      if (data.guestMode) {
        window.sessionStorage.setItem(
          "dd:guest:lastRecommendation",
          JSON.stringify({
            recommendation: data.recommendation,
            painPath: finalState.painPath ?? "custom",
          }),
        );
        router.push("/app/recommendations/guest-preview");
      } else {
        router.push(`/app/recommendations/${data.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create recommendation.",
      );
      setSubmitState("idle");
    }
  }

  const busy = submitState !== "idle";

  if (submitState === "finalizing") {
    return <LoadingState title="Working on your recommendation" />;
  }

  if (!action) {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <header className="space-y-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-mute">
            Adaptive intake
          </p>
          <h1 className="text-[24px] font-bold leading-snug text-ink">
            What do you want AI to help with?
          </h1>
          <p className="text-[14px] text-mute">
            Describe the operational pain. Aida will ask only what it needs.
          </p>
        </header>

        <NoPhiNotice warning={phi.hasPHI} reasons={phi.reasons} />

        <PillSearchBar
          multiline
          maxRows={6}
          value={challenge}
          onChange={setChallenge}
          onSubmit={handleChallengeSubmit}
          placeholder="e.g. Prior authorization paperwork eats every Monday morning..."
          ariaLabel="Describe your challenge"
          autoFocus
          disabled={busy}
        />

        {error && <ErrorText>{error}</ErrorText>}
      </div>
    );
  }

  if (action.action === "ask") {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <IntakeHeader
          eyebrow={`${action.progress.asked} of ${action.progress.max} questions asked`}
          title={action.question.widget.label}
          subtitle={action.question.widget.hint ?? action.question.prompt}
        />

        <QuestionControl
          question={action.question}
          value={selectedValue}
          onChange={setSelectedValue}
          disabled={busy}
        />

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setAction(null);
              setState(null);
            }}
            className="text-[13px] font-medium text-mute"
          >
            Edit challenge
          </button>
          <Button
            variant="primary"
            onClick={() => submitAnswer(action.question)}
            disabled={busy || selectedValue === null}
          >
            {busy ? "Saving..." : "Continue"}
          </Button>
        </div>
      </div>
    );
  }

  if (action.action === "infer") {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <IntakeHeader
          eyebrow="Assumptions"
          title="Aida can safely infer the rest."
          subtitle="Review the assumptions before continuing."
        />

        <div className="space-y-3">
          {action.defaults.map((item) => (
            <div
              key={`${item.topic}:${item.path}`}
              className="rounded-xl border border-line bg-paper p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-ink">
                  {labelForPath(item.path)}
                </p>
                <span className="text-[11px] uppercase tracking-wider text-mute">
                  {item.confidence}
                </span>
              </div>
              <p className="mt-2 text-[14px] text-text">{String(item.value)}</p>
              <p className="mt-2 text-[12px] text-mute">{item.rationale}</p>
            </div>
          ))}
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setAction(null);
              setState(action.state);
            }}
            className="text-[13px] font-medium text-mute"
          >
            Edit challenge
          </button>
          <Button
            variant="primary"
            onClick={() => loadNext(action.state)}
            disabled={busy}
          >
            {busy ? "Checking..." : "Continue"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
      <IntakeHeader
        eyebrow="Ready"
        title="Aida has enough signal to recommend a first task."
        subtitle={action.reason}
      />

      <div className="rounded-xl border border-line bg-paper p-4">
        <p className="text-[13px] font-semibold text-ink">
          {labelForPainPath(action.recommendationInput.painPath)}
        </p>
        <p className="mt-2 text-[14px] text-text">
          {action.recommendationInput.challengeText}
        </p>
        <p className="mt-2 text-[12px] text-mute">
          {action.recommendationInput.goal}
        </p>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setAction(null);
            setState(action.state);
          }}
          className="text-[13px] font-medium text-mute"
        >
          Edit challenge
        </button>
        <Button
          variant="primary"
          onClick={() => finalizeRecommendation(action.state)}
          disabled={busy}
        >
          Get my recommendation
        </Button>
      </div>
    </div>
  );
}

function LoadingState({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-5 py-16">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--line)", borderTopColor: "var(--ink)" }}
        />
        <p className="text-[14px] font-medium text-ink">{title}</p>
      </div>
      <p className="text-[12px] text-mute">
        This usually takes 12 to 15 seconds.
      </p>
    </div>
  );
}

function IntakeHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1">
      <p className="text-[12px] font-medium uppercase tracking-wider text-mute">
        {eyebrow}
      </p>
      <h1 className="text-[24px] font-bold leading-snug text-ink">{title}</h1>
      {subtitle && <p className="text-[14px] text-mute">{subtitle}</p>}
    </header>
  );
}

function QuestionControl({
  question,
  value,
  onChange,
  disabled,
}: {
  question: RecommendationIntakeQuestion;
  value: string | number | null;
  onChange: (value: string | number) => void;
  disabled: boolean;
}) {
  if (question.widget.kind === "slider") {
    const current =
      typeof value === "number" ? value : question.widget.defaultValue;
    return (
      <div className="rounded-xl border border-line bg-paper p-4">
        <input
          type="range"
          min={question.widget.min}
          max={question.widget.max}
          step={question.widget.step ?? 1}
          value={current}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="w-full accent-ink"
          aria-label={question.widget.label}
        />
        <p className="mt-2 text-[13px] font-medium text-ink">
          {current}
          {question.widget.unit ? ` ${question.widget.unit}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {question.widget.options.map((option) => (
        <Chip
          key={option.value}
          tone={value === option.value ? "selected" : "default"}
          pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

function ErrorText({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-line bg-paper p-3 text-[13px] text-ink">
      {children}
    </p>
  );
}

function labelForPath(path: string): string {
  const labels: Record<string, string> = {
    goal: "Goal",
    "scoringInput.riskTolerance": "Risk posture",
    "scoringInput.aiComfort": "AI comfort",
    "scoringInput.dataReadiness": "Data readiness",
  };
  return labels[path] ?? path;
}

function labelForPainPath(path: PainPathId): string {
  const labels: Record<PainPathId, string> = {
    referrals: "Referral growth or management",
    research: "Research and evidence tracking",
    admin: "Administrative overload",
    capacity_growth: "Capacity, pricing, or growth",
    follow_up: "Patient follow-up consistency",
    custom: "Custom challenge",
  };
  return labels[path];
}
