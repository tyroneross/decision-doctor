// PRD §5 F-01 — Admin-hire decision template.
// Question: should the practitioner hire an admin (FT, PT, virtual, contractor),
// outsource pieces, or DIY with better tooling?
import { z } from "zod";
import type { DecisionTemplate } from "@/lib/engine/types";

const adminHireIntakeSchema = z
  .object({
    weeklyAdminHours: z.number().int().min(0).max(80),
    monthlyBudgetUSD: z.number().min(0).max(20000),
    monthsSavingsRunway: z.number().int().min(0).max(60),
    growthExpectation: z.enum(["shrinking", "stable", "growing"]),
    adminTaskMix: z.enum([
      "scheduling-billing",
      "scheduling-only",
      "billing-only",
      "intake-and-comms",
    ]),
    delegationComfort: z.enum(["low", "medium", "high"]),
    horizonMonths: z.number().int().min(1).max(60),
  })
  .strict();

export const adminHireTemplate: DecisionTemplate = {
  id: "admin-hire",
  label: "Decide an admin hire",
  description:
    "Should you hire someone to handle scheduling, billing, intake, or comms? Trade cost vs reclaimed clinical hours.",
  intakeSchema: adminHireIntakeSchema,
  fields: [
    {
      name: "weeklyAdminHours",
      label: "Hours/week you spend on admin",
      helper:
        "Scheduling, billing, intake calls, insurance follow-up — anything non-clinical.",
      kind: "number",
      required: true,
      min: 0,
      max: 80,
    },
    {
      name: "monthlyBudgetUSD",
      label: "Monthly budget you can allocate (USD)",
      helper:
        "Realistic ceiling — what you could pay without thinning your own income.",
      kind: "number",
      required: true,
      min: 0,
      max: 20000,
    },
    {
      name: "monthsSavingsRunway",
      label: "Practice savings runway (months)",
      helper:
        "How many months of fixed costs you could cover without new revenue.",
      kind: "number",
      required: true,
      min: 0,
      max: 60,
    },
    {
      name: "growthExpectation",
      label: "Practice trajectory next 12 months",
      kind: "select",
      required: true,
      options: [
        { value: "shrinking", label: "Shrinking — fewer visits expected" },
        { value: "stable", label: "Stable — about the same" },
        { value: "growing", label: "Growing — more visits expected" },
      ],
    },
    {
      name: "adminTaskMix",
      label: "Most-painful admin work",
      kind: "select",
      required: true,
      options: [
        { value: "scheduling-billing", label: "Scheduling AND billing" },
        { value: "scheduling-only", label: "Scheduling / calendar only" },
        { value: "billing-only", label: "Billing / insurance only" },
        { value: "intake-and-comms", label: "Intake calls + patient comms" },
      ],
    },
    {
      name: "delegationComfort",
      label: "How comfortable are you delegating?",
      kind: "select",
      required: true,
      options: [
        { value: "low", label: "Low — I check everything" },
        { value: "medium", label: "Medium — I can let some go" },
        { value: "high", label: "High — set it and forget it" },
      ],
    },
    {
      name: "horizonMonths",
      label: "Decision horizon (months)",
      kind: "number",
      required: true,
      min: 1,
      max: 60,
    },
  ],
  candidates: [
    {
      id: "hire-pt-virtual-assistant",
      label: "Hire a part-time virtual assistant (10–15 hrs/wk)",
      description:
        "Low overhead, flexible scope. Good fit for scheduling/comms; less control over billing nuance.",
      scores: {
        timeRecovered: 0.75,
        cost: 0.65,
        quality: 0.65,
        risk: 0.7,
      },
    },
    {
      id: "hire-billing-service",
      label: "Outsource billing to a service",
      description:
        "Specialist firm handles claims/insurance. High quality on billing, no help on scheduling.",
      scores: {
        timeRecovered: 0.6,
        cost: 0.55,
        quality: 0.85,
        risk: 0.8,
      },
    },
    {
      id: "hire-pt-onsite",
      label: "Hire a part-time onsite admin (20 hrs/wk)",
      description:
        "Higher cost, broader scope. Better for practices with in-person front-desk needs.",
      scores: {
        timeRecovered: 0.85,
        cost: 0.4,
        quality: 0.8,
        risk: 0.55,
      },
    },
    {
      id: "diy-better-tooling",
      label: "Stay DIY with better tooling",
      description:
        "Adopt a scheduling/billing platform that automates the worst tasks. Lowest cost, modest time recovery.",
      scores: {
        timeRecovered: 0.4,
        cost: 0.85,
        quality: 0.6,
        risk: 0.85,
      },
    },
    {
      id: "wait-and-revisit",
      label: "Defer for 60 days; revisit with more data",
      description:
        "If runway or growth signal is unclear, hold the decision while tracking time spent.",
      scores: {
        timeRecovered: 0.15,
        cost: 0.95,
        quality: 0.5,
        risk: 0.9,
      },
    },
  ],
  criteria: [
    {
      id: "timeRecovered",
      label: "Clinical hours recovered",
      description: "How many hours you reclaim for clinical work or rest.",
      direction: "max",
      defaultWeight: 0.35,
    },
    {
      id: "cost",
      label: "Cost efficiency",
      description: "How well the option fits your monthly budget.",
      direction: "max",
      defaultWeight: 0.25,
    },
    {
      id: "quality",
      label: "Output quality",
      description: "How likely the work meets your bar without rework.",
      direction: "max",
      defaultWeight: 0.2,
    },
    {
      id: "risk",
      label: "Reversibility / low-regret",
      description: "How easily you can undo or adjust if it doesn't work out.",
      direction: "max",
      defaultWeight: 0.2,
    },
  ],
  constraints: [
    {
      id: "low-runway-vetoes-onsite",
      label: "Short runway vetoes onsite hire",
      description:
        "An onsite hire's commitment exceeds what your savings can cover.",
      kind: "veto",
      intakeField: "monthsSavingsRunway",
      operator: "<",
      threshold: 3,
      vetoCandidates: ["hire-pt-onsite"],
    },
    {
      id: "tiny-admin-vetoes-hire",
      label: "Very low admin hours vetoes any hire",
      description:
        "If you spend under 4 hrs/week on admin, hiring isn't justified — fix tooling instead.",
      kind: "veto",
      intakeField: "weeklyAdminHours",
      operator: "<",
      threshold: 4,
      vetoCandidates: [
        "hire-pt-virtual-assistant",
        "hire-billing-service",
        "hire-pt-onsite",
      ],
    },
  ],
};
