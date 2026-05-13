// lib/engine/survey.ts
//
// Phase-2 chat-as-decision-front-door — typed Survey schema.
//
// Distinct from the existing ClarifierWidget (one question at a time,
// conversational) — Surveys are MULTI-FIELD cards generated fresh per
// decision, rendered as a single form, submitted all at once.
//
// Producers:
//   - lib/chat/survey-generator.ts  → LLM-generated, fresh per decision
//   - future: engine-side generators for batch / async surveys
//
// Consumers:
//   - app/api/chat/route.ts         → emits `status: "survey"` payloads
//   - components/chat/widgets/SurveyCard.tsx → renders + submits
//
// Hard ceilings on every field. The LLM is one producer; zod is the
// prompt-injection backstop. Future producers reuse the same schema so
// wire-format guarantees stay symmetric.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Field kinds
// ---------------------------------------------------------------------------

export type SurveyFieldKind =
  | "text"
  | "slider"
  | "stepper"
  | "range"
  | "single-select"
  | "multi-select";

interface SurveyFieldBase {
  /** Stable id used as the submission key. snake_case or kebab-case. */
  id: string;
  /** Short human-readable prompt. */
  label: string;
  /** Optional one-line hint below the field. */
  hint?: string;
  /** When false, field may be omitted on submit. Defaults to true. */
  required?: boolean;
}

export interface SurveyFieldText extends SurveyFieldBase {
  kind: "text";
  /** Max characters allowed. Hard-capped at 1000 by zod. */
  maxLength?: number;
  /** Optional placeholder for the input. */
  placeholder?: string;
  /** When true, renders as multiline textarea. */
  multiline?: boolean;
}

export interface SurveyFieldSlider extends SurveyFieldBase {
  kind: "slider";
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
}

export interface SurveyFieldStepper extends SurveyFieldBase {
  kind: "stepper";
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
}

export interface SurveyFieldRange extends SurveyFieldBase {
  kind: "range";
  min: number;
  max: number;
  step?: number;
  defaultLo: number;
  defaultHi: number;
  unit?: string;
}

export interface SurveyFieldSingleSelect extends SurveyFieldBase {
  kind: "single-select";
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

export interface SurveyFieldMultiSelect extends SurveyFieldBase {
  kind: "multi-select";
  options: Array<{ value: string; label: string }>;
  defaultValues?: string[];
  /** Optional cap on how many can be selected. */
  maxSelections?: number;
}

export type SurveyField =
  | SurveyFieldText
  | SurveyFieldSlider
  | SurveyFieldStepper
  | SurveyFieldRange
  | SurveyFieldSingleSelect
  | SurveyFieldMultiSelect;

// ---------------------------------------------------------------------------
// Survey shape
// ---------------------------------------------------------------------------

export interface Survey {
  /** Stable id (UUID or slug) for telemetry + replay. */
  id: string;
  /** Top-line card title. */
  title: string;
  /** Optional intro sentence below the title. */
  intro?: string;
  /** 3–6 fields recommended. Hard cap 8. */
  fields: SurveyField[];
  /** Label on the submit button (e.g. "Show recommendation"). */
  submitLabel: string;
  /** Routes which engine the answers feed into. */
  suggestedPath: "decision" | "recommendation";
}

// ---------------------------------------------------------------------------
// Submission shape
// ---------------------------------------------------------------------------

/** Per-field submission value, type-tagged so the route can validate. */
export type SurveyFieldValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "range"; lo: number; hi: number }
  | { kind: "single"; value: string }
  | { kind: "multi"; values: string[] };

export interface SurveySubmission {
  /** Survey.id this submission corresponds to. */
  surveyId: string;
  /** Field id → value. */
  answers: Record<string, SurveyFieldValue>;
}

// ---------------------------------------------------------------------------
// Zod schemas (wire-format validation)
// ---------------------------------------------------------------------------

const Base = {
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  hint: z.string().max(400).optional(),
  required: z.boolean().optional(),
};

const SurveyFieldTextSchema = z.object({
  ...Base,
  kind: z.literal("text"),
  maxLength: z.number().int().min(1).max(1000).optional(),
  placeholder: z.string().max(200).optional(),
  multiline: z.boolean().optional(),
});

const NumericBoundsSchema = {
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
};

const SurveyFieldSliderSchema = z.object({
  ...Base,
  kind: z.literal("slider"),
  ...NumericBoundsSchema,
  defaultValue: z.number(),
  unit: z.string().max(40).optional(),
});

