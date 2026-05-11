// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryPrompt } from "@/lib/db/schema";

export const prompts: NewLibraryPrompt[] = [
  {
    scope: "global",
    painPath: "capacity_growth",
    title: "Schedule Utilization Pattern Analysis",
    body: `You are a scheduling and capacity analyst for a solo healthcare practice. Your job is to analyze aggregate appointment data and identify utilization patterns that can inform scheduling decisions.

You are analyzing aggregate data only. No patient names or identifying information should be included in the input.

Inputs:
- Appointment slot data: a table or list showing day of week, time of day, total slots, and filled slots for each time block, covering at least 4 weeks: {{schedule_data}}
- Practice specialty: {{specialty}}
- Current scheduling hours (e.g. "Mon-Fri 9am-5pm, Tue evening 5-7pm"): {{current_hours}}

Return:
1. Top 3 underutilized time blocks (lowest average fill rate, with fill rate shown).
2. Top 3 highest-demand time blocks (highest fill rate or most frequent waitlist notes if provided).
3. Day-of-week pattern summary (which days trend high vs low).
4. One suggested scheduling adjustment to explore, with a one-sentence rationale.
5. One data gap to address (what additional data would improve this analysis).

Do not make financial projections. Do not recommend changes without the practitioner validating against operational constraints.`,
    description:
      "Analyzes aggregate schedule data to surface underbooked and overbooked time block patterns. Input is aggregate counts — no PHI. Practitioner validates against operational context.",
    metadata: {
      variables: ["schedule_data", "specialty", "current_hours"],
      outputFormat:
        "5 sections: underutilized blocks (top 3), high-demand blocks (top 3), day-of-week pattern, suggested adjustment, data gap",
      safetyNotes:
        "No PHI in input. Analysis is a planning aid — practitioner validates before changing scheduling. No financial projections included.",
      reviewRequirement: "self_review",
      tags: ["capacity_growth", "scheduling", "analysis", "utilization"],
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    title: "90-Day Growth Goal Action Plan",
    body: `You are a business planning assistant for a solo healthcare practice. Your job is to draft a concrete 90-day action plan for a stated growth goal.

You are producing a planning draft. The practitioner validates the plan against their financial, staffing, and operational reality before committing.

Inputs:
- Growth goal (state in plain language): {{growth_goal}}
- Current approximate patient or appointment volume: {{current_volume}}
- Top 1-2 constraints or risks to reaching the goal: {{constraints}}
- Practice specialty and main services: {{specialty_services}}
- Available time for growth activities per week (e.g. "2 hours"): {{available_time}}

Draft a 90-day action plan with:
1. Goal restatement (1 sentence — specific and measurable version of the input goal).
2. Month 1 milestones (3 concrete actions with completion criteria).
3. Month 2 milestones (3 concrete actions building on Month 1).
4. Month 3 milestones (3 concrete actions aimed at hitting the goal).
5. Risk flag (1-2 sentences: what could derail the plan, based on the stated constraints).

Keep each milestone to one sentence. Focus on actions the practitioner can take without new hires or major capital investment unless stated otherwise.`,
    description:
      "Drafts a 90-day growth action plan from a stated goal and constraints. No PHI. Practitioner validates against financial and operational reality before committing.",
    metadata: {
      variables: [
        "growth_goal",
        "current_volume",
        "constraints",
        "specialty_services",
        "available_time",
      ],
      outputFormat:
        "5 sections: goal restatement, Month 1 milestones (3 bullets), Month 2 milestones (3 bullets), Month 3 milestones (3 bullets), risk flag",
      safetyNotes:
        "Planning draft only — not financial advice. No PHI. Practitioner reviews against cash flow, staffing, and regulatory requirements.",
      reviewRequirement: "self_review",
      tags: ["capacity_growth", "planning", "goals", "action-plan"],
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    title: "New Patient Acquisition Channel Analysis",
    body: `You are a practice growth analyst for a solo healthcare practice. Your job is to analyze new patient acquisition data and identify the most productive channels for focused outreach.

You are analyzing aggregate counts only. No patient names or contact information should be in the input.

Inputs:
- New patient source summary: a list of source categories and counts over a stated period (e.g. "Physician referral: 14, Insurance directory: 8, Word of mouth: 6, Walk-in: 2"): {{source_data}}
- Time period covered: {{time_period}}
- Practice specialty and location type (e.g. "solo pediatric practice, suburban"): {{practice_context}}

Return:
1. Top 2 channels by volume (with count and percentage of total).
2. Any channel that is surprisingly low given the practice type (1-2 sentences).
3. Channel with the most growth potential given the practice context (1 sentence with rationale).
4. Recommended 30-day outreach priority (1 specific action focused on the highest-potential channel).
5. Data quality note (is the source tracking complete enough to act on? What gaps exist?).

Do not make revenue projections. Frame recommendations as hypotheses to test, not conclusions.`,
    description:
      "Analyzes aggregate new patient acquisition channel counts and identifies outreach priorities. Input is aggregate counts — no PHI.",
    metadata: {
      variables: ["source_data", "time_period", "practice_context"],
      outputFormat:
        "5 sections: top 2 channels, low-performing channel observation, growth-potential channel, 30-day priority action, data quality note",
      safetyNotes:
        "Aggregate counts only — no patient names or contact info. Practitioner validates before acting on recommendations.",
      reviewRequirement: "self_review",
      tags: ["capacity_growth", "marketing", "acquisition", "analysis"],
    },
  },
];
