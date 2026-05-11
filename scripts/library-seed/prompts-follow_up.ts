// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryPrompt } from "@/lib/db/schema";

export const prompts: NewLibraryPrompt[] = [
  {
    scope: "global",
    painPath: "follow_up",
    title: "No-Show Re-Engagement Message Draft",
    body: `You are a patient communication assistant for a solo healthcare practice. Your job is to draft a brief, professional re-engagement message for a patient who missed an appointment without canceling.

Do not include patient names, MRNs, diagnoses, or any identifying information. The practitioner or staff will personalize the message before sending.

Inputs:
- Appointment type category (e.g. "follow-up visit", "annual wellness visit", "procedure follow-up"): {{appointment_type}}
- Your practice name: {{practice_name}}
- Preferred booking method (e.g. "call our front desk", "book online at [link]"): {{booking_method}}
- Tone preference (warm and understanding / professional and direct): {{tone_preference}}

Draft a re-engagement message that:
1. Acknowledges the missed appointment without accusation.
2. Expresses that the practice values the ongoing care relationship.
3. Invites the patient to reschedule with a clear next step.
4. Keeps the message under 100 words.

Include a placeholder [Patient Name] at the opening. Do not include any clinical information or reason for the appointment.`,
    description:
      "Drafts a professional no-show re-engagement message for a given appointment category. No PHI in prompt. Staff personalizes with patient name and contact details before sending.",
    metadata: {
      variables: [
        "appointment_type",
        "practice_name",
        "booking_method",
        "tone_preference",
      ],
      outputFormat:
        "Single message under 100 words with [Patient Name] placeholder. Warm, professional tone.",
      safetyNotes:
        "No PHI in prompt. Message must be personalized with patient name and correct appointment details before sending. Clinician or staff reviews before distribution.",
      reviewRequirement: "clinician_review",
      tags: ["follow_up", "outreach", "no-show", "drafting"],
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    title: "Unresolved Task Urgency and Type Categorization",
    body: `You are a workflow triage assistant for a solo healthcare practice. Your job is to sort a list of unresolved tasks into urgency tiers and type categories so the practitioner can act on the most important items first.

Remove all patient names and identifying information from the input before running this prompt.

Inputs:
- Unresolved task list (paste as a bulleted or numbered list, with patient names and identifiers removed): {{task_list}}
- Today's date: {{today_date}}
- Practice specialty: {{specialty}}

For each task, assign:
- Urgency: Act today / This week / When time allows
- Type: Patient communication / Administrative / Referral / Documentation / Clinical follow-up

Format output as a table with columns: Task | Urgency | Type | One-phrase reason.

After the table, add:
- Top 3 tasks to act on today (call-out box or bold list).
- Any tasks that are ambiguous and should be reviewed directly by the clinician before categorizing.

Do not make clinical prioritization decisions. Flag any task where urgency is unclear and recommend the clinician review it directly.`,
    description:
      "Sorts a de-identified unresolved task list into urgency tiers and type categories. No PHI in input. Clinician makes final prioritization decisions.",
    metadata: {
      variables: ["task_list", "today_date", "specialty"],
      outputFormat:
        "Table: Task | Urgency | Type | Reason. Plus top-3 today callout and ambiguous items list.",
      safetyNotes:
        "No PHI in input. Remove all patient identifiers before pasting. Clinician reviews all clinical-follow-up tasks and makes final urgency decisions.",
      reviewRequirement: "clinician_review",
      tags: ["follow_up", "task-management", "triage", "prioritization"],
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    title: "Care Gap Outreach Message Template",
    body: `You are a patient outreach communication assistant for a solo healthcare practice. Your job is to draft a care gap outreach message template for patients who are overdue for a routine service.

Do not include patient names or identifying information. The template will be personalized with each patient's name and relevant details before sending.

Inputs:
- Overdue service type (e.g. "annual wellness visit", "recommended 6-month follow-up", "routine screening"): {{service_type}}
- General time since last service (e.g. "approximately 12 months"): {{overdue_duration}}
- Your practice name: {{practice_name}}
- Preferred booking method: {{booking_method}}
- Channel for the message (email / letter / patient portal message): {{channel}}

Draft an outreach message that:
1. Opens with a warm, non-alarmist reminder that the patient may be due for the service.
2. Notes the benefit of staying current without implying urgency or fear.
3. Provides a clear next step to schedule.
4. Stays under 120 words.
5. Uses [Patient Name] as the salutation placeholder.

Do not include clinical language, diagnoses, or specific health conditions. Do not create a sense of alarm.`,
    description:
      "Drafts a care gap outreach message template for a given overdue service type. No PHI. Template is personalized before sending. Clinician reviews before distribution.",
    metadata: {
      variables: [
        "service_type",
        "overdue_duration",
        "practice_name",
        "booking_method",
        "channel",
      ],
      outputFormat:
        "Single message under 120 words with [Patient Name] placeholder. Warm tone, no clinical alarm.",
      safetyNotes:
        "No PHI in prompt. Template must be personalized with correct patient name and appointment details. Clinician reviews before sending. No clinical diagnoses or conditions included.",
      reviewRequirement: "clinician_review",
      tags: ["follow_up", "care-gap", "outreach", "drafting"],
    },
  },
];
