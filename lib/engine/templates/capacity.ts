// Capacity decision template — "Should I cap my intake / change my schedule?"
import { z } from "zod";
import type { DecisionTemplate } from "./types";

export const capacityTemplate: DecisionTemplate = {
  id: "capacity",
  title: "Decide your capacity",
  oneLine: "Set the right patient load without burning out or under-earning.",
  intentVerb: "Decide capacity",
  estimatedMinutes: 5,
  fields: [
    {
      id: "currentWeeklyHours",
      label: "Hours per week you currently see patients",
      kind: { type: "number", min: 0, max: 80, step: 1, unit: "hrs" },
      required: true,
    },
    {
      id: "targetWeeklyHours",
      label: "Hours per week you actually want to work",
      kind: { type: "number", min: 0, max: 80, step: 1, unit: "hrs" },
      required: true,
    },
    {
      id: "waitlistDepth",
      label: "How many patients are on your waitlist right now?",
      kind: { type: "number", min: 0, max: 1000, step: 1 },
      required: true,
    },
    {
      id: "burnoutLevel",
      label: "How burned out do you feel today?",
      kind: {
        type: "select",
        options: [
          { value: "low", label: "Low — energized" },
          { value: "moderate", label: "Moderate — feeling it" },
          { value: "high", label: "High — running on fumes" },
        ],
      },
      required: true,
    },
    {
      id: "incomeFloor",
      label: "Minimum monthly take-home you need (USD)",
      hint: "Pre-tax gross.",
      kind: { type: "number", min: 0, max: 100000, step: 100, unit: "$" },
      required: true,
    },
    {
      id: "supportLevel",
      label: "Admin / billing support you have today",
      kind: {
        type: "select",
        options: [
          { value: "none", label: "None — I do it all" },
          { value: "partial", label: "Some — VA or partial biller" },
          { value: "full", label: "Full — staff or service" },
        ],
      },
      required: true,
    },
    {
      id: "horizonMonths",
      label: "How long do you want this decision to hold?",
      kind: {
        type: "select",
        options: [
          { value: "3", label: "3 months" },
          { value: "6", label: "6 months" },
          { value: "12", label: "12 months" },
        ],
      },
      required: true,
    },
  ],
  criteria: [
    { id: "burnoutImpact", label: "Burnout reduction" },
    { id: "incomeImpact", label: "Hits income floor" },
    { id: "patientImpact", label: "Patient access" },
    { id: "reversibility", label: "Reversible if wrong" },
  ],
  candidates: [
    "Cap intake at current load and clear waitlist",
    "Cap intake and raise prices to maintain income at lower hours",
    "Add 1 day per week temporarily to clear waitlist, then re-cap",
    "Hire admin help to reclaim 5 clinical hours",
    "Maintain status quo for 3 months and re-decide",
  ],
  buildZodSchema: () =>
    z.object({
      currentWeeklyHours: z.number().min(0).max(80),
      targetWeeklyHours: z.number().min(0).max(80),
      waitlistDepth: z.number().min(0).max(1000),
      burnoutLevel: z.enum(["low", "moderate", "high"]),
      incomeFloor: z.number().min(0).max(100000),
      supportLevel: z.enum(["none", "partial", "full"]),
      horizonMonths: z.enum(["3", "6", "12"]),
    }),
};
