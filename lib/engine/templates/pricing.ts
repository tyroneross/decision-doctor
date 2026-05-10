// Pricing decision template — "Should I raise my session rate?"
import { z } from "zod";
import type { DecisionTemplate } from "./types";

export const pricingTemplate: DecisionTemplate = {
  id: "pricing",
  title: "Decide pricing",
  oneLine: "Pick the rate that holds without losing the patients you'd keep.",
  intentVerb: "Decide pricing",
  estimatedMinutes: 5,
  fields: [
    {
      id: "currentRate",
      label: "Current session rate (USD)",
      kind: { type: "number", min: 0, max: 1000, step: 5, unit: "$" },
      required: true,
    },
    {
      id: "lastRaiseMonths",
      label: "Months since your last rate change",
      kind: { type: "number", min: 0, max: 120, step: 1 },
      required: true,
    },
    {
      id: "fillRate",
      label: "Sessions per week you currently fill",
      kind: { type: "number", min: 0, max: 60, step: 1 },
      required: true,
    },
    {
      id: "waitlistDepth",
      label: "How many people are on your waitlist?",
      kind: { type: "number", min: 0, max: 1000, step: 1 },
      required: true,
    },
    {
      id: "marketPosition",
      label: "Where do you sit vs comparable providers in your area?",
      kind: {
        type: "select",
        options: [
          { value: "below", label: "Below market" },
          { value: "at", label: "At market" },
          { value: "above", label: "Above market" },
          { value: "unsure", label: "Not sure" },
        ],
      },
      required: true,
    },
    {
      id: "churnTolerance",
      label: "How many existing patients are you willing to lose?",
      hint: "Realistic range.",
      kind: {
        type: "select",
        options: [
          { value: "0", label: "None — keep them all" },
          { value: "1-3", label: "1–3 patients" },
          { value: "4-8", label: "4–8 patients" },
          { value: "8plus", label: "More than 8" },
        ],
      },
      required: true,
    },
    {
      id: "insuranceMix",
      label: "Insurance vs cash-pay mix",
      kind: {
        type: "select",
        options: [
          { value: "all-cash", label: "All cash-pay" },
          { value: "mostly-cash", label: "Mostly cash, some insurance" },
          { value: "mostly-insurance", label: "Mostly insurance" },
          { value: "all-insurance", label: "All insurance" },
        ],
      },
      required: true,
    },
  ],
  criteria: [
    { id: "incomeImpact", label: "Income lift" },
    { id: "patientRetention", label: "Patient retention" },
    { id: "marketAlignment", label: "Market alignment" },
    { id: "reversibility", label: "Reversible if wrong" },
  ],
  candidates: [
    "Raise rates 5% with 30-day notice; grandfather no one",
    "Raise rates 10% with 60-day notice; grandfather no one",
    "Raise rates 15% with 90-day notice; grandfather long-term patients for 6 months",
    "Hold rates and add a higher-priced premium tier (initial consults / extended visits)",
    "Hold rates for 6 more months and re-decide",
  ],
  buildZodSchema: () =>
    z.object({
      currentRate: z.number().min(0).max(1000),
      lastRaiseMonths: z.number().min(0).max(120),
      fillRate: z.number().min(0).max(60),
      waitlistDepth: z.number().min(0).max(1000),
      marketPosition: z.enum(["below", "at", "above", "unsure"]),
      churnTolerance: z.enum(["0", "1-3", "4-8", "8plus"]),
      insuranceMix: z.enum(["all-cash", "mostly-cash", "mostly-insurance", "all-insurance"]),
    }),
};
