"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { TemplateField } from "@/lib/engine/templates/types";
import { saveDraft, loadDraft, clearDraft, enqueueSubmission } from "@/lib/idb";

interface Props {
  templateId: "capacity" | "pricing" | "admin-hire";
  fields: TemplateField[];
  title: string;
}

const FIRST_RUN_FLAG = "dd:firstRunHintDismissed";

// Honest progress copy — engine takes ~9-12s. Rotating messages keep the wait
// from feeling like a crash. Tied to actual MCDA stages so a power user could
// follow along, but plain enough for a non-technical user.
const PROGRESS_STAGES = [
  "Reading your answers…",
  "Listing alternatives we should consider…",
  "Removing options that break your limits…",
  "Weighing each remaining option…",
  "Picking the top choice and a safer fallback…",
];

export function IntakeForm({ templateId, fields, title }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "idle" | "submitting" | "queued" | "error"; msg?: string }>({ kind: "idle" });
  const [showHint, setShowHint] = useState(true);
  const [progressIdx, setProgressIdx] = useState(0);
  const initialized = useRef(false);

  // Rotate progress copy every ~2s while submitting so the wait feels alive.
  useEffect(() => {
    if (status.kind !== "submitting") {
      setProgressIdx(0);
      return;
    }
    const t = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_STAGES.length - 1));
    }, 2000);
    return () => clearInterval(t);
  }, [status.kind]);

  // Load draft + hint state on mount.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (typeof window !== "undefined") {
      try {
        if (window.localStorage.getItem(FIRST_RUN_FLAG)) setShowHint(false);
      } catch {
        /* ignore */
      }
    }
    void loadDraft(templateId).then((d) => {
      if (d?.fields) setValues(d.fields);
    });
  }, [templateId]);

  // Persist to IndexedDB on every change (debounced via tick).
  useEffect(() => {
    if (!initialized.current) return;
    const t = setTimeout(() => {
      void saveDraft({ templateId, fields: values, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(t);
  }, [values, templateId]);

  function setField(id: string, v: unknown) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  function dismissHint() {
    setShowHint(false);
    try {
      window.localStorage.setItem(FIRST_RUN_FLAG, "1");
    } catch {
      /* ignore */
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.id];
      const isEmpty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (isEmpty) {
        next[f.id] = "Required.";
        continue;
      }
      if (f.kind.type === "number" || f.kind.type === "slider" || f.kind.type === "number-picker") {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) next[f.id] = "Enter a number.";
        else if (f.kind.min !== undefined && n < f.kind.min) next[f.id] = `Minimum ${f.kind.min}.`;
        else if (f.kind.max !== undefined && n > f.kind.max) next[f.id] = `Maximum ${f.kind.max}.`;
      }
      if (f.kind.type === "range") {
        if (!Array.isArray(v) || v.length !== 2) next[f.id] = "Set a low and high end.";
        else {
          const [lo, hi] = v as [number, number];
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) next[f.id] = "Numbers only.";
          else if (lo > hi) next[f.id] = "Low end must be ≤ high end.";
          else if (lo < f.kind.min || hi > f.kind.max) next[f.id] = `Must be within ${f.kind.min}–${f.kind.max}.`;
        }
      }
      if (f.kind.type === "text" && typeof v === "string" && v.length > f.kind.maxLength) {
        next[f.id] = `Max ${f.kind.maxLength} characters.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStatus({ kind: "submitting" });

    const cleanedValues: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.id];
      if (f.kind.type === "number" || f.kind.type === "slider" || f.kind.type === "number-picker") {
        cleanedValues[f.id] = Number(v);
      } else if (f.kind.type === "range") {
        // Send range as the array tuple [low, high]; engine receives this and
        // can use the midpoint for ranking + the spread for confidence shading.
        cleanedValues[f.id] = Array.isArray(v) ? v.map(Number) : v;
      } else {
        cleanedValues[f.id] = v;
      }
    }

    const payload = {
      templateId,
      source: { type: "user_form", capturedAt: new Date().toISOString() },
      fields: cleanedValues,
    };

    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setStatus({
          kind: "error",
          msg:
            body?.message ?? "Daily limit reached. Try again tomorrow.",
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({
          kind: "error",
          msg: body?.error ?? `Submission failed (${res.status}).`,
        });
        return;
      }
      const body = await res.json();
      const id = body?.decision?.decisionId;
      if (!id) {
        setStatus({ kind: "error", msg: "Server did not return a decision id." });
        return;
      }
      await clearDraft(templateId);
      router.push(`/app/decisions/${id}`);
    } catch {
      // Network failure → queue for replay (PRD §U-07).
      await enqueueSubmission(payload);
      setStatus({
        kind: "queued",
        msg: "You're offline. Saved your answers — we'll submit when you reconnect.",
      });
    }
  }

  // Progress: count fields with a non-empty value (PP-inspired progress badge —
  // gives the user a sense of "where am I" without converting to a multi-step
  // wizard. We keep the flat form for low-friction scanning + browser autofill,
  // and add the badge for orientation + commitment-momentum.
  const answeredCount = fields.filter((f) => {
    const v = values[f.id];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;
  const total = fields.length;
  const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <form onSubmit={submit} className="mt-4 space-y-5">
      {showHint && (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-ink-subtle flex items-start justify-between gap-3">
          <div>
            This takes ~5 minutes. Your answers stay on this device until you submit.
            We never accept patient names or other identifying info.
          </div>
          <button
            type="button"
            onClick={dismissHint}
            className="text-xs text-ink-muted underline ml-3 min-h-[36px]"
          >
            Got it
          </button>
        </div>
      )}

      {/* Progress badge + thin bar — orientation cue per UX critic 2026-05-10
          and ProductPilot adaptive-intake pattern. */}
      <div
        className="flex items-center justify-between gap-3 text-xs text-ink-muted"
        aria-live="polite"
      >
        <span>{answeredCount} of {total} answered</span>
        <span aria-hidden="true">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Intake completion"
        className="h-1 bg-slate-200 rounded-full overflow-hidden -mt-3"
      >
        <div
          className="h-full bg-ink transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {fields.map((f, i) => {
        const isAnswered = (() => {
          const v = values[f.id];
          if (v === undefined || v === null || v === "") return false;
          if (Array.isArray(v) && v.length === 0) return false;
          return true;
        })();
        return (
          <div key={f.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-ink-muted tabular-nums" aria-hidden="true">
                {i + 1}.
              </span>
              <label className="block text-sm font-medium text-ink">
                {f.label}
                {isAnswered && (
                  <span className="ml-2 text-xs text-confidence-high" aria-hidden="true">✓</span>
                )}
              </label>
            </div>
            {f.hint && <div className="text-xs text-ink-muted mt-0.5 ml-5">{f.hint}</div>}
            <div className="ml-5">
              <FieldInput field={f} value={values[f.id]} onChange={(v) => setField(f.id, v)} />
            </div>
            {errors[f.id] && <div className="mt-1 text-xs text-confidence-low ml-5">{errors[f.id]}</div>}
          </div>
        );
      })}

      <div className="sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-canvas-raised/95 backdrop-blur border-t border-slate-200 flex flex-col gap-2 no-print">
        <button
          type="submit"
          disabled={status.kind === "submitting"}
          className="inline-flex items-center justify-center px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px] disabled:opacity-60"
          aria-live="polite"
        >
          {status.kind === "submitting"
            ? PROGRESS_STAGES[progressIdx]
            : "Get my recommendation"}
        </button>
        {status.kind === "submitting" && (
          <div className="text-xs text-ink-muted text-center" aria-live="polite">
            Usually 8–12 seconds. We're walking through the math.
          </div>
        )}
        {status.kind === "queued" && (
          <div className="text-xs text-confidence-mid">{status.msg}</div>
        )}
        {status.kind === "error" && (
          <div className="text-xs text-confidence-low">{status.msg}</div>
        )}
      </div>
      <input type="hidden" name="title" value={title} />
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseInput = "w-full rounded-lg border-slate-300 focus:border-ink focus:ring-ink min-h-[44px]";

  if (field.kind.type === "number") {
    return (
      <div className="mt-1 flex items-stretch gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={field.kind.min}
          max={field.kind.max}
          step={field.kind.step ?? 1}
          value={value as number | string | undefined ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={baseInput}
        />
        {field.kind.unit && (
          <span className="self-center text-sm text-ink-muted px-2">{field.kind.unit}</span>
        )}
      </div>
    );
  }
  if (field.kind.type === "slider") {
    const k = field.kind;
    const step = k.step ?? 1;
    const current = typeof value === "number" ? value : (k.min + k.max) / 2;
    const ticks = k.ticks ?? [k.min, Math.round((k.min + k.max) / 2), k.max];
    return (
      <div className="mt-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xl font-semibold tabular-nums text-ink">
            {current}
            {k.unit && <span className="text-sm font-normal text-ink-muted ml-1">{k.unit}</span>}
          </span>
        </div>
        <input
          type="range"
          min={k.min}
          max={k.max}
          step={step}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-ink min-h-[44px]"
          aria-label={field.label}
        />
        <div className="flex justify-between text-xs text-ink-muted mt-0.5 tabular-nums">
          {ticks.map((t) => (
            <span key={t}>{t}{k.unit ? k.unit : ""}</span>
          ))}
        </div>
      </div>
    );
  }
  if (field.kind.type === "number-picker") {
    const k = field.kind;
    const step = k.step ?? 1;
    const current = typeof value === "number" ? value : k.min;
    const dec = () => onChange(Math.max(k.min, current - step));
    const inc = () => onChange(Math.min(k.max, current + step));
    return (
      <div className="mt-2 flex items-stretch gap-2 max-w-[280px]">
        <button
          type="button"
          onClick={dec}
          disabled={current <= k.min}
          aria-label="Decrease"
          className="w-12 h-12 rounded-lg border border-slate-300 text-xl text-ink disabled:opacity-40"
        >
          −
        </button>
        <div className="flex-1 flex items-center justify-center rounded-lg border border-slate-300 bg-canvas-raised">
          <span className="text-2xl font-semibold tabular-nums text-ink">
            {current}
            {k.unit && <span className="text-sm font-normal text-ink-muted ml-1">{k.unit}</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={inc}
          disabled={current >= k.max}
          aria-label="Increase"
          className="w-12 h-12 rounded-lg border border-slate-300 text-xl text-ink disabled:opacity-40"
        >
          +
        </button>
      </div>
    );
  }
  if (field.kind.type === "range") {
    const k = field.kind;
    const step = k.step ?? 1;
    const tuple = (Array.isArray(value) ? value : null) as [number, number] | null;
    const lo = tuple?.[0] ?? k.defaultLow ?? k.min;
    const hi = tuple?.[1] ?? k.defaultHigh ?? k.max;
    const setLo = (v: number) => onChange([Math.min(v, hi - step), hi]);
    const setHi = (v: number) => onChange([lo, Math.max(v, lo + step)]);
    return (
      <div className="mt-2">
        <div className="text-2xl font-semibold tabular-nums text-ink">
          {k.unit ?? ""}{lo}
          <span className="mx-2 text-ink-muted text-base font-normal">to</span>
          {k.unit ?? ""}{hi}
        </div>
        <div className="text-xs text-ink-muted mb-2">
          Move both handles. The engine treats this as a range so you don't have
          to be exact.
        </div>
        <div className="grid gap-2">
          <label className="block">
            <span className="text-xs text-ink-muted">Low end</span>
            <input
              type="range"
              min={k.min}
              max={k.max}
              step={step}
              value={lo}
              onChange={(e) => setLo(Number(e.target.value))}
              className="w-full accent-ink min-h-[44px]"
              aria-label={`${field.label} — low`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">High end</span>
            <input
              type="range"
              min={k.min}
              max={k.max}
              step={step}
              value={hi}
              onChange={(e) => setHi(Number(e.target.value))}
              className="w-full accent-ink min-h-[44px]"
              aria-label={`${field.label} — high`}
            />
          </label>
        </div>
        <div className="flex justify-between text-xs text-ink-muted mt-0.5 tabular-nums">
          <span>{k.min}{k.unit ? k.unit : ""}</span>
          <span>{k.max}{k.unit ? k.unit : ""}</span>
        </div>
      </div>
    );
  }
  if (field.kind.type === "select") {
    return (
      <select
        value={(value as string | undefined) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} mt-1`}
      >
        <option value="" disabled>
          Pick one…
        </option>
        {field.kind.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="mt-1 flex flex-wrap gap-2">
        {field.kind.options.map((o) => {
          const on = arr.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`px-3 py-2 rounded-full border text-sm min-h-[36px] ${
                on ? "bg-ink text-white border-ink" : "bg-canvas-raised border-slate-300 text-ink-subtle"
              }`}
              onClick={() => {
                const next = on ? arr.filter((v) => v !== o.value) : [...arr, o.value];
                onChange(next);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.kind.type === "boolean") {
    const v = value === true ? "yes" : value === false ? "no" : "";
    return (
      <div className="mt-1 flex gap-2">
        {[
          { v: "yes", label: "Yes" },
          { v: "no", label: "No" },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            className={`px-4 py-2 rounded-full border text-sm min-h-[44px] flex-1 ${
              v === opt.v ? "bg-ink text-white border-ink" : "bg-canvas-raised border-slate-300 text-ink-subtle"
            }`}
            onClick={() => onChange(opt.v === "yes")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
  // text
  return (
    <input
      type="text"
      maxLength={field.kind.maxLength}
      placeholder={field.kind.placeholder}
      value={(value as string | undefined) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={`${baseInput} mt-1`}
    />
  );
}
