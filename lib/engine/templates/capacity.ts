// PRD §5 F-01 — Capacity decision template.
// Question: should the practitioner add patient capacity, hold steady, cap intakes,
// reduce hours, or build a waitlist?
import { z } from "zod";
import type { DecisionTemplate } from "@/lib/engine/types";

const capacityIntakeSchema = z
  .object({
    weeklyClinicalHours: z.number().int().min(1).max(80),
    currentWeeklyPatients: z.number().int().min(0).max(80),
    waitlistLength: z.number().int().min(0).max(500),
    avgRevenuePerVisitUSD: z.number().min(0).max(5000),
    energyLevel: z.enum(["depleted", "steady", "energized"]),
    practiceStage: z.enum(["new", "growing", "established", "winding-down"]),
    horizonMonths: z.number().int().min(1).max(60),
  })
  .strict();

export const capacityTemplate: DecisionTemplate = {
  id: "capacity",
  label: "Decide your capacity",
  description:
    "Should you add visits, hold steady, cap intakes, or build a waitlist? Trade off revenue, burnout, and patient access.",
  intakeSchema: capacityIntakeSchema,
  fields: [
    {
      name: "weeklyClinicalHours",
      label: "Weekly clinical hours",
      helper: "How many hours per week do you currently see patients?",
      kind: "number",
      required: true,
      min: 1,
      max: 80,
    },
    {
      name: "currentWeeklyPatients",
      label: "Current weekly patient visits",
      helper: "Approx. number of visits per week right now.",
      kind: "number",
      required: true,
      min: 0,
      max: 80,
    },
    {
      name: "waitlistLength",
      label: "Active waitlist length",
      helper: "How many people are currently waiting for an opening?",
      kind: "number",
      required: true,
      min: 0,
      max: 500,
    },
    {
      name: "avgRevenuePerVisitUSD",
      label: "Average revenue per visit (USD)",
      helper: "Range OK — your best estimate.",
      kind: "number",
      required: true,
      min: 0,
      max: 5000,
    },
    {
      name: "energyLevel",
      label: "Your current energy",
      helper: "How sustainable does the current pace feel?",
      kind: "select",
      required: true,
      options: [
        { value: "depleted", label: "Depleted — running on fumes" },
        { value: "steady", label: "Steady — sustainable but full" },
        { value: "energized", label: "Energized — room to grow" },
      ],
    },
    {
      name: "practiceStage",
      label: "Practice stage",
      kind: "select",
      required: true,
      options: [
        { value: "new", label: "New — under 1 year" },
        { value: "growing", label: "Growing — 1–3 years" },
        { value: "established", label: "Established — 3+ years" },
        { value: "winding-down", label: "Winding down" },
      ],
    },
    {
      name: "horizonMonths",
      label: "Decision horizon (months)",
      helper: "Over what window are you planning?",
      kind: "number",
      required: true,
      min: 1,
      max: 60,
    },
  ],
  // Discrete candidate set. Scores are template-author judgments for v1
  // (deterministic, transparent). [0..1] per criterion.
  candidates: [
    {
      id: "expand-hours",
      label: "Add 4–8 weekly clinical hours",
      description:
        "Open additional sessions to absorb the waitlist. Highest revenue, highest burnout risk.",
      scores: {
        revenue: 0.9,
        sustainability: 0.3,
        access: 0.85,
        flexibility: 0.4,
      },
    },
    {
      id: "hold-steady",
      label: "Hold current capacity",
      description:
        "Keep the current schedule. Predictable, but waitlist growth continues.",
      scores: {
        revenue: 0.5,
        sustainability: 0.7,
        access: 0.4,
        flexibility: 0.65,
      },
    },
    {
      id: "cap-intakes",
      label: "Cap new intakes for 60–90 days",
      description:
        "Pause new patients while continuing existing care. Restores bandwidth fast.",
      scores: {
        revenue: 0.45,
        sustainability: 0.85,
        access: 0.25,
        flexibility: 0.7,
      },
    },
    {
      id: "build-waitlist",
      label: "Build a structured waitlist + tiered intake",
      description:
        "Formalize a waitlist with intake tiers. Modest revenue impact, much better access communication.",
      scores: {
        revenue: 0.55,
        sustainability: 0.75,
        access: 0.7,
        flexibility: 0.7,
      },
    },
    {
      id: "reduce-hours",
      label: "Reduce 4–8 weekly clinical hours",
      description:
        "Pull back to a more sustainable cadence. Lowest revenue, highest sustainability.",
      scores: {
        revenue: 0.25,
        sustainability: 0.95,
        access: 0.2,
        flexibility: 0.85,
      },
    },
  ],
  criteria: [
    {
      id: "revenue",
      label: "Revenue impact",
      description: "How much this option grows or protects practice income.",
      direction: "max",
      defaultWeight: 0.25,
    },
    {
      id: "sustainability",
      label: "Sustainability / burnout protection",
      description:
        "How likely this option preserves your energy and ability to keep practicing.",
      direction: "max",
      defaultWeight: 0.35,
    },
    {
      id: "access",
      label: "Patient access",
      description: "How well this option serves the people on your waitlist.",
      direction: "max",
      defaultWeight: 0.25,
    },
    {
      id: "flexibility",
      label: "Reversibility / flexibility",
      description: "How easily you can change course if assumptions shift.",
      direction: "max",
      defaultWeight: 0.15,
    },
  ],
  constraints: [
    {
      id: "depleted-vetoes-expand",
      label: "Depleted energy vetoes adding hours",
      description:
        "If your energy is depleted, expanding clinical hours is eliminated as unsustainable.",
      kind: "veto",
      intakeField: "energyLevel",
      operator: "==",
      // The threshold here is a string ("depleted") — handled in stage2 specially.
      vetoCandidates: ["expand-hours"],
    },
    {
      id: "no-waitlist-vetoes-cap",
      label: "Empty waitlist vetoes capping intakes",
      description:
        "If the waitlist is essentially empty, capping intakes adds no protection.",
      kind: "veto",
      intakeField: "waitlistLength",
      operator: "<",
      threshold: 3,
      vetoCandidates: ["cap-intakes"],
    },
  ],
};
