// Decision template definition (PRD §6 / D-01).
// Each template ships intake fields (≤7), criteria for MCDA weighting, candidate
// option set for Stage 2-5, and copy hints used by the recommendation UI.

import { z } from "zod";

export interface TemplateField {
  id: string;
  label: string;
  hint?: string;
  kind:
    // Plain numeric input — use only when keyboard precision is genuinely needed
    // (e.g. dollar amounts you must type exactly). Most fields should prefer
    // slider, number-picker, or range below.
    | { type: "number"; min?: number; max?: number; step?: number; unit?: string }
    // Continuous slider — single value with tick marks. Use for ranges where
    // ±5% precision is fine (hours/week, days/month, percent allocations).
    // Renders min..max ticks, current value bubble, no typing required on mobile.
    | {
        type: "slider";
        min: number;
        max: number;
        step?: number;
        unit?: string;
        ticks?: number[]; // optional explicit tick marks; defaults to min/mid/max
      }
    // Discrete count picker with − / + buttons. Use for whole-number entities
    // like patients on waitlist, hires being considered. Touch-friendly; no
    // keyboard. Defaults to step=1.
    | {
        type: "number-picker";
        min: number;
        max: number;
        step?: number;
        unit?: string;
      }
    // Two-handle range for genuine uncertainty. Returns [low, high] tuple.
    // Use when the user can't pick one number ("income I need is somewhere
    // between $14k and $18k"). The engine receives the midpoint and a
    // confidence band; rationale acknowledges the range.
    | {
        type: "range";
        min: number;
        max: number;
        step?: number;
        unit?: string;
        defaultLow?: number;
        defaultHigh?: number;
      }
    | { type: "select"; options: { value: string; label: string }[] }
    | { type: "multiselect"; options: { value: string; label: string }[] }
    | { type: "boolean" }
    | { type: "text"; maxLength: number; placeholder?: string };
  required?: boolean;
}

export interface DecisionTemplate {
  id: "capacity" | "pricing" | "admin-hire";
  title: string;
  oneLine: string;
  intentVerb: string; // e.g. "Decide your capacity"
  estimatedMinutes: number;
  fields: TemplateField[]; // ≤7 per A-07
  criteria: { id: string; label: string }[]; // for Stage 3 weights
  candidates: string[]; // initial candidate option set for Stage 2-5
  buildZodSchema: () => z.ZodTypeAny; // strict per-template field validator
}
