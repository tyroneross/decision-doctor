"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
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
import { CollapsibleSection } from "@/components/recommendations/CollapsibleSection";
import { detectPHI } from "@/lib/phi-guard";
import { PATH_KICKOFFS, type PathKickoff } from "./path-kickoff";

/** Cookie name set on first successful custom-challenge submit so returning
 *  users see explainer sections collapsed by default. 2-year lifetime; not
 *  PII; HttpOnly=false (client reads it). */
const CUSTOM_SEEN_COOKIE = "dd:custom-seen";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; max-age=${maxAgeSeconds}; path=/; samesite=lax`;
}

function appendLine(value: string, line: string): string {
  if (value.includes(line)) return value;
  const trimmed = value.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n${line}` : line;
}

function removeLine(value: string, line: string): string {
  return value
    .split("\n")
    .filter((l) => l !== line)
    .join("\n")
    .replace(/^\s+/, "");
}

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
  const selectedKickoff = initialPath ? PATH_KICKOFFS[initialPath] : null;

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

  function beginSelectedPath() {
    if (!selectedKickoff || phi.hasPHI) return;
    if (selectedKickoff.requiresDetail && challenge.trim().length < 8) return;
    const nextChallenge = challenge.trim() || selectedKickoff.seedChallenge;
    setChallenge(nextChallenge);
    setState(null);
    setAction(null);
    // Mark the user as a returning custom-challenge visitor so explainer
    // sections collapse by default on subsequent visits. 2-year max-age.
    if (initialPath === "custom") {
      writeCookie(CUSTOM_SEEN_COOKIE, "1", 63072000);
    }
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
    if (selectedKickoff && !initialChallenge?.trim()) {
      if (initialPath === "custom") {
        return (
          <CustomChallengeKickoff
            kickoff={selectedKickoff}
            value={challenge}
            onChange={setChallenge}
            onSubmit={handleChallengeSubmit}
            onStart={beginSelectedPath}
            warning={phi.hasPHI}
            warningReasons={phi.reasons}
            busy={busy}
            error={error}
          />
        );
      }
      return (
        <PathKickoffView
          kickoff={selectedKickoff}
          value={challenge}
          onChange={setChallenge}
          onSubmit={handleChallengeSubmit}
          onStart={beginSelectedPath}
          warning={phi.hasPHI}
          warningReasons={phi.reasons}
          busy={busy}
          error={error}
        />
      );
    }

    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <header className="space-y-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-mute">
            Adaptive intake
          </p>
          <h1 className="text-h1 sm:text-h1-lg text-ink">
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

  if (action.action === "route_to_decision") {
    // S2.C1 — Decision-routing affordance. Surfaces when the controller
    // detects a hiring-shaped, decision-shaped question (e.g., "should I hire
    // an admin assistant?"). User can accept (route to decision template flow)
    // or decline (continue here with the WHY-first fallback question).
    const routeAction = action;
    const templateLabels: Record<string, string> = {
      "admin-hire": "hiring an admin or assistant",
      capacity: "capacity and waitlist",
      pricing: "pricing and rates",
    };
    const templateLabel =
      templateLabels[routeAction.suggestedTemplate] ??
      routeAction.suggestedTemplate;
    // The decision-template flow lives at /app/history/new/[templateId]; the
    // [templateId] params (admin-hire | capacity | pricing) align 1:1 with
    // DecisionTemplateHintSchema. We pass the original challenge text as a
    // ?seed= hint so the template intake can preserve user context (consumer
    // wiring is a followup — current page ignores unknown params safely).
    const decisionHref = `/app/history/new/${encodeURIComponent(
      routeAction.suggestedTemplate,
    )}?seed=${encodeURIComponent(routeAction.state.challengeText.slice(0, 400))}`;

    async function declineRouting() {
      const nextState: RecommendationIntakeState = {
        ...routeAction.state,
        routingDeclined: true,
      };
      setAction(null);
      setState(nextState);
      await loadNext(nextState);
    }

    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-10">
        <IntakeHeader
          eyebrow="Looks like a decision"
          title={`This looks like a yes/no decision about ${templateLabel}.`}
          subtitle="Aida has a dedicated decision flow that frames hire vs automate vs defer with constraints and a fallback."
        />

        <div className="rounded-xl border border-line bg-paper p-4 space-y-3">
          <p className="text-[14px] text-text leading-relaxed">
            {routeAction.rationale}
          </p>
          <p className="text-[12px] text-mute">
            If this is really a repeating workflow you want to streamline, you
            can continue here instead and Aida will start with what&apos;s
            driving the change.
          </p>
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void declineRouting()}
            disabled={busy}
            className="text-[13px] font-medium text-mute hover:text-ink underline-offset-2 hover:underline disabled:opacity-50"
          >
            No, keep this as a workflow
          </button>
          <Link
            href={decisionHref}
            className="inline-flex items-center rounded-[10px] border border-ink bg-ink px-4 py-2 text-[13px] font-medium text-paper transition-colors hover:bg-text"
          >
            Use the decision template →
          </Link>
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

function PathKickoffView({
  kickoff,
  value,
  onChange,
  onSubmit,
  onStart,
  warning,
  warningReasons,
  busy,
  error,
}: {
  kickoff: PathKickoff;
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  onStart: () => void;
  warning: boolean;
  warningReasons: string[];
  busy: boolean;
  error: string | null;
}) {
  // Selections from the starter-assets + info-needed lists. Clicking a card
  // or pill toggles selection; the selected items are inlined into the
  // detail box so the user's "Start" submission carries them forward.
  const [selectedArtifacts, setSelectedArtifacts] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [selectedInfo, setSelectedInfo] = React.useState<Set<string>>(
    () => new Set(),
  );

  function toggleArtifact(key: string, line: string) {
    const hadIt = selectedArtifacts.has(key);
    const next = new Set(selectedArtifacts);
    if (hadIt) next.delete(key);
    else next.add(key);
    setSelectedArtifacts(next);
    // Mirror into the detail box. Append on add; remove the exact line on remove.
    onChange(hadIt ? removeLine(value, line) : appendLine(value, line));
  }

  function toggleInfo(item: string) {
    const line = `- I'll share: ${item}`;
    const hadIt = selectedInfo.has(item);
    const next = new Set(selectedInfo);
    if (hadIt) next.delete(item);
    else next.add(item);
    setSelectedInfo(next);
    onChange(hadIt ? removeLine(value, line) : appendLine(value, line));
  }

  const canStart =
    !busy &&
    !warning &&
    (!kickoff.requiresDetail || value.trim().length >= 8);
  const startLabel = kickoff.requiresDetail
    ? "Start with this detail"
    : "Start with this path";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <header className="space-y-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-mute">
          Selected path
        </p>
        <h1 className="text-h1 sm:text-h1-lg text-ink">{kickoff.label}</h1>
        <p className="text-[15px] leading-relaxed text-text">
          {kickoff.headline}
        </p>
        <p className="text-[14px] leading-relaxed text-mute">
          {kickoff.summary}
        </p>
      </header>

      <NoPhiNotice warning={warning} reasons={warningReasons} />

      <section
        className="rounded-xl border border-line bg-paper p-4"
        aria-labelledby="path-first-advice"
      >
        <h2
          id="path-first-advice"
          className="text-[13px] font-semibold uppercase tracking-wider text-mute"
        >
          First advice
        </h2>
        <ul className="mt-3 space-y-2">
          {kickoff.firstAdvice.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-[14px] leading-relaxed text-text"
            >
              <span
                aria-hidden
                className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="path-artifacts">
        <h2
          id="path-artifacts"
          className="text-[13px] font-semibold uppercase tracking-wider text-mute"
        >
          Starter assets to consider
        </h2>
        <p className="mt-1 text-[12px] text-mute">
          Click a card to include it in your start message.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {kickoff.artifacts.map((artifact) => {
            const key = `${artifact.kind}:${artifact.title}`;
            const line = `- Want a starter ${artifact.kind.toLowerCase()}: "${artifact.title}"`;
            const selected = selectedArtifacts.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleArtifact(key, line)}
                aria-pressed={selected}
                className={twMerge(
                  "text-left rounded-xl border bg-paper p-4 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
                  selected
                    ? "border-ink ring-1 ring-ink/30 bg-line/30"
                    : "border-line hover:border-ink/40 hover:bg-line/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">
                    {artifact.kind}
                  </p>
                  {selected && (
                    <span
                      aria-hidden
                      className="text-[11px] font-semibold text-ink"
                    >
                      ✓ Selected
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-[14px] font-semibold leading-snug text-ink">
                  {artifact.title}
                </h3>
                <p className="mt-2 text-[12px] leading-relaxed text-mute">
                  {artifact.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="rounded-xl border border-line bg-paper p-4"
        aria-labelledby="path-info-needed"
      >
        <h2
          id="path-info-needed"
          className="text-[13px] font-semibold uppercase tracking-wider text-mute"
        >
          What I still need
        </h2>
        <p className="mt-1 text-[12px] text-mute">
          Tap the ones you can share — we&apos;ll add them to your message.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {kickoff.infoNeeded.map((item) => {
            const selected = selectedInfo.has(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleInfo(item)}
                aria-pressed={selected}
                className={twMerge(
                  "rounded-[10px] border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
                  selected
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-text hover:border-ink/40 hover:bg-line/20",
                )}
              >
                {selected ? `✓ ${item}` : item}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-label="Add path detail">
        <PillSearchBar
          multiline
          maxRows={5}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={kickoff.detailPlaceholder}
          ariaLabel="Add detail for this path"
          leftIcon={false}
          minLength={8}
          disabled={busy}
        />

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/app/library"
            className="text-[13px] font-medium text-mute hover:underline underline-offset-2"
          >
            Browse library assets →
          </Link>
          <Button variant="primary" onClick={onStart} disabled={!canStart}>
            {busy ? "Starting..." : startLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

/**
 * Custom-challenge variant of PathKickoffView. Differs from the default
 * layout in two ways:
 *   1. Input bar is the FIRST interactive element below a tight 2-line header
 *      (per user feedback: "move search bar up higher").
 *   2. Privacy / First-Advice / Starter-Assets / What-I-need are wrapped in
 *      CollapsibleSection, default-collapsed for returning users (cookie
 *      dd:custom-seen) so repeat users can submit in one move.
 */
function CustomChallengeKickoff({
  kickoff,
  value,
  onChange,
  onSubmit,
  onStart,
  warning,
  warningReasons,
  busy,
  error,
}: {
  kickoff: PathKickoff;
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  onStart: () => void;
  warning: boolean;
  warningReasons: string[];
  busy: boolean;
  error: string | null;
}) {
  // First-visit detection — read the cookie ONCE on mount. SSR safe (the
  // helper returns null on server, hydration runs the read).
  const [hasSeenBefore, setHasSeenBefore] = React.useState<boolean | null>(
    null,
  );
  React.useEffect(() => {
    setHasSeenBefore(readCookie(CUSTOM_SEEN_COOKIE) === "1");
  }, []);
  const defaultOpen = hasSeenBefore === false || hasSeenBefore === null;

  // Same starter-asset / what-I-need selection logic as PathKickoffView but
  // scoped here so the two views stay independent.
  const [selectedArtifacts, setSelectedArtifacts] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [selectedInfo, setSelectedInfo] = React.useState<Set<string>>(
    () => new Set(),
  );

  function toggleArtifact(key: string, line: string) {
    const hadIt = selectedArtifacts.has(key);
    const next = new Set(selectedArtifacts);
    if (hadIt) next.delete(key);
    else next.add(key);
    setSelectedArtifacts(next);
    onChange(hadIt ? removeLine(value, line) : appendLine(value, line));
  }

  function toggleInfo(item: string) {
    const line = `- I'll share: ${item}`;
    const hadIt = selectedInfo.has(item);
    const next = new Set(selectedInfo);
    if (hadIt) next.delete(item);
    else next.add(item);
    setSelectedInfo(next);
    onChange(hadIt ? removeLine(value, line) : appendLine(value, line));
  }

  const canStart =
    !busy &&
    !warning &&
    (!kickoff.requiresDetail || value.trim().length >= 8);
  const startLabel = kickoff.requiresDetail
    ? "Start with this detail"
    : "Start with this path";

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      {/* Tight 2-line header — input is the first interactive thing below. */}
      <header className="space-y-1.5">
        <h1 className="text-h1 sm:text-h1-lg text-ink">
          Describe your challenge
        </h1>
        <p className="text-[14px] leading-relaxed text-mute">
          Aida classifies it into a starter path and asks only what it needs.
        </p>
      </header>

      <NoPhiNotice warning={warning} reasons={warningReasons} />

      {/* PRIMARY INPUT — top of the page, immediately under the header. */}
      <section className="space-y-3" aria-label="Describe your challenge">
        <PillSearchBar
          multiline
          maxRows={6}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={kickoff.detailPlaceholder}
          ariaLabel="Describe your challenge"
          leftIcon={false}
          minLength={8}
          autoFocus
          disabled={busy}
        />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="primary"
            onClick={onStart}
            disabled={!canStart}
            className={twMerge(
              "min-h-[44px] sm:min-h-[36px]",
              canStart ? "" : "opacity-50",
            )}
          >
            {busy ? "Starting..." : startLabel}
          </Button>
        </div>
      </section>

      {/* PROGRESSIVE DISCLOSURE — collapsed for returning users. */}
      <CollapsibleSection
        id="custom-privacy"
        eyebrow="Privacy reminder"
        title="Skip patient identifiers and clinical narrative."
        summary="Use counts, categories, and time ranges. Aida flags PHI-shaped input."
        defaultOpen={defaultOpen}
      >
        <ul className="space-y-2 pt-2">
          {kickoff.firstAdvice.slice(0, 1).map((item) => (
            <li
              key={item}
              className="flex gap-2 text-[14px] leading-relaxed text-text"
            >
              <span
                aria-hidden
                className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
              />
              <span>{item}</span>
            </li>
          ))}
          <li className="flex gap-2 text-[13px] leading-relaxed text-mute">
            <span
              aria-hidden
              className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-mute"
            />
            <span>
              Patient names, DOBs, contact details, MRNs, and clinical notes
              are blocked client-side and server-side.
            </span>
          </li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        id="custom-first-advice"
        eyebrow="How to describe the workflow"
        title="What makes a good challenge description"
        summary="Repeating task · frequency · time cost · what slips · AI-no-go line."
        defaultOpen={defaultOpen}
      >
        <ul className="mt-2 space-y-2">
          {kickoff.firstAdvice.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-[14px] leading-relaxed text-text"
            >
              <span
                aria-hidden
                className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        id="custom-starter-assets"
        eyebrow="Starter assets to consider"
        title="Add a starter asset to your message"
        summary={`${kickoff.artifacts.length} options · tap to include in your description.`}
        defaultOpen={defaultOpen}
      >
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {kickoff.artifacts.map((artifact) => {
            const key = `${artifact.kind}:${artifact.title}`;
            const line = `- Want a starter ${artifact.kind.toLowerCase()}: "${artifact.title}"`;
            const selected = selectedArtifacts.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleArtifact(key, line)}
                aria-pressed={selected}
                className={twMerge(
                  "text-left rounded-xl border bg-paper p-3 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
                  "min-h-[44px] sm:min-h-[40px]",
                  selected
                    ? "border-ink ring-1 ring-ink/30 bg-line/30"
                    : "border-line hover:border-ink/40 hover:bg-line/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">
                    {artifact.kind}
                  </p>
                  {selected && (
                    <span
                      aria-hidden
                      className="text-[11px] font-semibold text-ink"
                    >
                      ✓ Selected
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-[14px] font-semibold leading-snug text-ink">
                  {artifact.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                  {artifact.description}
                </p>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="custom-info-needed"
        eyebrow="What Aida still needs"
        title="Tap what you can share"
        summary={`${kickoff.infoNeeded.length} prompts · adds them to your description.`}
        defaultOpen={defaultOpen}
      >
        <div className="mt-2 flex flex-wrap gap-2">
          {kickoff.infoNeeded.map((item) => {
            const selected = selectedInfo.has(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleInfo(item)}
                aria-pressed={selected}
                className={twMerge(
                  "rounded-[10px] border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
                  "min-h-[36px]",
                  selected
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-text hover:border-ink/40 hover:bg-line/20",
                )}
              >
                {selected ? `✓ ${item}` : item}
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <div className="flex justify-start pt-2">
        <Link
          href="/app/library"
          className="text-[13px] font-medium text-mute hover:text-ink underline-offset-2 hover:underline"
        >
          Browse library assets →
        </Link>
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
      <h1 className="text-h1 sm:text-h1-lg text-ink">{title}</h1>
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
