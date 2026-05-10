// PRD §5 F-01 — Pricing decision template.
// Question: should the practitioner raise rates, hold rates, restructure pricing,
// or shift payor mix?
import { z } from "zod";
import type { DecisionTemplate } from "@/lib/engine/types";

const pricingIntakeSchema = z
  .object({
    currentRateUSD: z.number().min(0).max(2000),
    monthsSinceLastIncrease: z.number().int().min(0).max(120),
    insuranceShare: z.number().min(0).max(100), // percentage
    cashShare: z.number().min(0).max(100),
    avgFillRate: z.number().min(0).max(100), // percentage of slots filled
    competitorBenchmarkUSD: z.number().min(0).max(2000),
    riskTolerance: z.enum(["low", "medium", "high"]),
  })
  .strict()
  .refine(
    (v) => v.insuranceShare + v.cashShare <= 100,
    {
      message: "Insurance + cash share must total ≤ 100%",
      path: ["insuranceShare"],
    },
  );

export const pricingTemplate: DecisionTemplate = {
  id: "pricing",
  label: "Decide pricing",
  description:
    "Raise, hold, restructure, or shift mix. Trade off revenue, retention, and load.",
  intakeSchema: pricingIntakeSchema,
  fields: [
    {
      name: "currentRateUSD",
      label: "Current rate per visit (USD)",
      helper: "Your cash rate. If you only take insurance, use the contracted rate.",
      kind: "number",
      required: true,
      min: 0,
      max: 2000,
    },
    {
      name: "monthsSinceLastIncrease",
      label: "Months since your last rate increase",
      kind: "number",
      required: true,
      min: 0,
      max: 120,
    },
    {
      name: "insuranceShare",
      label: "% revenue from insurance",
      kind: "number",
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: "cashShare",
      label: "% revenue from cash / out-of-network",
      kind: "number",
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: "avgFillRate",
      label: "Average slot fill rate (%)",
      helper: "How full is your schedule on a typical week?",
      kind: "number",
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: "competitorBenchmarkUSD",
      label: "Local benchmark rate (USD)",
      helper: "What comparable solo practitioners charge in your area.",
      kind: "number",
      required: true,
      min: 0,
      max: 2000,
    },
    {
      name: "riskTolerance",
      label: "How much patient-loss risk can you absorb?",
      kind: "select",
      required: true,
      options: [
        { value: "low", label: "Low — losing 5% would hurt" },
        { value: "medium", label: "Medium — could absorb 5–10%" },
        { value: "high", label: "High — could absorb 10–20%" },
      ],
    },
  ],
  candidates: [
    {
      id: "raise-modest",
      label: "Raise rates 5–8% across the board",
      description:
        "Annual cost-of-living-ish bump. Low patient-loss risk, modest revenue gain.",
      scores: {
        revenue: 0.65,
        retention: 0.75,
        sustainability: 0.6,
        signaling: 0.55,
      },
    },
    {
      id: "raise-aggressive",
      label: "Raise rates 12–20% to match benchmark",
      description:
        "Reset to local benchmark. Higher revenue, real retention risk.",
      scores: {
        revenue: 0.95,
        retention: 0.45,
        sustainability: 0.7,
        signaling: 0.85,
      },
    },
    {
      id: "hold-rates",
      label: "Hold current rates",
      description: "Status quo. No revenue change, no retention shock.",
      scores: {
        revenue: 0.35,
        retention: 0.95,
        sustainability: 0.5,
        signaling: 0.4,
      },
    },
    {
      id: "tiered-services",
      label: "Add a tiered or premium service line",
      description:
        "Keep base rate, add a higher-priced offering (longer sessions, on-call, etc.).",
      scores: {
        revenue: 0.7,
        retention: 0.8,
        sustainability: 0.65,
        signaling: 0.7,
      },
    },
    {
      id: "shift-cash-mix",
      label: "Drop one insurance panel, shift toward cash",
      description:
        "Trade volume for margin. Higher per-visit revenue, lower fill rate near-term.",
      scores: {
        revenue: 0.75,
        retention: 0.55,
        sustainability: 0.75,
        signaling: 0.7,
      },
    },
  ],
  criteria: [
    {
      id: "revenue",
      label: "Revenue impact",
      description: "How much practice income changes.",
      direction: "max",
      defaultWeight: 0.3,
    },
    {
      id: "retention",
      label: "Patient retention",
      description: "How likely existing patients stay through the change.",
      direction: "max",
      defaultWeight: 0.3,
    },
    {
      id: "sustainability",
      label: "Operational sustainability",
      description: "Whether the pricing model stays workable for you long-term.",
      direction: "max",
      defaultWeight: 0.2,
    },
    {
      id: "signaling",
      label: "Market signaling",
      description: "How well the change communicates your value to new patients.",
      direction: "max",
      defaultWeight: 0.2,
    },
  ],
  constraints: [
    {
      id: "low-risk-vetoes-aggressive",
      label: "Low risk tolerance vetoes aggressive raise",
      description:
        "Patients leaving over a 12–20% jump would be unrecoverable for you near-term.",
      kind: "veto",
      intakeField: "riskTolerance",
      operator: "==",
      vetoCandidates: ["raise-aggressive"],
    },
    {
      id: "recent-increase-vetoes-raise",
      label: "Recent increase vetoes another raise",
      description:
        "If you raised rates in the last 8 months, another bump erodes trust.",
      kind: "veto",
      intakeField: "monthsSinceLastIncrease",
      operator: "<",
      threshold: 8,
      vetoCandidates: ["raise-modest", "raise-aggressive"],
    },
  ],
};
