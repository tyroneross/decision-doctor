"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
};

type PublicTemplate = {
  id: "capacity" | "pricing" | "admin-hire";
  label: string;
  description: string;
  fields: Field[];
};

const cacheKey = (id: string) => `dd:intake:draft:${id}`;

export function IntakeForm({ template }: { template: PublicTemplate }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

      <button
        type="submit"
        disabled={!filled || busy}
        className={
          "w-full rounded-md py-2.5 text-sm font-medium transition " +
          (filled && !busy
            ? "bg-ink-900 text-white hover:bg-ink-700"
            : "bg-ink-100 text-ink-500 cursor-not-allowed")
        }
        aria-disabled={!filled || busy}
      >
        {busy ? "Running engine..." : "Get recommendation"}
      </button>

      {err && <p className="text-sm status-error">{err}</p>}
      <p className="text-xs text-ink-500">
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
      <label htmlFor={id} className="block text-sm">
        <span className="text-ink-700">
          {field.label}
          {field.required !== false && (
            <span aria-hidden className="ml-0.5 text-ink-500">
              *
            </span>
          )}
        </span>
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded border-ink-300 focus:border-accent-600 focus:ring-accent-600"
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
          <span className="mt-1 block text-xs text-ink-500">{field.helper}</span>
        )}
      </label>
    );
  }
  if (field.kind === "boolean") {
    return (
      <label htmlFor={id} className="flex items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 rounded border-ink-300 text-accent-600 focus:ring-accent-600"
        />
        <span>
          <span className="text-ink-700">{field.label}</span>
          {field.helper && (
            <span className="mt-0.5 block text-xs text-ink-500">
              {field.helper}
            </span>
          )}
        </span>
      </label>
    );
  }
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="text-ink-700">
        {field.label}
        {field.required !== false && (
          <span aria-hidden className="ml-0.5 text-ink-500">
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
        className="mt-1 block w-full rounded border-ink-300 focus:border-accent-600 focus:ring-accent-600"
      />
      {field.helper && (
        <span className="mt-1 block text-xs text-ink-500">{field.helper}</span>
      )}
    </label>
  );
}
