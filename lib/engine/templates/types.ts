// Decision template definition (PRD §6 / D-01).
// Each template ships intake fields (≤7), criteria for MCDA weighting, candidate
// option set for Stage 2-5, and copy hints used by the recommendation UI.

import { z } from "zod";

export interface TemplateField {
  id: string;
  label: string;
  hint?: string;
  kind:
    | { type: "number"; min?: number; max?: number; step?: number; unit?: string }
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