const SurveyFieldStepperSchema = z.object({
  ...Base,
  kind: z.literal("stepper"),
  ...NumericBoundsSchema,
  defaultValue: z.number(),
  unit: z.string().max(40).optional(),
});

const SurveyFieldRangeSchema = z.object({
  ...Base,
  kind: z.literal("range"),
  ...NumericBoundsSchema,
  defaultLo: z.number(),
  defaultHi: z.number(),
  unit: z.string().max(40).optional(),
});

const SelectOptionSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
});

const SurveyFieldSingleSelectSchema = z.object({
  ...Base,
  kind: z.literal("single-select"),
  options: z.array(SelectOptionSchema).min(2).max(8),
  defaultValue: z.string().optional(),
});

const SurveyFieldMultiSelectSchema = z.object({
  ...Base,
  kind: z.literal("multi-select"),
  options: z.array(SelectOptionSchema).min(2).max(10),
  defaultValues: z.array(z.string()).max(10).optional(),
  maxSelections: z.number().int().min(1).max(10).optional(),
});

export const SurveyFieldSchema = z.discriminatedUnion("kind", [
  SurveyFieldTextSchema,
  SurveyFieldSliderSchema,
  SurveyFieldStepperSchema,
  SurveyFieldRangeSchema,
  SurveyFieldSingleSelectSchema,
  SurveyFieldMultiSelectSchema,
]);

export const SurveySchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  intro: z.string().max(600).optional(),
  fields: z.array(SurveyFieldSchema).min(1).max(8),
  submitLabel: z.string().min(1).max(60),
  suggestedPath: z.enum(["decision", "recommendation"]),
});

export const SurveyFieldValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string().max(2000) }),
  z.object({ kind: z.literal("number"), value: z.number() }),
  z.object({
    kind: z.literal("range"),
    lo: z.number(),
    hi: z.number(),
  }),
  z.object({ kind: z.literal("single"), value: z.string().max(200) }),
  z.object({
    kind: z.literal("multi"),
    values: z.array(z.string().max(200)).max(10),
  }),
]);

export const SurveySubmissionSchema = z.object({
  surveyId: z.string().min(1).max(80),
  answers: z.record(z.string(), SurveyFieldValueSchema),
});

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export function parseSurvey(input: unknown): Survey | null {
  const r = SurveySchema.safeParse(input);
  return r.success ? (r.data as Survey) : null;
}

export function parseSurveySubmission(input: unknown): SurveySubmission | null {
  const r = SurveySubmissionSchema.safeParse(input);
  return r.success ? (r.data as SurveySubmission) : null;
}

/**
 * Format a SurveySubmission as a human-readable user message that mirrors
 * the existing clarifier round-trip pattern. The chat log stores this as
 * the user-side message so the conversation log stays readable.
 */
export function formatSubmissionAsMessage(
  survey: Survey,
  submission: SurveySubmission,
): string {
  const lines = [`Here are my answers for "${survey.title}":`];
  for (const field of survey.fields) {
    const value = submission.answers[field.id];
    if (!value) continue;
    const display = formatFieldValue(field, value);
    lines.push(`- ${field.label}: ${display}`);
  }
  return lines.join("\n");
}

function formatFieldValue(field: SurveyField, value: SurveyFieldValue): string {
  switch (value.kind) {
    case "text":
      return value.value || "(blank)";
    case "number": {
      const unit =
        field.kind === "slider" || field.kind === "stepper"
          ? (field as SurveyFieldSlider | SurveyFieldStepper).unit
          : undefined;
      return unit ? `${value.value} ${unit}` : String(value.value);
    }
    case "range": {
      const unit =
        field.kind === "range" ? (field as SurveyFieldRange).unit : undefined;
      const formatted = `${value.lo}–${value.hi}`;
      return unit ? `${formatted} ${unit}` : formatted;
    }
    case "single": {
      if (field.kind !== "single-select") return value.value;
      const opt = field.options.find((o) => o.value === value.value);
      return opt?.label ?? value.value;
    }
    case "multi": {
      if (field.kind !== "multi-select") return value.values.join(", ");
      const labels = value.values.map((v) => {
        const opt = field.options.find((o) => o.value === v);
        return opt?.label ?? v;
      });
      return labels.join(", ");
    }
  }
}
