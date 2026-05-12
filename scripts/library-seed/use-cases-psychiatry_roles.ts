// Psychiatry industry pack: role-specific AI adoption use cases.
//
// These rows intentionally put psychiatry role/use-case terms in title + body
// because library search indexes those fields, not metadata. Content is
// workflow guidance only; diagnosis, treatment, safety, privacy, and billing
// decisions stay with the psychiatrist or responsible clinical/compliance owner.

import type { NewLibraryUseCase } from "@/lib/db/schema";

const psychiatryPack = {
  industryPack: "psychiatry",
  sourceReferences: [
    {
      label: "American Psychiatric Association Position Statement on Augmented Intelligence",
      url: "https://www.psychiatry.org/getattachment/a05f1fa4-2016-422c-bc53-5960c47890bb/Position-Statement-Role-of-AI.pdf",
    },
    {
      label: "HHS OCR Mental and Behavioral Health HIPAA Guidance",
      url: "https://www.hhs.gov/hipaa/for-professionals/special-topics/mental-health/index.html",
    },
    {
      label: "HHS OCR Psychotherapy Notes FAQ",
      url: "https://www.hhs.gov/hipaa/for-professionals/faq/2088/does-hipaa-provide-extra-protections-mental-health-information-compared-other-health.html",
    },
    {
      label: "AMA Augmented Intelligence in Medicine",
      url: "https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine",
    },
    {
      label: "FDA Clinical Decision Support Software FAQs",
      url: "https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs",
    },
  ],
};

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "checklist",
    title: "Psychiatry AI scribe note review workflow",
    body: `**Problem:** Psychiatrists and psychiatric nurse practitioners spend heavy time on documentation, but AI scribes are risky if they blur progress notes, psychotherapy notes, risk assessment language, and medication decisions.

**AI capability:** Creates a post-session review checklist for an AI-generated psychiatry note: factual accuracy, missing negatives, medication changes, risk/safety language, psychotherapy note separation, and clinician sign-off.

**Data needed:** Tool output category, note type, visit type, and practice documentation requirements. Do not paste identifiable transcripts, recordings, patient names, or raw psychotherapy process notes into unapproved tools.

**Guardrails:** AI does not diagnose, assess risk, prescribe, or finalize documentation. The psychiatrist verifies all clinical content and keeps psychotherapy notes separate according to policy, HIPAA requirements, and applicable law.

**Try this week:** Use a synthetic visit example to build your scribe review checklist before testing any tool with real clinical content.`,
    rationale:
      "Psychiatry documentation is high-value but sensitive. A note review workflow lets a practice evaluate scribes while preserving clinician accountability and psychotherapy-note boundaries.",
    estimatedMinutesSavedPerWeek: 60,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatric nurse practitioner", "practice owner"],
      useCases: ["AI scribe", "psychiatry documentation", "psychotherapy notes", "clinical note review"],
      tags: ["psychiatry", "documentation", "scribe", "psychotherapy-notes", "admin"],
      firstMetric: "Percentage of AI-drafted notes reviewed with a psychiatry-specific checklist",
      dataReadiness: "medium",
      riskLevel: "high",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "checklist",
    title: "Psychiatry measurement-based care trend summary",
    body: `**Problem:** Psychiatrists collect PHQ-9, GAD-7, ADHD, sleep, side-effect, or functioning scores, but the trend is often buried across forms and visit notes.

**AI capability:** Summarizes de-identified measurement trends into a clinician review table: score direction, missing measures, side-effect flags, follow-up questions, and uncertainty notes.

**Data needed:** De-identified aggregate scores by date or visit number, measure name, and non-identifying side-effect categories. Do not include patient names, dates of birth, free-text crisis notes, or raw chart notes.

**Guardrails:** AI does not interpret severity, change treatment, or determine safety. The psychiatrist reviews trends and makes all clinical decisions.

**Try this week:** Use a synthetic score history to create a one-page trend summary template for your most common measure set.`,
    rationale:
      "Measurement-based psychiatry benefits from structured trend review. AI can organize scores and missing data while clinicians retain interpretation and care decisions.",
    estimatedMinutesSavedPerWeek: 45,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatric nurse practitioner", "behavioral health clinician"],
      useCases: ["measurement-based care", "PHQ-9", "GAD-7", "ADHD monitoring", "symptom tracking"],
      tags: ["psychiatry", "measurement-based-care", "follow_up", "symptom-tracking"],
      firstMetric: "Minutes to prepare score trend summary before follow-up visits",
      dataReadiness: "medium",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "checklist",
    title: "Psychiatry safety plan follow-up task tracker",
    body: `**Problem:** Psychiatry practices manage follow-up tasks after safety planning, higher-acuity visits, risk-related psychiatry visits, or care coordination events, but task ownership and completion can be hard to track.

**AI capability:** Turns a de-identified task list into an accountable tracker with task type, owner, due window, escalation question, and clinician-review flag.

**Data needed:** Generic task descriptions without names, identifiers, diagnoses, crisis details, or other patient details. Use labels like "confirm follow-up appointment" or "send resource list" rather than patient-specific content.

**Guardrails:** AI does not assess suicide risk, determine acuity, or decide escalation. Any safety, risk, or crisis-related task must be reviewed by the responsible clinician using practice policy.

**Try this week:** Build a synthetic safety-plan follow-up tracker with five generic tasks and decide which fields your practice must review manually.`,
    rationale:
      "Psychiatry safety workflows need clarity and accountability. AI can organize non-identifying tasks, but risk assessment and escalation stay with clinicians.",
    estimatedMinutesSavedPerWeek: 35,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "behavioral health clinician", "care coordinator"],
      useCases: ["safety plan follow-up", "crisis workflow", "task tracking", "care coordination"],
      tags: ["psychiatry", "safety-plan", "follow_up", "care-coordination"],
      firstMetric: "Percentage of high-priority follow-up tasks with owner and due window",
      dataReadiness: "medium",
      riskLevel: "high",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "checklist",
    title: "Psychiatry AI therapy chatbot patient-use risk review",
    body: `**Problem:** Patients increasingly use general AI chatbots for mental health support. Psychiatrists may need a structured way to discuss risks without endorsing the tool or replacing care.

**AI capability:** Creates a patient-education and documentation checklist covering boundaries, crisis instructions, privacy concerns, hallucinated advice, dependency risk, and when to contact the clinician or emergency services.

**Data needed:** Practice policy, communication channel, crisis resource language, and approved educational points. No patient-specific disclosures or chatbot transcripts.

**Guardrails:** AI chatbots are not treated as clinicians. Clinician reviews all patient-facing language, and crisis instructions must follow practice policy and local emergency guidance.

**Try this week:** Draft a neutral patient handout outline explaining what AI chatbots can and cannot safely do for mental health support.`,
    rationale:
      "Patient use of AI chatbots is already happening. Psychiatry practices need plain boundaries, crisis guidance, and documentation language before it becomes an ad hoc conversation.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "therapist", "practice owner"],
      useCases: ["AI therapy chatbot", "patient education", "mental health chatbot risk", "crisis boundaries"],
      tags: ["psychiatry", "therapy-chatbot", "patient-education", "admin"],
      firstMetric: "Presence of a reviewed patient-facing AI chatbot risk handout",
      dataReadiness: "high",
      riskLevel: "high",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "prompt",
    title: "Psychiatry prior authorization support draft for TMS or Spravato",
    body: `**Problem:** Psychiatry prior authorizations for treatments such as TMS, Spravato, or higher-intensity services require structured medical-necessity language, but drafts are time-consuming.

**AI capability:** Drafts a non-identifying prior authorization support letter framework using treatment category, payer criteria checklist, general indication category, previous treatment category count, and clinician-supplied rationale.

**Data needed:** Treatment category, payer checklist, general non-identifying clinical rationale, and documentation items to verify. Do not include patient names, dates, exact medication history, or record excerpts in non-approved tools.

**Guardrails:** Draft is a template only. Psychiatrist verifies diagnosis, medical necessity, payer criteria, consent, and all patient-specific facts before submission.

**Try this week:** Build a reusable TMS or Spravato prior auth outline from a payer checklist using synthetic facts.`,
    rationale:
      "Psychiatry prior auth work is structured and repetitive, but patient-specific accuracy is critical. AI can draft the shell while the clinician owns all facts and medical necessity.",
    estimatedMinutesSavedPerWeek: 60,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatry practice manager", "billing coordinator"],
      useCases: ["prior authorization", "TMS", "Spravato", "medical necessity letter"],
      tags: ["psychiatry", "prior-auth", "tms", "spravato", "admin"],
      firstMetric: "Minutes to produce first prior authorization support draft",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "admin",
    startingLevel: "checklist",
    title: "Psychiatry controlled substance refill review queue",
    body: `**Problem:** Psychiatry practices often need a consistent process for stimulant, benzodiazepine, or other controlled-substance refill requests, including policy checks and clinician review.

**AI capability:** Organizes refill requests into a review queue using non-identifying fields: medication category, last appointment window, policy checklist status, missing information, and clinician-review reason.

**Data needed:** De-identified request category, policy checklist items, appointment status category, and missing-documentation flags. Do not include patient names, medication doses, PDMP details, or chart excerpts in unapproved tools.

**Guardrails:** AI does not approve, deny, or recommend controlled-substance refills. Clinician verifies all facts, PDMP requirements, safety concerns, and practice policy before action.

**Try this week:** Create a generic controlled-substance refill checklist and test the queue on synthetic requests.`,
    rationale:
      "Controlled-substance workflows are high-risk and repetitive. AI can help structure the queue, but prescribing decisions remain entirely clinician-controlled.",
    estimatedMinutesSavedPerWeek: 40,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatric nurse practitioner", "medical assistant"],
      useCases: ["controlled substance refill", "ADHD stimulant refill", "benzodiazepine refill", "policy checklist"],
      tags: ["psychiatry", "refills", "controlled-substances", "admin"],
      firstMetric: "Percentage of refill requests with completed policy checklist before clinician review",
      dataReadiness: "medium",
      riskLevel: "high",
    },
  },
  {
    scope: "global",
    painPath: "referrals",
    startingLevel: "checklist",
    title: "Psychiatry referral triage and waitlist routing checklist",
    body: `**Problem:** Psychiatry intake demand often exceeds capacity. Referral and waitlist routing can become inconsistent when urgency, fit, insurance, service type, and safety exclusions are handled manually.

**AI capability:** Produces a referral triage checklist using non-identifying referral categories: service requested, age band, acuity flag category, insurance status category, and next routing step for human review.

**Data needed:** Referral category labels only. Do not paste referral letters, names, contact information, clinical narratives, or crisis details.

**Guardrails:** AI does not determine clinical urgency or eligibility. A clinician or trained intake owner reviews all acuity, exclusion, and safety-related items using practice policy.

**Try this week:** Build a routing checklist for adult psychiatry intake, therapy referral, medication management, and higher-acuity exclusions using synthetic referral examples.`,
    rationale:
      "Psychiatry access bottlenecks are often routing bottlenecks. AI can make the intake checklist more consistent while humans retain acuity and eligibility decisions.",
    estimatedMinutesSavedPerWeek: 50,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "intake coordinator", "practice manager"],
      useCases: ["referral triage", "waitlist routing", "psychiatry intake", "access management"],
      tags: ["psychiatry", "referrals", "intake", "waitlist"],
      firstMetric: "Percentage of referrals routed with a documented checklist",
      dataReadiness: "medium",
      riskLevel: "high",
    },
  },
  {
    scope: "global",
    painPath: "research",
    startingLevel: "prompt",
    title: "Psychiatry literature screening for medication and therapy updates",
    body: `**Problem:** Psychiatrists need to track medication safety updates, medication safety studies, psychotherapy evidence, digital mental health tools, and guideline changes, but literature review time is limited.

**AI capability:** Converts public abstracts or guideline summaries into a psychiatry relevance table: population, condition area, intervention, outcome, limitations, applicability, and whether a human should read the full text.

**Data needed:** Public titles, abstracts, guideline summaries, and the psychiatrist's focus area. Do not include patient data or confidential peer-review material.

**Guardrails:** AI summarizes only. It does not decide whether a study should change practice. Psychiatrist verifies source quality and applies clinical judgment before changing practice.

**Try this week:** Screen 10 public abstracts related to your focus area and have AI flag the three most practice-relevant items for full human review.`,
    rationale:
      "Psychiatry evidence review is a strong low-PHI AI use case when limited to public abstracts and human verification.",
    estimatedMinutesSavedPerWeek: 60,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatry researcher", "resident educator"],
      useCases: ["psychiatry literature review", "psychopharmacology update", "therapy evidence", "guideline screening"],
      tags: ["psychiatry", "research", "literature-review", "psychopharmacology"],
      firstMetric: "Minutes to prepare a first-pass psychiatry reading list",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "follow_up",
    startingLevel: "prompt",
    title: "Psychiatry missed appointment re-engagement message",
    body: `**Problem:** Missed psychiatry appointments can create care continuity and safety concerns, but outreach language needs to be warm, non-stigmatizing, and privacy-aware.

**AI capability:** Drafts a brief no-show, missed-visit, or missed therapy session patient communication template by appointment category, communication channel, and practice tone.

**Data needed:** Appointment category, booking method, practice name, and approved crisis-resource language. Do not include diagnosis, medication, crisis details, or patient identifiers.

**Guardrails:** Clinician or staff reviews before sending. Use practice policy for urgent safety outreach and emergency instructions.

**Try this week:** Draft separate templates for medication management follow-up, missed therapy session, and intake appointment.`,
    rationale:
      "Psychiatry re-engagement outreach needs careful tone and privacy discipline. AI can draft reusable templates without patient details.",
    estimatedMinutesSavedPerWeek: 25,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "therapist", "front office lead"],
      useCases: ["missed appointment", "no-show outreach", "psychiatry follow-up", "patient re-engagement"],
      tags: ["psychiatry", "no-show", "follow_up", "patient-communication"],
      firstMetric: "Percentage of missed visits with reviewed outreach within 48 hours",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "capacity_growth",
    startingLevel: "checklist",
    title: "Psychiatry practice AI readiness map",
    body: `**Problem:** Psychiatry practice owners and solo psychiatrists may want AI for notes, intake, scheduling, measurement-based care, refills, prior auth, or patient messaging, but the risk profile differs sharply by workflow.

**AI capability:** Builds a psychiatry-specific readiness map that helps identify safe first AI use cases and classifies workflows as low-risk drafting, human-review-required, high-risk clinical, or not-ready-for-AI.

**Data needed:** Workflow list, data categories, review owner, tool type, and rough weekly volume. Use only generic task descriptions.

**Guardrails:** High-risk workflows involving diagnosis, safety, prescribing, psychotherapy notes, minors, or SUD information require clinical, privacy, compliance, and legal review before adoption.

**Try this week:** List 12 recurring practice workflows and mark each as draft-only, human-review-required, high-risk clinical, or not-ready-for-AI.`,
    rationale:
      "Psychiatry AI adoption needs a sharper risk map than generic healthcare. This gives owners a practical first screen before buying tools or changing workflows.",
    estimatedMinutesSavedPerWeek: 45,
    metadata: {
      ...psychiatryPack,
      roles: ["psychiatrist", "psychiatry practice owner", "operations manager"],
      useCases: ["AI adoption plan", "psychiatry operations", "workflow risk map", "practice readiness"],
      tags: ["psychiatry", "practice-operations", "capacity_growth", "governance"],
      firstMetric: "Number of workflows classified by psychiatry-specific AI risk tier",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
];
