// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryUseCase } from "@/lib/db/schema";

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "prompt",
    title: "Triage incoming patient messages by urgency tier",
    body: `**Problem:** Inbox piles up between visits. Quick clinical messages get buried under refill requests and forms, making it hard to act on what matters first.

**AI capability:** Classifies incoming messages into urgency tiers (respond today / this week / routine) using subject line and first 100 characters. No PHI included in the classification prompt.

**Data needed:** Message subject line and first 100 characters of message body (remove any identifiers before pasting). No patient names or clinical details.

**Guardrails:** Classification is a triage aid only. Clinician verifies all urgent-tier messages before acting. No clinical decisions are delegated to the AI output.

**Try this week:** Paste five message subjects from your inbox and classify them using the triage prompt.`,
    rationale:
      "Inbox triage is high-frequency, low-cognitive work that slows down practitioners who lack support staff. AI classification gives a starting tier that the clinician confirms in seconds.",
    estimatedMinutesSavedPerWeek: 60,
    metadata: {
      tags: ["admin", "inbox", "triage", "messaging"],
      firstMetric: "Minutes per day spent triaging inbox",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "prompt",
    title: "Draft a prior authorization support letter",
    body: `**Problem:** Prior authorization letters require a formal structure and take 20-40 minutes each to draft. The process is repetitive but must be accurate.

**AI capability:** Drafts the structural and rationale sections of a prior auth letter based on the procedure name, general indication category, and typical clinical rationale for that procedure type.

**Data needed:** Procedure name, indication category (e.g. "musculoskeletal pain unresponsive to conservative therapy"), payer name. No patient names, MRNs, or specific clinical history.

**Guardrails:** Draft is a template only. Clinician must insert accurate clinical specifics, verify medical necessity language meets payer standards, and sign. No PHI in the initial prompt.

**Try this week:** Draft support letters for the two most common prior auth request types in your practice.`,
    rationale:
      "Prior auth drafting is structural writing that AI handles well. The bottleneck is starting the draft, not editing it. This use case reduces that bottleneck without removing clinician accountability.",
    estimatedMinutesSavedPerWeek: 90,
    metadata: {
      tags: ["admin", "prior-auth", "drafting", "insurance"],
      firstMetric: "Minutes per prior authorization letter drafted",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "checklist",
    title: "Generate a new patient onboarding checklist",
    body: `**Problem:** New patient onboarding involves many small steps that are easy to forget or inconsistently executed without a staff member dedicated to the process.

**AI capability:** Generates a customized new patient onboarding checklist based on the practice specialty, visit type, and required paperwork categories.

**Data needed:** Specialty, types of first visits offered (e.g. evaluation, intake, consultation), required forms (general categories, not content). No patient data.

**Guardrails:** Checklist is a workflow planning tool. Content should be reviewed against actual practice requirements before use. Regulatory requirements for informed consent and documentation must be verified by the clinician.

**Try this week:** Run the prompt and compare the generated checklist to your current onboarding process. Note gaps.`,
    rationale:
      "Onboarding checklists reduce missed steps and staff training overhead. The first AI-generated version will be 70-80% accurate and gives a concrete starting point for customization.",
    estimatedMinutesSavedPerWeek: 25,
    metadata: {
      tags: ["admin", "onboarding", "checklist", "workflow"],
      firstMetric: "Number of onboarding steps missed per new patient intake",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "prompt",
    title: "Draft a practice policy or patient FAQ update",
    body: `**Problem:** Practice policies and patient FAQs become outdated but rarely get updated because writing policy language is time-consuming.

**AI capability:** Drafts updated policy language or FAQ responses based on the topic, the current policy summary (if known), and the change being made.

**Data needed:** Policy topic (e.g. "appointment cancellation policy"), current policy summary or key change to make, target audience (patients vs. staff). No PHI.

**Guardrails:** Draft requires clinician review for accuracy and regulatory compliance. Legal or billing review may be required for policies involving fees, consent, or privacy. Do not publish without review.

**Try this week:** Pick one outdated FAQ on your patient intake form and draft a replacement.`,
    rationale:
      "Policy and FAQ updates are pure writing work that AI handles well. The friction is always the blank page, not the editing. This use case removes that barrier.",
    estimatedMinutesSavedPerWeek: 40,
    metadata: {
      tags: ["admin", "policy", "writing", "patient-communication"],
      firstMetric: "Number of patient-facing documents updated in the last 6 months",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "prompt",
    title: "Summarize a staff or team meeting into action items",
    body: `**Problem:** Meeting notes are rarely turned into action items quickly. Tasks get lost and follow-up is inconsistent.

**AI capability:** Takes raw meeting notes (pasted as plain text) and returns a structured summary: decisions made, action items with owners, and open questions.

**Data needed:** Pasted meeting notes in plain text. Remove any patient-identifiable information before pasting.

**Guardrails:** Summary is for internal workflow use. No PHI in input. Clinician reviews the action item list before distributing to ensure accuracy.

**Try this week:** After your next team or staff meeting, paste your raw notes and generate a structured summary within 10 minutes.`,
    rationale:
      "Meeting summaries are a quick win because the input (raw notes) already exists. AI turns unstructured notes into structured action items faster than any other method.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      tags: ["admin", "meetings", "action-items", "notes"],
      firstMetric: "Percentage of team meetings with a documented action item list within 24 hours",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
];
