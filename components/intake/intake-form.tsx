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
      if (v === undefined || v === null || v === "") {
        next[f.id] = "Required.";
        continue;
      }
      if (f.kind.type === "number") {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) next[f.id] = "Enter a number.";
        else if (f.kind.min !== undefined && n < f.kind.min) next[f.id] = `Minimum ${f.kind.min}.`;
        else if (f.kind.max !== undefined && n > f.kind.max) next[f.id] = `Maximum ${f.kind.max}.`;
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
      if (f.kind.type === "number") cleanedValues[f.id] = Number(v);
      else cleanedValues[f.id] = v;
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
            className="text-xs text-ink-muted underline ml-3"
          >
            Got it
          </button>
        </div>
      )}

      {fields.map((f) => (
        <div key={f.id}>
          <label className="block text-sm font-medium text-ink">{f.label}</label>
          {f.hint && <div className="text-xs text-ink-muted mt-0.5">{f.hint}</div>}
          <FieldInput field={f} value={values[f.id]} onChange={(v) => setField(f.id, v)} />
          {errors[f.id] && <div className="mt-1 text-xs text-confidence-low">{errors[f.id]}</div>}
        </div>
      ))}

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
