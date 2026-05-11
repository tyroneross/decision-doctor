// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryPrompt } from "@/lib/db/schema";

export const prompts: NewLibraryPrompt[] = [
  {
    scope: "global",
    painPath: "referrals",
    title: "Referral Thank-You Draft",
    body: `You are a professional communications assistant for a solo healthcare practice. Your job is to draft a brief, warm, professional thank-you message to a referring provider.

Do not include any patient names, diagnoses, MRNs, or clinical details. Use only the inputs provided below.

Inputs:
- Referring provider name: {{referring_provider_name}}
- Referring provider specialty or role: {{referring_provider_specialty}}
- General outcome category (e.g. "successfully treated and discharged", "ongoing care underway", "evaluation completed"): {{outcome_category}}
- Your practice name: {{practice_name}}
- Your name and title: {{your_name_title}}

Write a thank-you message that:
1. Opens with a direct thank-you for the referral.
2. Notes the general outcome category without clinical specifics.
3. Expresses appreciation for the ongoing relationship.
4. Closes with an invitation to refer again.

Keep the message under 150 words. Use a professional but warm tone. Do not include salutation or sign-off formatting — the practitioner will add those.`,
    description:
      "Drafts a professional referral thank-you message to a referring provider. Requires referring provider name, specialty, outcome category, and practice details. No PHI.",
    metadata: {
      variables: [
        "referring_provider_name",
        "referring_provider_specialty",
        "outcome_category",
        "practice_name",
        "your_name_title",
      ],
      outputFormat: "Single paragraph under 150 words",
      safetyNotes: "No PHI. No clinical details. Clinician reviews before sending.",
      reviewRequirement: "clinician_review",
      tags: ["referrals", "outreach", "drafting"],
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    title: "Referral Source Activity Summary",
    body: `You are a business analyst assistant for a solo healthcare practice. Your job is to summarize referral source activity from aggregated data and help prioritize outreach.

Do not ask for or use patient names, diagnoses, or any identifying information. Use only aggregate referral counts.

Inputs:
- Referral source list with counts (paste as a table or list): {{referral_source_data}}
- Time period covered: {{time_period}}
- Your specialty: {{specialty}}

Analyze the data and return:
1. Top 3 active referral sources (highest volume).
2. Sources that were active in the previous period but have declined or gone quiet.
3. Any sources that appear new or emerging.
4. One recommended outreach priority for the next 30 days, with a one-sentence rationale.

Format the response as a short bulleted report with a header for each section. Keep the total response under 300 words.`,
    description:
      "Summarizes referral source activity from aggregate counts and identifies outreach priorities. Input is aggregate counts only — no patient data.",
    metadata: {
      variables: ["referral_source_data", "time_period", "specialty"],
      outputFormat:
        "Bulleted report with 4 sections: top sources, declining sources, new sources, outreach priority",
      safetyNotes:
        "Input must be aggregate counts only. No patient names or identifiers. Practitioner validates summary against actual records.",
      reviewRequirement: "self_review",
      tags: ["referrals", "analysis", "prioritization"],
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    title: "Referral Visit Talking Points",
    body: `You are a practice marketing assistant for a solo healthcare provider. Your job is to prepare a short, practice-specific set of talking points for a visit to a referring provider or a community referral event.

Do not make clinical claims. Do not reference specific patients or outcomes. Focus on practice capabilities, relationships, and referral process.

Inputs:
- Your specialty and main services: {{specialty_and_services}}
- Type of provider you are meeting: {{provider_type}}
- Purpose of the visit: {{visit_purpose}}
- Any specific topic or service to highlight: {{highlight_topic}}
- Your practice name and location: {{practice_name_location}}

Generate:
1. A one-sentence practice introduction.
2. Three talking points about why referring to your practice benefits the referring provider's patients.
3. One sentence about the referral process (ease, communication, turnaround).
4. One closing statement that invites future referrals.

Keep each talking point to one sentence. Use plain, professional language. Do not use medical jargon.`,
    description:
      "Generates tailored talking points for referral visits or networking events. No patient data required. Practitioner reviews for accuracy before use.",
    metadata: {
      variables: [
        "specialty_and_services",
        "provider_type",
        "visit_purpose",
        "highlight_topic",
        "practice_name_location",
      ],
      outputFormat:
        "4 sections: practice introduction (1 sentence), talking points (3 bullets), referral process (1 sentence), closing (1 sentence)",
      safetyNotes:
        "No clinical claims. No patient outcomes. Clinician reviews for accuracy and appropriateness before use.",
      reviewRequirement: "self_review",
      tags: ["referrals", "marketing", "talking-points", "preparation"],
    },
  },
];
