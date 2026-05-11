// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryUseCase } from "@/lib/db/schema";

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "prompt",
    title: "Analyze weekly schedule utilization and identify open slot patterns",
    body: `**Problem:** Solo practitioners often have recurring underbooked windows they cannot identify without manually reviewing weeks of schedule data.

**AI capability:** Takes a pasted table of appointment slots and fill rates (no patient names) and identifies patterns: which days and times consistently have open slots, and which are over-requested.

**Data needed:** Appointment slot counts and fill rates by day and time of day, aggregated over 4-8 weeks. No patient names or identifying information.

**Guardrails:** Analysis is a scheduling optimization aid. Business decisions based on the output (e.g. changing hours) should be reviewed against patient demand trends and payer mix. No patient data in input.

**Try this week:** Export a 4-week schedule summary from your practice management system and run it through the prompt.`,
    rationale:
      "Schedule utilization gaps are recurring revenue and capacity leaks. Identifying the patterns is an analysis task AI can do quickly once the practitioner has the aggregate data.",
    estimatedMinutesSavedPerWeek: 45,
    metadata: {
      tags: ["capacity_growth", "scheduling", "analysis", "utilization"],
      firstMetric: "Average weekly schedule fill rate",
      dataReadiness: "medium",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "prompt",
    title: "Draft a fee schedule review and adjustment rationale",
    body: `**Problem:** Fee schedules rarely get reviewed because writing the rationale for a change feels like a formal document. Outdated fees silently reduce practice revenue.

**AI capability:** Drafts a structured fee review memo covering current fee, market context (based on inputs the practitioner provides), and rationale for a proposed adjustment.

**Data needed:** Service type (general description, not CPT code), current fee, regional benchmarks if available (practitioner provides), proposed change and reason. No patient data.

**Guardrails:** Draft is a planning document only. Fee decisions must be reviewed against payer contracts, state regulations, and billing compliance requirements before implementation. Not legal or billing advice.

**Try this week:** Review one high-volume service type and draft a fee adjustment rationale using the prompt.`,
    rationale:
      "Fee schedule reviews are avoided because the writing step feels formal and risky. AI handles the structure and language, leaving the practitioner to verify the numbers and compliance context.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      tags: ["capacity_growth", "pricing", "revenue", "planning"],
      firstMetric: "Date of last fee schedule review",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "checklist",
    title: "Build a new service line readiness checklist",
    body: `**Problem:** Solo practitioners considering adding a new service type (e.g. telehealth, group sessions, a new specialty service) rarely have a systematic way to assess readiness before investing time.

**AI capability:** Generates a readiness checklist for adding a new service line, covering licensing, billing, workflow, marketing, and equipment categories based on the practitioner's specialty and the service type.

**Data needed:** Current specialty, proposed new service type, current practice size and operational capacity (general description). No patient data.

**Guardrails:** Checklist is a planning aid. Regulatory, licensing, and billing requirements must be verified against current state laws and payer contracts. Not legal or compliance advice.

**Try this week:** Run the prompt for one service type you have been considering and use the output to assess readiness gaps.`,
    rationale:
      "New service readiness checks are skipped because starting one feels overwhelming. A structured checklist reduces the activation barrier and surfaces gaps early.",
    estimatedMinutesSavedPerWeek: 20,
    metadata: {
      tags: ["capacity_growth", "new-service", "planning", "checklist"],
      firstMetric: "Number of service expansion ideas evaluated systematically in the last year",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "prompt",
    title: "Draft a growth goal summary and 90-day action plan",
    body: `**Problem:** Practitioners have growth goals but rarely write them down in a structured way, making it hard to track progress or communicate priorities to staff.

**AI capability:** Takes a practitioner's stated growth goal and relevant context (current patient volume, main constraints) and drafts a 90-day action plan with three to five concrete milestones.

**Data needed:** Growth goal in plain language (e.g. "increase new patient volume by 20% in 3 months"), current volume range, top 1-2 constraints. No patient data.

**Guardrails:** Action plan is a planning draft. Financial projections are not included. Practitioner reviews against cash flow, staffing, and scheduling capacity before committing.

**Try this week:** State your top growth goal and run it through the prompt to get a structured 90-day plan draft.`,
    rationale:
      "Written growth plans improve execution by making the goal and first steps concrete. AI produces the first draft faster than freeform planning, and practitioners edit rather than start from scratch.",
    estimatedMinutesSavedPerWeek: 25,
    metadata: {
      tags: ["capacity_growth", "planning", "goals", "action-plan"],
      firstMetric: "Presence of a written 90-day growth plan",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "prompt",
    title: "Identify top patient acquisition channels from a referral and intake summary",
    body: `**Problem:** Most solo practitioners do not know which channels (referrals, web, insurance directory, community) bring in the most new patients. Without this, marketing and outreach spend is arbitrary.

**AI capability:** Takes a summary of new patient sources over a given period and returns a ranked channel analysis with observations and suggested focus areas for the next 90 days.

**Data needed:** Aggregated new patient counts by source type over 3-6 months. No patient names or contact information. Sources listed as category labels (e.g. "physician referral", "insurance directory", "word of mouth").

**Guardrails:** Analysis is a strategic planning aid only. Practitioner validates accuracy of source data and adjusts strategy based on full business context.

**Try this week:** Ask your front desk or review your intake forms to produce a new patient source count for the last quarter, then run the analysis prompt.`,
    rationale:
      "Channel analysis is high-value for growth planning but is rarely done because aggregating the data seems tedious. Once the counts exist, AI produces the analysis quickly.",
    estimatedMinutesSavedPerWeek: 35,
    metadata: {
      tags: ["capacity_growth", "marketing", "acquisition", "analysis"],
      firstMetric: "Percentage of new patients with a tracked acquisition source",
      dataReadiness: "medium",
      riskLevel: "low",
    },
  },
];
