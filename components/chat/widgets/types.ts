// C6b — Clarifier widget contract.
//
// Each clarifier widget that the orchestrator may emit. The discriminated
// union below is the source of truth for both the API zod schema (in
// app/api/chat/route.ts) and the Chat.tsx render branch.
//
// Keep this file pure types — no React imports, no client-only code — so it
// can be imported from server-only code paths without bundler complaints.

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
