// Engine-typed clarifier protocol.
//
// Single source of truth for the clarifier message shape: TS types AND the
// zod schema that validates them on the wire. Lives in lib/engine/ because
// the engine — not the chat surface — owns what a clarifier IS.
//
// Why this lives here (not at the API route or component):
//   - Future surfaces (voice, native iOS, weekly-audit async emission)
//     can import ClarifierWidget + ClarifierWidgetSchema without going
//     through the chat-streaming pipeline.
//   - The MCDA engine (stages 0-7) is already a typed pipeline. The
//     clarifier was the only non-typed user-facing reasoning step;
//     promoting it to the engine layer aligns the architecture and
//     removes the single non-deterministic node in an otherwise
//     deterministic decision graph.
//   - Compliance / audit defensibility — "what did we ask the user?"
//     answerable from typed events, not LLM nondeterminism.
//
// Surfaces depending on this file (and what they consume):
//   - app/api/chat/route.ts    → ClarifierWidgetSchema (wire validation)
//   - components/chat/widgets/ → ClarifierWidget, Clarifier* per-kind types
//   - lib/chat/system-prompt   → reads shape from here when generating
//                                 instructions for the LLM (deferred —
//                                 still inline today, see follow-up TODO)
//
// Keep this file pure: no React imports, no client-only code, no Drizzle.
// It must be importable from any server / worker / native code path.

import { z } from "zod";

// ---------------------------------------------------------------------------
// TS types
// ---------------------------------------------------------------------------

export type ClarifierKind = "slider" | "stepper" | "range" | "chips";

export interface ClarifierBase {
  /** Stable id of the field being collected (matches a template field). */
  fieldId: string;
  /** Human-readable label rendered above the widget. */
  label: string;
  /** Optional one-line hint rendered beneath the widget. */
  hint?: string;
}

export interface ClarifierSlider extends ClarifierBase {
  kind: "slider";
  min: number;
  max: number;
  step?: number;
  /** Default starting value. Required so the widget mounts in a sane state. */
  defaultValue: number;
  /** Display unit (e.g. "$/visit", "hrs/wk"). */
  unit?: string;
}

export interface ClarifierStepper extends ClarifierBase {
  kind: "stepper";
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
}

export interface ClarifierRange extends ClarifierBase {
  kind: "range";
  min: number;
  max: number;
  step?: number;
  defaultLo: number;
  defaultHi: number;
  unit?: string;
}

export interface ClarifierChips extends ClarifierBase {
  kind: "chips";
  /** Choice options. Each is rendered as a Chip. */
  options: Array<{ value: string; label: string }>;
  /** Optional pre-selected value. */
  defaultValue?: string;
}

export type ClarifierWidget =
  | ClarifierSlider
  | ClarifierStepper
  | ClarifierRange
  | ClarifierChips;

/**
 * Optional context the orchestrator may pass to surface the form-fallback
 * link. When present AND non-null, FormFallbackLink renders.
 */
export interface ClarifierMeta {
  /** Inferred template id — drives the "use the survey form instead" link. */
  inferredTemplateId?: "capacity" | "pricing" | "admin-hire" | null;
  /** Whether this is the first clarifier in the thread (controls whether to
   *  surface the form-fallback link, per spec line 148). */
  isFirstClarifier?: boolean;
}

/** Submitted value back to the orchestrator. Stored as a normalized string
 *  so it round-trips cleanly through the chat-message log. */
export type ClarifierSubmission = {
  fieldId: string;
  /** Normalized human-readable form (e.g. "32 hrs/wk", "20–28", "growing"). */
  display: string;
  /** Raw value for downstream parsing. */
  raw: number | string | { lo: number; hi: number };
};

// ---------------------------------------------------------------------------
// Engine-emitted clarifier event
//
// Surfaces other than the chat route (voice, native, async/weekly-audit) call
// emitClarifier({...}) and serialize the resulting ClarifierEvent however
// their transport requires. The chat route serializes via the assistant
// message envelope; native/voice surfaces will serialize differently.
// ---------------------------------------------------------------------------

export interface ClarifierEvent {
  type: "clarifier";
  widget: ClarifierWidget;
  /** Free-text introduction the surface may render alongside the widget. */
  reply: string;
  meta?: ClarifierMeta;
}

/**
 * Emit a typed clarifier event. The author surface (engine stage, voice
 * pipeline, weekly-audit job) calls this so a consistent event shape lands
 * on every transport. This intentionally does NO transport work — it's a
 * pure type-narrowing helper that callers serialize themselves.
 */
export function emitClarifier(
  widget: ClarifierWidget,
  reply: string,
  meta?: ClarifierMeta,
): ClarifierEvent {
  return { type: "clarifier", widget, reply, ...(meta ? { meta } : {}) };
}

// ---------------------------------------------------------------------------
// Zod schema (wire-format validation)
//
// Hard ceilings on every numeric/string field. The LLM is one producer of
// this payload (today); zod is the prompt-injection backstop. Future
// producers (engine stages, scheduled jobs, voice ASR layer) reuse the same
// schema so wire-format guarantees stay symmetric across surfaces.
// ---------------------------------------------------------------------------

const ClarifierSliderSchema = z.object({
  kind: z.literal("slider"),
  fieldId: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  hint: z.string().max(200).optional(),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().positive().finite().optional(),
  defaultValue: z.number().finite(),
  unit: z.string().max(24).optional(),
});

const ClarifierStepperSchema = z.object({
  kind: z.literal("stepper"),
  fieldId: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  hint: z.string().max(200).optional(),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().positive().finite().optional(),
  defaultValue: z.number().finite(),
  unit: z.string().max(24).optional(),
});

const ClarifierRangeSchema = z.object({
  kind: z.literal("range"),
  fieldId: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  hint: z.string().max(200).optional(),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().positive().finite().optional(),
  defaultLo: z.number().finite(),
  defaultHi: z.number().finite(),
  unit: z.string().max(24).optional(),
});

const ClarifierChipsSchema = z.object({
  kind: z.literal("chips"),
  fieldId: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  hint: z.string().max(200).optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1).max(64),
        label: z.string().min(1).max(80),
      }),
    )
    .min(2)
    .max(8),
  defaultValue: z.string().max(64).optional(),
});

/** Discriminated union zod schema for a clarifier widget. */
export const ClarifierWidgetSchema = z.discriminatedUnion("kind", [
  ClarifierSliderSchema,
  ClarifierStepperSchema,
  ClarifierRangeSchema,
  ClarifierChipsSchema,
]);

/**
 * Parse an unknown payload as a ClarifierWidget. Returns the parsed value
 * on success or null on validation failure. Use this at any wire boundary
 * (HTTP route, message queue handler, voice ASR result) — never the bare
 * `z.parse` (which throws) inside a streaming render path.
 */
export function parseClarifierWidget(
  input: unknown,
): ClarifierWidget | null {
  const r = ClarifierWidgetSchema.safeParse(input);
  return r.success ? (r.data as ClarifierWidget) : null;
}
