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
      kind: {
        type: "slider",
        min: 0,
        max: 80,
        step: 1,
        unit: "hrs",
        ticks: [0, 20, 40, 60, 80],
      },
      required: true,
    },
    {
      id: "targetWeeklyHours",
      label: "Hours per week you actually want to work",
      kind: {
        type: "slider",
        min: 0,
        max: 80,
        step: 1,
        unit: "hrs",
        ticks: [0, 20, 40, 60, 80],
      },
      required: true,
    },
    {
      id: "waitlistDepth",
      label: "How many patients are on your waitlist right now?",
      kind: { type: "number-picker", min: 0, max: 200, step: 1 },
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
      label: "Monthly take-home you need (USD)",
      hint: "Pre-tax gross. Drag both ends if you're not sure of the exact number — the engine treats this as a range.",
      kind: {
        type: "range",
        min: 0,
        max: 50000,
        step: 500,
        unit: "$",
        defaultLow: 8000,
        defaultHigh: 15000,
      },
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
      waitlistDepth: z.number().min(0).max(200),
      burnoutLevel: z.enum(["low", "moderate", "high"]),
      // incomeFloor is a [low, high] tuple from the range slider.
      // Accept a single number too for backward compat with old saved drafts.
      incomeFloor: z.union([
        z.number().min(0).max(50000),
        z
          .tuple([z.number().min(0).max(50000), z.number().min(0).max(50000)])
          .refine(([lo, hi]) => lo <= hi, "Low end must be ≤ high end"),
      ]),
      supportLevel: z.enum(["none", "partial", "full"]),
      horizonMonths: z.enum(["3", "6", "12"]),
    }),
};
