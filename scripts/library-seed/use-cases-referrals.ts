// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryUseCase } from "@/lib/db/schema";

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "prompt",
    title: "Draft referral thank-you outreach",
    body: `**Problem:** After a referral, practitioners often delay or skip a follow-up thank-you to the referring provider, weakening the relationship over time.

**AI capability:** Drafts a brief, professional thank-you message to a referring provider using the referring provider's name, specialty, and a general outcome note (no PHI).

**Data needed:** Referring provider name and specialty, approximate outcome category (e.g. "successfully treated and discharged"), your practice name.

**Guardrails:** No patient names, MRNs, diagnoses, or clinical details in the prompt. Clinician reviews and personalizes before sending.

**Try this week:** Collect the last five referral sources and draft thank-you messages in one sitting.`,
    rationale:
      "Referral thank-yous are high-value relationship tasks that practitioners skip because drafting feels time-consuming. AI removes the blank-page friction.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      tags: ["referrals", "outreach", "relationships", "drafting"],
      firstMetric: "Number of thank-you messages sent per month",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "prompt",
    title: "Summarize referral source activity by quarter",
    body: `**Problem:** Solo practitioners rarely track which referral sources are active, declining, or new. Without a summary, time is spent on outreach that no longer returns value.

**AI capability:** Takes a list of referring providers and visit counts (no PHI) and produces a ranked summary: top sources, sources that dropped off, and new sources to nurture.

**Data needed:** Referral source names (provider or organization), referral counts by time period. No patient information.

**Guardrails:** Input is aggregate counts only, not patient-level records. Clinician validates the summary against actual billing or scheduling data.

**Try this week:** Export a 90-day referral count summary from your practice management system and run it through the prompt.`,
    rationale:
      "Referral source analysis helps prioritize outreach but is rarely done because the summary step is tedious. AI can produce a useful ranked view in under a minute.",
    estimatedMinutesSavedPerWeek: 45,
    metadata: {
      tags: ["referrals", "analysis", "prioritization", "reporting"],
      firstMetric: "Hours per quarter spent on referral trend review",
      dataReadiness: "medium",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "checklist",
    title: "Build a referral outreach cadence checklist",
    body: `**Problem:** Outreach to referring providers happens reactively rather than on a regular cadence, leading to uneven relationship maintenance.

**AI capability:** Generates a customized monthly outreach checklist based on the practitioner's specialty, referral source types, and preferred contact methods.

**Data needed:** Your specialty, types of referring providers (e.g. PCPs, urgent care, schools), preferred contact channel (email, phone, in-person).

**Guardrails:** Checklist is a planning tool only. No patient data involved. Practitioner adapts the cadence to local norms.

**Try this week:** Describe your referral network and ask AI to draft a 4-week outreach checklist.`,
    rationale:
      "A cadence checklist removes the overhead of re-deciding what to do each month. The first version does not need to be perfect to be useful.",
    estimatedMinutesSavedPerWeek: 20,
    metadata: {
      tags: ["referrals", "cadence", "checklist", "planning"],
      firstMetric: "Percentage of months with at least one planned referral outreach touch",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "prompt",
    title: "Draft a referral update letter to a referring provider",
    body: `**Problem:** Referring providers often do not receive timely updates on patients they sent, which erodes trust and reduces future referrals.

**AI capability:** Drafts a brief, professional update letter confirming receipt of a referral and noting the general care plan category (e.g. "evaluation scheduled" or "treatment underway"), without including PHI.

**Data needed:** Referring provider name and practice, general care plan category (not diagnosis or outcome). No patient names or identifiers.

**Guardrails:** No PHI. Letter uses generic care-plan language only. Clinician reviews, customizes clinical context, and approves before sending.

**Try this week:** Draft update letters for the last three referrals received.`,
    rationale:
      "Closing the referral loop with the sending provider is a relationship best practice that most solo practitioners skip because drafting is slow. AI makes the first draft fast.",
    estimatedMinutesSavedPerWeek: 40,
    metadata: {
      tags: ["referrals", "communication", "loop-closure", "drafting"],
      firstMetric: "Percentage of referrals with a sent update letter within 2 weeks",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "prompt",
    title: "Generate talking points for a referral source visit",
    body: `**Problem:** Visits to referring providers or referral events require preparation, but solo practitioners rarely have time to prepare tailored talking points.

**AI capability:** Produces a short set of practice-specific talking points based on specialty, services offered, and target referral type.

**Data needed:** Your specialty and key services, the type of provider you are meeting (e.g. primary care physician, school counselor), the visit purpose (introduction, relationship maintenance, new service announcement).

**Guardrails:** Talking points are marketing and relationship-building content only. No clinical claims. Clinician reviews for accuracy before use.

**Try this week:** Prepare talking points for your next referral visit or event.`,
    rationale:
      "Prepared talking points increase the quality and confidence of referral conversations. AI drafts them faster than starting from scratch, which removes the preparation barrier.",
    estimatedMinutesSavedPerWeek: 25,
    metadata: {
      tags: ["referrals", "marketing", "preparation", "talking-points"],
      firstMetric: "Number of referral source meetings per quarter",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
];
