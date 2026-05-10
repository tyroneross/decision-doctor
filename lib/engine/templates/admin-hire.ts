// Admin-hire decision template — "Should I hire help (and what kind)?"
import { z } from "zod";
import type { DecisionTemplate } from "./types";

export const adminHireTemplate: DecisionTemplate = {
  id: "admin-hire",
  title: "Decide a hire",
  oneLine: "Pick the right shape of help for the bottleneck you actually have.",
  intentVerb: "Decide a hire",
  estimatedMinutes: 5,
  fields: [
    {
      id: "weeklyAdminHours",
      label: "Hours per week you spend on non-clinical work",
      kind: { type: "number", min: 0, max: 60, step: 1, unit: "hrs" },
      required: true,
    },
    {
      id: "biggestBottleneck",
      label: "Biggest non-clinical bottleneck right now",
      kind: {
        type: "select",
        options: [
          { value: "billing", label: "Billing / claims" },
          { value: "scheduling", label: "Scheduling / intake calls" },
          { value: "notes", label: "Notes / documentation" },
          { value: "marketing", label: "Marketing / referrals" },
          { value: "ops", label: "General ops (vendors, supplies)" },
        ],
      },
      required: true,
    },
    {
      id: "monthlyBudget",
      label: "Comfortable monthly spend on help (USD)",
      kind: { type: "number", min: 0, max: 20000, step: 100, unit: "$" },
      required: true,
    },
    {
      id: "managementCapacity",
      label: "How much management bandwidth do you have?",
      kind: {
        type: "select",
        options: [
          { value: "low", label: "Low — I want to set and forget" },
          { value: "medium", label: "Medium — weekly check-ins" },
          { value: "high", label: "High — I'll meet daily if needed" },
        ],
      },
      required: true,
    },
    {
      id: "hipaaTouch",
      label: "Will the role touch protected health information?",
      kind: { type: "boolean" },
      required: true,
    },
    {
      id: "horizonMonths",
      label: "How long do you want this person in role?",
      kind: {
        type: "select",
        options: [
          { value: "3", label: "3 months (trial)" },
          { value: "6", label: "6 months" },
          { value: "12", label: "12 months+" },
        ],
      },
      required: true,
    },
    {
      id: "preferRemote",
      label: "Open to remote / contractor?",
      kind: { type: "boolean" },
      required: true,
    },
  ],
  criteria: [
    { id: "bottleneckRelief", label: "Relieves bottleneck" },
    { id: "costFit", label: "Fits budget" },
    { id: "managementLoad", label: "Low management load" },
    { id: "compliance", label: "HIPAA fit" },
    { id: "reversibility", label: "Reversible if wrong" },
  ],
  candidates: [
    "Hire a part-time virtual assistant (10 hrs/week, contractor)",
    "Hire a billing service on a percentage-of-collections model",
    "Hire a part-time W-2 admin (15 hrs/week, in-state)",
    "Outsource notes via AI scribe + a clinical reviewer",
    "Maintain status quo for 3 months and re-decide",
  ],
  buildZodSchema: () =>
    z.object({
      weeklyAdminHours: z.number().min(0).max(60),
      biggestBottleneck: z.enum(["billing", "scheduling", "notes", "marketing", "ops"]),
      monthlyBudget: z.number().min(0).max(20000),
      managementCapacity: z.enum(["low", "medium", "high"]),
      hipaaTouch: z.boolean(),
      horizonMonths: z.enum(["3", "6", "12"]),
      preferRemote: z.boolean(),
    }),
};
