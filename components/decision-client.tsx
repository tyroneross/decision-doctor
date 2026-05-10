"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  History,
  Printer,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DecisionInputSchema,
  DecisionOutputSchema,
  type DecisionOutput,
  type TemplateId,
} from "@/shared/schema";
import {
  decisionTemplates,
  getTemplate,
  type DecisionTemplate,
  type IntakeField,
} from "@/components/decision-data";

type FieldValue = string | number | boolean | string[] | number[];
type FieldState = Record<string, FieldValue>;
type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; title: string; message: string; retryable: boolean };
type HistoryItem = {
  id: string;
  templateId: string;
  title: string;
  decidedAt?: string;
  confidence?: number;
  status?: string;
};

const DRAFT_PREFIX = "decision-doctor:draft:";
const QUEUE_KEY = "decision-doctor:queued-submission";
const COMPLETE_KEY = "decision-doctor:completed-decisions";
const USER_KEY = "decision-doctor:local-user";
const TENANT_KEY = "decision-doctor:local-tenant";

export function AppFrame({
  children,
  showHistory = true,
}: {
  children: React.ReactNode;
  showHistory?: boolean;
}) {
  return (
    <main className="page-shell">
      <div className="page-content">
        <div className="top-bar no-print">
          <Link className="brand-mark" href="/app" aria-label="Decision Doctor">
            <span className="brand-dot" aria-hidden="true" />
            <span>Decision Doctor</span>
          </Link>
          {showHistory ? (
            <Link className="button button-secondary" href="/app/decisions">
              <History size={18} aria-hidden="true" />
              History
            </Link>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}

export function TemplateSelector() {
  return <FlowTemplateSelector />;
}

export function FlowTemplateSelector() {
  return (
    <AppFrame>
      <p className="eyebrow">3 decisions in 20 minutes</p>
      <h1 className="page-title">Pick the decision you need to make.</h1>
      <p className="page-lede">
        Each path asks only structured business inputs. Do not enter patient
        names, dates of birth, record numbers, or clinical notes.
      </p>

      <section className="section" aria-labelledby="template-heading">
        <h2 className="section-title" id="template-heading">
          Decision templates
        </h2>
        <div className="stack template-grid">
          {decisionTemplates.map((template) => (
            <Link
              className="template-card"
              href={`/app/decisions/new/${template.id}`}
              key={template.id}
            >
              <div className="meta-row">
                <span className="pill">{template.time}</span>
                <span>Template</span>
              </div>
              <h2>{template.action}</h2>
              <p>{template.description}</p>
              <span className="meta-row">
                Start intake <ChevronRight size={16} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </AppFrame>
  );
}

export function IntakePage({ templateId }: { templateId: string }) {
  const template = getTemplate(templateId);

  if (!template) {
    return (
      <AppFrame>
        <Link className="button button-plain no-print" href="/app">
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </Link>
        <h1 className="page-title">Template not found.</h1>
        <p className="page-lede">
          Choose one of the three v1 templates to start a decision.
        </p>
        <div className="section">
          <Link className="button button-primary" href="/app">
            Pick template
          </Link>
        </div>
      </AppFrame>
    );
  }

  return <IntakeForm template={template} />;
}

function IntakeForm({ template }: { template: DecisionTemplate }) {
  const router = useRouter();
  const draftKey = `${DRAFT_PREFIX}${template.id}`;
  const [values, setValues] = useState<FieldState>(() =>
    readDraft(template, draftKey),
  );
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const [showHint, setShowHint] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.localStorage.getItem("decision-doctor:intake-hint") !==
          "dismissed",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(values));
  }, [draftKey, values]);

  useEffect(() => {
    const handleOnline = () => {
      if (window.localStorage.getItem(QUEUE_KEY)) {
        void submitDecision(values, template, router, setSubmitState);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [router, template, values]);

  const completedCount = template.fields.filter((field) =>
    hasValue(values[field.id]),
  ).length;

  function updateField(field: IntakeField, value: FieldValue) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field.id];
      return next;
    });
    setValues((current) => ({ ...current, [field.id]: value }));
  }

  function saveForLater() {
    window.localStorage.setItem(draftKey, JSON.stringify(values));
    setSubmitState({
      status: "error",
      title: "Draft saved on this device.",
      message:
        "Your answers are stored locally. Return to this template on this browser to continue.",
      retryable: false,
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateFields(template, values);
    setFieldErrors(validation.errors);
    if (!validation.valid) {
      setSubmitState({
        status: "error",
        title: "Some answers need attention.",
        message: "Fix the highlighted fields, then request the recommendation.",
        retryable: false,
      });
      return;
    }
    await submitDecision(values, template, router, setSubmitState);
  }

  return (
    <AppFrame showHistory={false}>
      <Link className="button button-plain no-print" href="/app">
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </Link>
      <p className="eyebrow">Structured intake</p>
      <h1 className="page-title">{template.title} decision</h1>
      <p className="page-lede">
        {completedCount} of {template.fields.length} fields complete. No PHI is
        needed for this decision.
      </p>

      {showHint ? (
        <div className="section hint">
          <strong>This takes about 5 minutes.</strong>
          <span>
            Your answers stay on this device until submit. Use business facts
            only, not patient details.
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              window.localStorage.setItem(
                "decision-doctor:intake-hint",
                "dismissed",
              );
              setShowHint(false);
            }}
          >
            Dismiss hint
          </button>
        </div>
      ) : null}

      <form className="section" onSubmit={onSubmit}>
        <div className="form-grid">
          {template.fields.map((field) => (
            <FieldControl
              error={fieldErrors[field.id]}
              field={field}
              key={field.id}
              onChange={(value) => updateField(field, value)}
              value={values[field.id]}
            />
          ))}
        </div>

        {submitState.status === "error" ? (
          <div className="section error" role="status">
            <strong>{submitState.title}</strong>
            <span>{submitState.message}</span>
            {submitState.retryable ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  void submitDecision(values, template, router, setSubmitState)
                }
              >
                <RefreshCw size={18} aria-hidden="true" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="sticky-action">
          <div className="stack">
            <button
              className="button button-primary"
              disabled={submitState.status === "submitting"}
              type="submit"
            >
              {submitState.status === "submitting" ? (
                <>
                  <RefreshCw size={18} aria-hidden="true" />
                  Requesting recommendation
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Get recommendation
                </>
              )}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={saveForLater}
            >
              Save draft
            </button>
          </div>
        </div>
      </form>
    </AppFrame>
  );
}

function FieldControl({
  error,
  field,
  onChange,
  value,
}: {
  error?: string;
  field: IntakeField;
  onChange: (value: FieldValue) => void;
  value: FieldValue | undefined;
}) {
  const errorId = `${field.id}-error`;

  if (field.type === "number") {
    const numberValue = typeof value === "number" ? String(value) : "";
    return (
      <div className="field">
        <label htmlFor={field.id}>{field.label}</label>
        <p className="field-help">{field.help}</p>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          id={field.id}
          inputMode="decimal"
          max={field.max}
          min={field.min}
          name={field.id}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === "" ? "" : Number(next));
          }}
          step={field.step ?? 1}
          type="number"
          value={numberValue}
        />
        {field.suffix ? <span className="field-help">{field.suffix}</span> : null}
        {error ? (
          <span className="field-help" id={errorId}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  if (field.type === "select") {
    const selectedValue = typeof value === "string" ? value : "";
    return (
      <div className="field">
        <label htmlFor={field.id}>{field.label}</label>
        <p className="field-help">{field.help}</p>
        <select
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          id={field.id}
          name={field.id}
          onChange={(event) => onChange(event.target.value)}
          value={selectedValue}
        >
          <option value="">Choose one</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <span className="field-help" id={errorId}>
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <fieldset className="field">
      <legend>{field.label}</legend>
      <p className="field-help">{field.help}</p>
      <div className="checkbox-list">
        {field.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label className="check-row" key={option.value}>
              <input
                checked={checked}
                name={field.id}
                onChange={() => {
                  const next = checked
                    ? selected.filter((item) => item !== option.value)
                    : [...selected, option.value].slice(0, field.maxSelected);
                  onChange(next);
                }}
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <span className="field-help" id={errorId}>
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

export function DecisionHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      setLoading(true);
      setError(null);
      const localItems = readCompleted().map(outputToHistoryItem);
      try {
        const response = await fetch("/api/decisions", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`History API returned ${response.status}.`);
        }
        const body: unknown = await response.json();
        const apiItems = parseApiHistory(body);
        if (mounted) setItems(mergeHistory(localItems, apiItems));
      } catch (err) {
        if (mounted) {
          setItems(localItems);
          setError(
            err instanceof Error
              ? err.message
              : "History API is unavailable.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadHistory();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppFrame showHistory={false}>
      <Link className="button button-plain no-print" href="/app">
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </Link>
      <p className="eyebrow">Decision history</p>
      <h1 className="page-title">Review prior decisions.</h1>
      <p className="page-lede">
        Saved recommendations appear here after the API returns a valid decision
        output.
      </p>

      {error ? (
        <div className="section error" role="status">
          <strong>History API unavailable.</strong>
          <span>{error} Local completed decisions are still shown.</span>
        </div>
      ) : null}

      <section className="section" aria-label="Prior decisions">
        {loading ? (
          <div className="hint">
            <strong>Loading history.</strong>
            <span>Checking saved decisions from this device and the API.</span>
          </div>
        ) : items.length > 0 ? (
          <div className="history-list">
            {items.map((item) => (
              <Link
                className="history-item"
                href={`/app/decisions/${item.id}`}
                key={item.id}
              >
                <h2>{item.title}</h2>
                <p>
                  {item.templateId} · {formatDate(item.decidedAt)} ·{" "}
                  {item.confidence === undefined
                    ? item.status ?? "saved"
                    : `${item.confidence}% confidence`}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No completed decisions yet.</strong>
            <span>Start with capacity, pricing, or an admin hire decision.</span>
            <Link className="button button-primary" href="/app">
              Pick template
            </Link>
          </div>
        )}
      </section>
    </AppFrame>
  );
}

export function DecisionDetailPage({ decisionId }: { decisionId: string }) {
  const [output, setOutput] = useState<DecisionOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadDecision() {
      const local = readCompleted().find(
        (decision) => decision.decisionId === decisionId,
      );
      if (local) {
        setOutput(local);
        return;
      }

      try {
        const response = await fetch("/api/decisions", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Decision API returned ${response.status}.`);
        }
        const body: unknown = await response.json();
        const rows = Array.isArray(body) ? body : [];
        const row = rows.find(
          (candidate) =>
            isRecord(candidate) &&
            typeof candidate.id === "string" &&
            candidate.id === decisionId,
        );
        const parsed = rowToDecisionOutput(row);
        if (mounted && parsed) setOutput(parsed);
        if (mounted && !parsed) {
          setError("The decision exists only if the API returns full output.");
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Decision API is unavailable.",
          );
        }
      }
    }
    void loadDecision();
    return () => {
      mounted = false;
    };
  }, [decisionId]);

  async function shareDecision() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "Decision Doctor summary", url });
      setShared(true);
      return;
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
  }

  return (
    <AppFrame showHistory={false}>
      <Link className="button button-plain no-print" href="/app/decisions">
        <ArrowLeft size={18} aria-hidden="true" />
        History
      </Link>
      <p className="eyebrow">Recommendation</p>
      <h1 className="page-title">Decision summary</h1>
      <p className="page-lede print-only">
        Printed from Decision Doctor on {formatDate(new Date().toISOString())}.
      </p>

      {output ? <RecommendationView output={output} /> : null}

      {!output && !error ? (
        <div className="section hint">
          <strong>Loading decision.</strong>
          <span>Checking this device and the API for a completed output.</span>
        </div>
      ) : null}

      {error ? (
        <div className="section error" role="status">
          <strong>Decision output unavailable.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {output ? (
        <div className="sticky-action no-print">
          <div className="stack">
            <button
              className="button button-primary"
              type="button"
              onClick={() => window.print()}
            >
              <Printer size={18} aria-hidden="true" />
              Print summary
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void shareDecision()}
            >
              <Share2 size={18} aria-hidden="true" />
              {shared ? "Link copied" : "Share link"}
            </button>
          </div>
        </div>
      ) : null}
    </AppFrame>
  );
}

function RecommendationView({ output }: { output: DecisionOutput }) {
  const confidenceClass = confidenceTone(output.recommendation.confidence);

  return (
    <>
      <section className="section recommendation-hero" aria-label="Recommendation">
        <span className={`confidence ${confidenceClass}`}>
          Confidence: {output.recommendation.confidence}%
        </span>
        <h2>Recommended: {output.recommendation.option}</h2>
        <p>{output.recommendation.rationale}</p>
        <div className="panel panel-pad">
          <p className="eyebrow">Robust fallback</p>
          <h2>{output.robustAlternative.option}</h2>
          <p>{output.robustAlternative.why}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="reducers-heading">
        <h2 className="section-title" id="reducers-heading">
          Workload reducers
        </h2>
        <div className="carousel">
          {output.workloadReducers.slice(0, 3).map((reducer) => (
            <article className="reducer-card" key={reducer.title}>
              <div className="meta-row">
                <span className="pill">{reducer.type}</span>
                <span>{reducer.automationLevel.replace("_", " ")}</span>
              </div>
              <h3>{reducer.title}</h3>
              <p className="field-help">{reducer.description}</p>
              <div className="artifact">{formatArtifact(reducer.artifact)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="section details-group" aria-label="Decision reasoning">
        <details>
          <summary>Alternatives considered</summary>
          <div className="details-content">
            {output.alternatives.map((alternative) => (
              <p key={alternative.option}>
                <strong>{alternative.option}:</strong> eliminated at stage{" "}
                {alternative.eliminatedAtStage}. {alternative.reason}
              </p>
            ))}
          </div>
        </details>
        <details>
          <summary>Show the work</summary>
          <div className="details-content">
            {output.methodTrace.map((entry) => (
              <div key={`${entry.stage}-${entry.name}`}>
                <p>
                  <strong>
                    Stage {entry.stage}: {entry.name}
                  </strong>
                </p>
                <pre>{JSON.stringify(entry.output, null, 2)}</pre>
              </div>
            ))}
          </div>
        </details>
      </section>
    </>
  );
}

export function AuthPage() {
  return (
    <AppFrame showHistory={false}>
      <Link className="button button-plain no-print" href="/app">
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </Link>
      <p className="eyebrow">Account</p>
      <h1 className="page-title">Auth is not connected in this slice.</h1>
      <p className="page-lede">
        This client is ready to route users here once Better Auth endpoints are
        added by the auth owner. The decision flow still uses local draft state
        and the real decisions API contract.
      </p>
    </AppFrame>
  );
}

function initialValues(template: DecisionTemplate): FieldState {
  return Object.fromEntries(
    template.fields.map((field) => [field.id, field.type === "multi" ? [] : ""]),
  );
}

function readDraft(template: DecisionTemplate, draftKey: string): FieldState {
  if (typeof window === "undefined") return initialValues(template);
  const parsed = parseJson<FieldState>(window.localStorage.getItem(draftKey));
  return { ...initialValues(template), ...(parsed ?? {}) };
}

function validateFields(template: DecisionTemplate, values: FieldState) {
  const errors: Record<string, string> = {};
  for (const field of template.fields) {
    const value = values[field.id];
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors[field.id] = "Enter a number.";
      } else if (value < field.min || value > field.max) {
        errors[field.id] = `Use a value from ${field.min} to ${field.max}.`;
      }
    } else if (field.type === "select") {
      if (typeof value !== "string" || value.length === 0) {
        errors[field.id] = "Choose one option.";
      }
    } else if (!Array.isArray(value) || value.length === 0) {
      errors[field.id] = "Choose at least one task.";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

async function submitDecision(
  values: FieldState,
  template: DecisionTemplate,
  router: ReturnType<typeof useRouter>,
  setSubmitState: (state: SubmitState) => void,
) {
  setSubmitState({ status: "submitting" });
  const input = {
    templateId: template.id,
    source: {
      type: "user_form",
      capturedAt: new Date().toISOString(),
    },
    fields: values,
    context: {
      userId: getStableUuid(USER_KEY),
      tenantId: getStableUuid(TENANT_KEY),
    },
  };

  const parsedInput = DecisionInputSchema.safeParse(input);
  if (!parsedInput.success) {
    setSubmitState({
      status: "error",
      title: "Submission is not valid.",
      message: "The form could not match the shared API contract.",
      retryable: false,
    });
    return;
  }

  try {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsedInput.data),
    });

    if (!response.ok) {
      const message = await readError(response);
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(parsedInput.data));
      setSubmitState({
        status: "error",
        title: "Recommendation was not created.",
        message,
        retryable: true,
      });
      return;
    }

    const body: unknown = await response.json();
    const parsedOutput = DecisionOutputSchema.safeParse(body);
    if (!parsedOutput.success) {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(parsedInput.data));
      setSubmitState({
        status: "error",
        title: "Engine output is not ready.",
        message:
          "The API responded, but it did not return the DecisionOutput contract yet. Retry after the backend engine is connected.",
        retryable: true,
      });
      return;
    }

    window.localStorage.removeItem(QUEUE_KEY);
    saveCompleted(parsedOutput.data);
    router.push(`/app/decisions/${parsedOutput.data.decisionId}`);
  } catch {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(parsedInput.data));
    setSubmitState({
      status: "error",
      title: "API is unavailable.",
      message:
        "Your submission is saved on this device. Reconnect, then retry the same request.",
      retryable: true,
    });
  }
}

function getStableUuid(key: string) {
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function hasValue(value: FieldValue | undefined) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "boolean";
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null);
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return `The API returned ${response.status}. No recommendation was saved.`;
}

function saveCompleted(output: DecisionOutput) {
  const current = readCompleted();
  const next = [
    output,
    ...current.filter((item) => item.decisionId !== output.decisionId),
  ].slice(0, 20);
  window.localStorage.setItem(COMPLETE_KEY, JSON.stringify(next));
}

function readCompleted(): DecisionOutput[] {
  if (typeof window === "undefined") return [];
  const parsed = parseJson<unknown[]>(window.localStorage.getItem(COMPLETE_KEY));
  if (!parsed) return [];
  return parsed.flatMap((item) => {
    const output = DecisionOutputSchema.safeParse(item);
    return output.success ? [output.data] : [];
  });
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function outputToHistoryItem(output: DecisionOutput): HistoryItem {
  return {
    id: output.decisionId,
    templateId: "completed",
    title: output.recommendation.option,
    decidedAt: output.decidedAt.toISOString(),
    confidence: output.recommendation.confidence,
    status: "complete",
  };
}

function parseApiHistory(body: unknown): HistoryItem[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    const recommendation = isRecord(row.recommendation)
      ? row.recommendation
      : null;
    const title =
      recommendation && typeof recommendation.option === "string"
        ? recommendation.option
        : "Decision saved";
    const confidence =
      recommendation && typeof recommendation.confidence === "number"
        ? recommendation.confidence
        : undefined;
    return [
      {
        id: row.id,
        templateId: typeof row.templateId === "string" ? row.templateId : "decision",
        title,
        decidedAt:
          typeof row.createdAt === "string" ? row.createdAt : undefined,
        confidence,
        status: typeof row.status === "string" ? row.status : undefined,
      },
    ];
  });
}

function mergeHistory(localItems: HistoryItem[], apiItems: HistoryItem[]) {
  const map = new Map<string, HistoryItem>();
  for (const item of [...apiItems, ...localItems]) map.set(item.id, item);
  return Array.from(map.values());
}

function rowToDecisionOutput(row: unknown): DecisionOutput | null {
  if (!isRecord(row)) return null;
  const candidate = {
    decisionId: row.id,
    decidedAt: row.createdAt ?? new Date().toISOString(),
    recommendation: row.recommendation,
    alternatives: row.alternatives,
    robustAlternative: row.robustAlternative,
    methodTrace: row.methodTrace,
    workloadReducers: row.workloadReducers,
    destinations: row.destinations ?? [],
  };
  const parsed = DecisionOutputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function confidenceTone(confidence: number) {
  if (confidence >= 75) return "confidence-green";
  if (confidence >= 50) return "confidence-amber";
  return "confidence-red";
}

function formatArtifact(
  artifact: DecisionOutput["workloadReducers"][number]["artifact"],
) {
  if (artifact.promptText) return artifact.promptText;
  if (artifact.skillName) return `Skill: ${artifact.skillName}`;
  if (artifact.pluginUrl) return artifact.pluginUrl;
  if (artifact.mcpServer) return `MCP server: ${artifact.mcpServer}`;
  if (artifact.playbookSteps) return artifact.playbookSteps.join("\n");
  return "Open the saved recommendation and apply this action manually.";
}

function formatDate(value: string | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function TemplateIdFromParams() {
  const params = useParams<{ templateId: TemplateId }>();
  return <IntakePage templateId={params.templateId} />;
}
