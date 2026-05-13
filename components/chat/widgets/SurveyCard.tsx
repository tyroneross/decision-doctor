"use client";

// components/chat/widgets/SurveyCard.tsx
//
// Phase-2 chat-as-decision-front-door — renders a fresh-per-decision
// Survey as a multi-field card inside a chat assistant message bubble.
//
// Single submission: the user fills all fields, hits the submit button,
// and the parent receives one SurveySubmission. No conversational
// back-and-forth — that's what the existing clarifier flow is for.
//
// Calm Precision: ink-only treatment, no per-pain colors, ≥70% content,
// hierarchy via type weight rather than color or boxes.

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type {
  Survey,
  SurveyField,
  SurveyFieldValue,
  SurveySubmission,
} from "@/lib/engine/survey";

export interface SurveyCardProps {
  survey: Survey;
  disabled?: boolean;
  onSubmit: (submission: SurveySubmission) => void;
}

type AnswersMap = Record<string, SurveyFieldValue>;

function initialAnswers(survey: Survey): AnswersMap {
  const m: AnswersMap = {};
  for (const f of survey.fields) {
    switch (f.kind) {
      case "text":
        m[f.id] = { kind: "text", value: "" };
        break;
      case "slider":
      case "stepper":
        m[f.id] = { kind: "number", value: f.defaultValue };
        break;
      case "range":
        m[f.id] = { kind: "range", lo: f.defaultLo, hi: f.defaultHi };
        break;
      case "single-select":
        m[f.id] = {
          kind: "single",
          value: f.defaultValue ?? f.options[0]?.value ?? "",
        };
        break;
      case "multi-select":
        m[f.id] = { kind: "multi", values: f.defaultValues ?? [] };
        break;
    }
  }
  return m;
}

function validate(survey: Survey, answers: AnswersMap): string | null {
  for (const f of survey.fields) {
    const v = answers[f.id];
    if (f.required === false) continue;
    if (!v) return `Missing answer for "${f.label}"`;
    if (f.kind === "text" && v.kind === "text") {
      if (v.value.trim().length === 0) {
        return `Please fill in "${f.label}"`;
      }
    }
    if (f.kind === "single-select" && v.kind === "single") {
      if (!v.value) return `Pick an option for "${f.label}"`;
    }
    if (f.kind === "multi-select" && v.kind === "multi") {
      if (v.values.length === 0)
        return `Pick at least one for "${f.label}"`;
    }
  }
  return null;
}

