// Canonical AI-leverage finder template.
//
// Replaces the v1 trio (capacity / pricing / admin-hire) as the user-visible
// default. Walks the practitioner through their week in 6 short questions,
// captures the time sinks + practical constraints (HIPAA / budget / specialty),
// and feeds the engine which ranks tools from lib/engine/ai-tools.ts.

import { z } from "zod";
import type { DecisionTemplate } from "./types";

export const aiLeverageTemplate: DecisionTemplate = {
  id: "capacity", // map to existing union for compat — tplId is overloaded for v2
  title: "Find AI to free up your week",
  oneLine: "Identifies your biggest time sinks and prescribes the AI tools to deploy first.",
  intentVerb: "Audit your week",
  estimatedMinutes: 5,
  fields: [
    {
      id: "specialty",
      label: "What's your specialty?",
      kind: {
        type: "select",
        options: [
          { value: "psychiatry", label: "Psychiatry" },
          { value: "therapy", label: "Therapy (LMFT / LCSW)" },
          { value: "primary_care", label: "Primary care" },
          { value: "pediatrics", label: "Pediatrics" },
          { value: "physical_therapy", label: "Physical therapy" },
          { value: "nutrition", label: "Nutrition / dietetics" },
          { value: "any", label: "Other / multiple" },
        ],
      },
      required: true,
    },
    {
      id: "clinicalNotesHrs",
      label: "Hours per week on clinical notes (SOAP, charting, dictation)?",
      hint: "Include time after visits typing up notes you couldn't finish in the room.",
      kind: { type: "slider", min: 0, max: 30, step: 1, unit: "hrs", ticks: [0, 5, 10, 15, 20, 25, 30] },
      required: true,
    },
    {
      id: "patientCommsHrs",
      label: "Hours per week on patient messaging + scheduling FAQs?",
      hint: "Phone tag, repeated 'when's my next appointment', no-show follow-ups.",
      kind: { type: "slider", min: 0, max: 20, step: 1, unit: "hrs", ticks: [0, 4, 8, 12, 16, 20] },
      required: true,
    },
    {
      id: "billingAdminHrs",
      label: "Hours per week on billing / claims / prior-auth / admin docs?",
      hint: "Insurance claim submission, prior-auth letters, intake forms, policies.",
      kind: { type: "slider", min: 0, max: 20, step: 1, unit: "hrs", ticks: [0, 4, 8, 12, 16, 20] },
      required: true,
    },
    {
      id: "monthlyToolBudget",
      label: "Monthly budget for new tools (USD)?",
      hint: "Drag both ends — the engine treats this as a range so you don't have to be exact.",
      kind: {
        type: "range",
        min: 0,
        max: 1000,
        step: 25,
        unit: "$",
        defaultLow: 50,
        defaultHigh: 200,
      },
      required: true,
    },
    {
      id: "phiPosture",
      label: "Are you willing to sign Business Associate Agreements (BAAs) with new vendors?",
      hint: "Required for any tool that will see patient information. Most clinical-time savers need this.",
      kind: {
        type: "select",
        options: [
          { value: "yes_baa_ok", label: "Yes — happy to sign BAAs" },
          { value: "selective", label: "Only for tools I really need" },
          { value: "no_baa", label: "No — keep PHI off third-party tools" },
        ],
      },
      required: true,
    },
  ],
  // Criteria the engine weighs candidate tools against. The deterministic
  // weight comes from the user's stated time-per-area; the LLM doesn't get
  // to invent these.
  criteria: [
    { id: "timeSaved", label: "Hours per week freed" },
    { id: "setupEffort", label: "Time to deploy" },
    { id: "hipaaFit", label: "HIPAA fit (BAA available + user willing)" },
    { id: "costFit", label: "Fits monthly budget" },
    { id: "reversibility", label: "Easy to undo if it doesn't work" },
  ],
  // Candidate tool IDs from ai-tools.ts. Stage 2 (constraints) filters down
  // by HIPAA + budget; Stage 4 ranks the survivors; Stage 5 picks the top
  // stack of 2-4 tools.
  candidates: [
    "ai_scribe_baa",
    "non_clinical_transcription",
    "patient_comms_prompt_lib",
    "scheduling_stack",
    "stack_glue_zapier",
    "billing_automation",
    "secure_messaging",
    "voice_to_ehr",
    "prior_auth_drafting",
    "intake_doc_generator",
    "explainer_video_loom",
    "hipaa_va_service",
  ],
  buildZodSchema: () =>
    z.object({
      specialty: z.enum([
        "psychiatry",
        "therapy",
        "primary_care",
        "pediatrics",
        "physical_therapy",
        "nutrition",
        "any",
      ]),
      clinicalNotesHrs: z.number().min(0).max(30),
      patientCommsHrs: z.number().min(0).max(20),
      billingAdminHrs: z.number().min(0).max(20),
      monthlyToolBudget: z.union([
        z.number().min(0).max(1000),
        z
          .tuple([z.number().min(0).max(1000), z.number().min(0).max(1000)])
          .refine(([lo, hi]) => lo <= hi, "Low end must be ≤ high end"),
      ]),
      phiPosture: z.enum(["yes_baa_ok", "selective", "no_baa"]),
    }),
};
