// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryUseCase } from "@/lib/db/schema";

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "checklist",
    title: "Build a post-visit follow-up checklist by visit type",
    body: `**Problem:** Follow-up steps vary by visit type but practitioners rarely have a written checklist. Steps get missed or inconsistently executed depending on the day's workload.

**AI capability:** Generates a post-visit follow-up checklist for a given visit type, covering documentation, communication, referrals, and scheduling tasks.

**Data needed:** Visit type or appointment category (e.g. "initial evaluation", "procedure follow-up", "annual wellness visit"), your specialty, and any known required steps. No patient data.

**Guardrails:** Checklist is a workflow aid. Clinical documentation requirements must be validated against payer rules, specialty guidelines, and state regulations. Not a substitute for clinical judgment.

**Try this week:** Generate a checklist for your two most common visit types and compare them to your current process.`,
    rationale:
      "Post-visit follow-up checklists reduce missed steps and cognitive load at the end of a busy session. The first version does not need to be perfect; it needs to exist.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      tags: ["follow_up", "checklist", "post-visit", "workflow"],
      firstMetric: "Number of follow-up steps missed per week",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "prompt",
    title: "Draft a no-show re-engagement outreach message",
    body: `**Problem:** When a patient misses an appointment without canceling, follow-up outreach is inconsistent. Some patients are never contacted, leading to care gaps and lost revenue.

**AI capability:** Drafts a brief, professional re-engagement message for a no-show patient using the appointment type category and a warm, non-accusatory tone. No PHI in the draft.

**Data needed:** Appointment type category (e.g. "follow-up visit", "annual wellness"), general number of missed appointments (if relevant), practice name. No patient names or identifiers.

**Guardrails:** Message must be personalized with the correct patient name and appointment details before sending. No PHI in the prompt. Clinician or staff reviews before sending.

**Try this week:** Draft re-engagement messages for three appointment categories common in your practice.`,
    rationale:
      "No-show re-engagement is a revenue recovery and care quality task that practitioners delay because drafting feels low-priority. AI removes the drafting friction so outreach actually happens.",
    estimatedMinutesSavedPerWeek: 35,
    metadata: {
      tags: ["follow_up", "outreach", "no-show", "drafting"],
      firstMetric: "Percentage of no-show patients contacted within 48 hours",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "prompt",
    title: "Categorize an unresolved task list into urgency and type",
    body: `**Problem:** Unresolved follow-up tasks pile up without a clear system for deciding what to act on first. The list grows, but the highest-priority items are not always visible.

**AI capability:** Takes a pasted list of unresolved tasks (general descriptions, no PHI) and returns them organized by urgency tier (act today / this week / when time allows) and type (patient communication, administrative, referral, documentation).

**Data needed:** A plain-text list of task descriptions. Remove any patient-identifying information before pasting. Keep descriptions generic (e.g. "follow up on lab referral" not a patient name + lab type).

**Guardrails:** Triage output is a starting point. Clinician reviews the categorization and makes final urgency decisions. Clinical tasks require clinician prioritization, not AI delegation.

**Try this week:** Paste your current open task list and run the categorization prompt. Act on the top three items in the "today" tier.`,
    rationale:
      "Unresolved task categorization is a daily overhead that compounds over the week. A 5-minute AI triage pass surfaces the highest-priority items so the day starts with a clear first action.",
    estimatedMinutesSavedPerWeek: 50,
    metadata: {
      tags: ["follow_up", "task-management", "triage", "prioritization"],
      firstMetric: "Number of tasks older than 7 days in the unresolved list",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "prompt",
    title: "Draft a care gap outreach message for overdue services",
    body: `**Problem:** Patients who are overdue for routine care (e.g. annual visit, recommended follow-up) are not proactively contacted. Outreach requires writing messages that feel personalized without actually involving patient data.

**AI capability:** Drafts a care gap outreach message template for a given service type using a professional and caring tone. Template includes placeholders the practitioner fills in before sending.

**Data needed:** Service type (e.g. "annual wellness visit", "recommended 6-month follow-up"), practice name, preferred appointment booking method. No patient names or identifiers.

**Guardrails:** Template requires personalization before sending. No PHI in prompt. All patient-facing communications must be reviewed by the clinician before distribution.

**Try this week:** Create outreach templates for the two most common overdue care types in your practice.`,
    rationale:
      "Care gap outreach templates reduce the time to send proactive communications from 20 minutes to 5 minutes. The investment is in the template, not in each individual message.",
    estimatedMinutesSavedPerWeek: 40,
    metadata: {
      tags: ["follow_up", "care-gap", "outreach", "drafting"],
      firstMetric: "Number of care gap outreach messages sent per month",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "checklist",
    title: "Generate a referral follow-up tracking checklist",
    body: `**Problem:** When a referral is sent to an external provider, follow-up on whether the patient was seen and what was found is rarely tracked systematically.

**AI capability:** Generates a referral follow-up tracking checklist covering: confirmation the referral was sent, confirmation the patient was seen, receipt of notes or findings, and any required next steps.

**Data needed:** Referral type categories used in your practice (e.g. "imaging", "specialist consultation", "behavioral health"), your workflow for sending referrals. No patient data.

**Guardrails:** Checklist is a coordination aid. Clinical follow-up on referral outcomes requires clinician review and is not automated. Clinician remains responsible for care continuity.

**Try this week:** Run the prompt for your most common referral type and review the checklist against your current tracking process.`,
    rationale:
      "Referral tracking gaps create care continuity risks and administrative rework. A written checklist that mirrors real workflow closes more gaps than relying on memory.",
    estimatedMinutesSavedPerWeek: 25,
    metadata: {
      tags: ["follow_up", "referrals", "tracking", "checklist"],
      firstMetric: "Percentage of outgoing referrals with a confirmed receipt of specialist notes",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
];
