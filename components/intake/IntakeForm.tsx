"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AhpPairwise, type AhpCriterion } from "@/components/elicitation/AhpPairwise";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type FieldKind = "number" | "text" | "select" | "boolean";
type Field = {
  name: string;
  label: string;
  helper?: string;
  kind: FieldKind;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

type PublicTemplate = {
  id: "capacity" | "pricing" | "admin-hire";
  label: string;
  description: string;
  fields: Field[];
  // F-10: surface the template's criteria so the AHP path can render labels.
  criteria?: AhpCriterion[];
};

const cacheKey = (id: string) => `dd:intake:draft:${id}`;

export function IntakeForm({ template }: { template: PublicTemplate }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // F-10: weight-elicitation toggle. Default "llm" — Stage 1 LLM-driven path.
  // "ahp" surfaces the pairwise grid; user-supplied comparisons drive Stage 1B.
  const [weightSource, setWeightSource] = useState<"llm" | "ahp">("llm");
  const [ahpComparisons, setAhpComparisons] = useState<Record<string, number>>({});

  // Restore IndexedDB-style draft (we use localStorage; the cache acts as a
  // fast IndexedDB-equivalent for a tiny single-page form. Background sync
  // would graduate this to IDB if F-08 lands.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(cacheKey(template.id));
      if (raw) setValues(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [template.id]);

  const update = (name: string, v: unknown) => {
    const next = { ...values, [name]: v };
    setValues(next);
    try {
      window.localStorage.setItem(cacheKey(template.id), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const required = template.fields.filter((f) => f.required ?? true);
  const filled = required.every((f) => {
    const v = values[f.name];
    if (f.kind === "boolean") return v !== undefined;
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    return true;
  });

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        templateId: template.id,
        source: { type: "user_form", capturedAt: new Date().toISOString() },
        fields: values,
        // userId/tenantId are server-overridden, but Zod requires shape; pass uuid-zero placeholders.
        context: {
          userId: "00000000-0000-0000-0000-000000000000",
          tenantId: "00000000-0000-0000-0000-000000000000",
        },
        // F-10: route to Stage 1B (AHP) only when the user opted in AND filled
        // enough pairs. Otherwise the server-side default LLM path runs.
        ...(weightSource === "ahp" && Object.keys(ahpComparisons).length > 0
          ? { weightSource: "ahp" as const, ahpComparisons }
          : {}),
      };
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        throw new Error(
          "Daily decision limit reached (20 per day). Try again tomorrow.",
        );
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Request failed (${res.status})`);
      }
      const out = await res.json();
      try {
        window.localStorage.removeItem(cacheKey(template.id));
      } catch {
        /* ignore */
      }
      router.push(`/app/decisions/${out.decisionId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (filled && !busy) submit();
      }}
    >
      {template.fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={values[f.name]}
          onChange={(v) => update(f.name, v)}
        />
      ))}

      {/* F-10: weight-elicitation branch toggle. Only render when the template
          ships criteria. AHP is opt-in — the default LLM path covers the
          large majority of users; AHP is for high-trust SED/VDD decisions. */}
      {template.criteria && template.criteria.length >= 3 && (
        <Card flat>
          <section aria-label="Weight elicitation method" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
                  Who sets the weights?
                </p>
                <p className="mt-0.5 text-[14px] font-semibold leading-snug text-ink">
                  {weightSource === "llm"
                    ? "Let the AI propose weights (default)"
                    : "Set the weights yourself (AHP)"}
                </p>
              </div>
              <div
                role="tablist"
                aria-label="Weight source"
                className="inline-flex h-9 items-center rounded-full border border-line bg-bg p-0.5 text-[12.5px] font-medium"
              >
                <button
                  role="tab"
                  type="button"
                  aria-selected={weightSource === "llm"}
                  onClick={() => setWeightSource("llm")}
                  className={`inline-flex h-8 items-center rounded-full px-3 transition-colors ${
                    weightSource === "llm"
                      ? "bg-ink text-paper"
                      : "text-mute hover:text-ink"
                  }`}
                >
                  AI proposes
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={weightSource === "ahp"}
                  onClick={() => setWeightSource("ahp")}
                  className={`inline-flex h-8 items-center rounded-full px-3 transition-colors ${
                    weightSource === "ahp"
                      ? "bg-ink text-paper"
                      : "text-mute hover:text-ink"
                  }`}
                >
                  I'll set them
                </button>
              </div>
            </div>
            {weightSource === "ahp" && (
              <div>
                <AhpPairwise
                  criteria={template.criteria}
                  comparisons={ahpComparisons}
                  onChange={(next) => setAhpComparisons(next)}
                />
              </div>
            )}
          </section>
        </Card>
      )}

      <Button
        type="submit"
        variant="primary"
        full
        disabled={!filled || busy}
        aria-busy={busy}
        className="min-h-11 text-[14px]"
      >
        {busy ? "Running engine..." : "Get recommendation"}
      </Button>

      {err && <p className="text-[13px] status-error">{err}</p>}
      <p className="text-[12px] text-mute">
        Engine takes ~5 seconds. Two short Groq calls power the value tags and
        the recommendation copy. The math is deterministic.
      </p>
    </form>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.name}`;
  if (field.kind === "select") {
    return (
      <label htmlFor={id} className="block text-[13.5px]">
        <span className="text-ink font-medium">
          {field.label}
          {field.required !== false && (
            <span aria-hidden className="ml-0.5 text-mute">
              *
            </span>
          )}
        </span>
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block min-h-11 w-full rounded-md border-line bg-paper px-3 text-text focus:border-ink focus:ring-ink"
        >
          <option value="" disabled>
            Select…
          </option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.helper && (
          <span className="mt-1 block text-[12px] text-mute">{field.helper}</span>
        )}
      </label>
    );
  }
  if (field.kind === "boolean") {
    return (
      <label htmlFor={id} className="flex items-start gap-3 text-[13.5px]">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 rounded border-line text-ink focus:ring-ink"
        />
        <span>
          <span className="text-ink font-medium">{field.label}</span>
          {field.helper && (
            <span className="mt-0.5 block text-[12px] text-mute">
              {field.helper}
            </span>
          )}
        </span>
      </label>
    );
  }
  // Number with both min+max → render as a slider (easier on mobile + visual).
  if (
    field.kind === "number" &&
    typeof field.min === "number" &&
    typeof field.max === "number" &&
    Number.isFinite(field.min) &&
    Number.isFinite(field.max)
  ) {
    return <SliderRow id={id} field={field} value={value} onChange={onChange} />;
  }

  // Fallback: text input or unbounded number.
  return (
    <label htmlFor={id} className="block text-[13.5px]">
      <span className="text-ink font-medium">
        {field.label}
        {field.required !== false && (
          <span aria-hidden className="ml-0.5 text-mute">
            *
          </span>
        )}
      </span>
      <input
        id={id}
        type={field.kind === "number" ? "number" : "text"}
        inputMode={field.kind === "number" ? "decimal" : "text"}
        value={value === undefined || value === null ? "" : String(value)}
        min={field.min}
        max={field.max}
        maxLength={field.kind === "text" ? 256 : undefined}
        onChange={(e) => {
          if (field.kind === "number") {
            const n = e.target.value === "" ? undefined : Number(e.target.value);
            onChange(n);
          } else {
            onChange(e.target.value);
          }
        }}
        className="mt-1 block min-h-11 w-full rounded-md border-line bg-paper px-3 text-text focus:border-ink focus:ring-ink"
      />
      {field.helper && (
        <span className="mt-1 block text-[12px] text-mute">{field.helper}</span>
      )}
    </label>
  );
}

function SliderRow({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  // Default mid-range only when user hasn't set a value yet (so the slider is
  // visibly active immediately — Calm-precision: action button states require
  // a non-empty signal, but for sliders that signal is the thumb position).
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : Math.round((min + max) / 2);
  const hasUserValue = typeof value === "number" && Number.isFinite(value);

  const handleChange = (n: number) => {
    onChange(n);
  };

  return (
    <div className="block text-[13.5px]">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ink font-medium">
          {field.label}
          {field.required !== false && (
            <span aria-hidden className="ml-0.5 text-mute">
              *
            </span>
          )}
        </label>
        <span
          className={
            "inline-flex min-w-[3.5rem] justify-center rounded px-2 py-0.5 text-[13px] tabular-nums font-medium transition-colors duration-200 " +
            (hasUserValue ? "bg-ink text-paper" : "bg-line/40 text-mute")
          }
          aria-live="polite"
          aria-label={`Current value ${numericValue}`}
        >
          {numericValue}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={field.step ?? 1}
        value={numericValue}
        onChange={(e) => handleChange(Number(e.target.value))}
        onPointerDown={() => {
          if (!hasUserValue) handleChange(numericValue);
        }}
        className="mt-2 block h-11 w-full cursor-pointer accent-ink transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={numericValue}
      />
      <div className="mt-1 flex justify-between text-[12px] text-mute tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {field.helper && (
        <p className="mt-1 text-[12px] text-mute">{field.helper}</p>
      )}
    </div>
  );
}