export function SurveyCard({ survey, disabled, onSubmit }: SurveyCardProps) {
  const [answers, setAnswers] = React.useState<AnswersMap>(() =>
    initialAnswers(survey),
  );
  const [error, setError] = React.useState<string | null>(null);

  function setAnswer(id: string, next: SurveyFieldValue): void {
    setAnswers((prev) => ({ ...prev, [id]: next }));
    if (error) setError(null);
  }

  function handleSubmit(): void {
    const err = validate(survey, answers);
    if (err) {
      setError(err);
      return;
    }
    onSubmit({ surveyId: survey.id, answers });
  }

  return (
    <article
      className="dd-fade-up rounded-2xl border border-line bg-paper p-5 sm:p-6"
      aria-label={`Survey: ${survey.title}`}
    >
      <header className="mb-4">
        <h3 className="text-[15px] font-semibold leading-snug text-ink">
          {survey.title}
        </h3>
        {survey.intro && (
          <p className="mt-1 text-[13px] leading-relaxed text-mute">
            {survey.intro}
          </p>
        )}
      </header>

      <div className="space-y-5">
        {survey.fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            value={answers[field.id]}
            disabled={disabled}
            onChange={(next) => setAnswer(field.id, next)}
          />
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 text-[13px] text-text"
          style={{ color: "var(--error, currentColor)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end">
        <Button variant="primary" onClick={handleSubmit} disabled={disabled}>
          {survey.submitLabel}
        </Button>
      </div>
    </article>
  );
}

// ─── Field row ─────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SurveyField;
  value: SurveyFieldValue | undefined;
  disabled?: boolean;
  onChange: (next: SurveyFieldValue) => void;
}) {
  return (
    <div>
      <label
        htmlFor={`survey-field-${field.id}`}
        className="block text-[14px] font-medium text-ink"
      >
        {field.label}
        {field.required !== false && (
          <span className="ml-1 text-mute" aria-hidden>
            *
          </span>
        )}
      </label>
      {field.hint && (
        <p className="mt-0.5 text-[12px] leading-relaxed text-mute">
          {field.hint}
        </p>
      )}
      <div className="mt-2">
        <FieldInput
          field={field}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SurveyField;
  value: SurveyFieldValue | undefined;
  disabled?: boolean;
  onChange: (next: SurveyFieldValue) => void;
}) {
  const inputId = `survey-field-${field.id}`;

  if (field.kind === "text") {
    const v = value?.kind === "text" ? value.value : "";
    const common = {
      id: inputId,
      value: v,
      disabled,
      maxLength: field.maxLength ?? 1000,
      placeholder: field.placeholder ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange({ kind: "text", value: e.target.value }),
      className:
        "w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 " +
        "disabled:opacity-50",
    };
    return field.multiline ? (
      <textarea {...common} rows={3} />
    ) : (
      <input type="text" {...common} />
    );
  }

  if (field.kind === "slider" || field.kind === "stepper") {
    const num = value?.kind === "number" ? value.value : field.defaultValue;
    return (
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type={field.kind === "slider" ? "range" : "number"}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={num}
          disabled={disabled}
          onChange={(e) =>
            onChange({ kind: "number", value: Number(e.target.value) })
          }
          className={
            field.kind === "slider"
              ? "flex-1 accent-ink disabled:opacity-50"
              : "w-32 rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50"
          }
        />
        <span className="tabular-nums text-[14px] font-medium text-ink min-w-[4rem]">
          {num}
          {field.unit ? ` ${field.unit}` : ""}
        </span>
      </div>
    );
  }

  if (field.kind === "range") {
    const lo =
      value?.kind === "range" ? value.lo : field.defaultLo;
    const hi =
      value?.kind === "range" ? value.hi : field.defaultHi;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-mute">From</span>
        <input
          id={inputId}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={lo}
          disabled={disabled}
          onChange={(e) =>
            onChange({ kind: "range", lo: Number(e.target.value), hi })
          }
          className="w-24 rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50"
        />
        <span className="text-[12px] text-mute">to</span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={hi}
          disabled={disabled}
          onChange={(e) =>
            onChange({ kind: "range", lo, hi: Number(e.target.value) })
          }
          className="w-24 rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50"
        />
        {field.unit && (
          <span className="text-[14px] font-medium text-ink">
            {field.unit}
          </span>
        )}
      </div>
    );
  }

  if (field.kind === "single-select") {
    const current =
      value?.kind === "single"
        ? value.value
        : field.defaultValue ?? field.options[0]?.value ?? "";
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={inputId}>
        {field.options.map((opt) => {
          const selected = opt.value === current;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange({ kind: "single", value: opt.value })}
              className={
                "rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 " +
                "disabled:opacity-50 " +
                (selected
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-text hover:border-ink/40 hover:bg-line/20")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  // multi-select
  const selectedSet = new Set(
    value?.kind === "multi" ? value.values : field.defaultValues ?? [],
  );
  const cap = field.maxSelections;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-labelledby={inputId}>
      {field.options.map((opt) => {
        const selected = selectedSet.has(opt.value);
        const atCap = !selected && cap !== undefined && selectedSet.size >= cap;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled || atCap}
            onClick={() => {
              const nextSet = new Set(selectedSet);
              if (selected) nextSet.delete(opt.value);
              else nextSet.add(opt.value);
              onChange({ kind: "multi", values: [...nextSet] });
            }}
            className={
              "rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 " +
              "disabled:opacity-50 " +
              (selected
                ? "border-ink bg-ink text-paper"
                : "border-line text-text hover:border-ink/40 hover:bg-line/20")
            }
          >
            {selected ? `✓ ${opt.label}` : opt.label}
          </button>
        );
      })}
      {cap !== undefined && (
        <span className="self-center text-[11px] text-mute">
          pick up to {cap}
        </span>
      )}
    </div>
  );
}
