// lib/chat/specialty-detector.ts
//
// Lightweight, zero-LLM inference of a solo-practitioner's specialty from
// chat message text. The /api/chat route runs this once per request on the
// concatenated user-message history and pipes the result into
// generateSurvey() + adaptSubmission() so the survey questions reflect the
// specialty's operational reality (named EHR, billing model, scheduling
// rhythm, compliance posture) instead of generic small-business framing.
//
// Pure regex + keyword scan. Deterministic. ~3 µs per call. No external
// dependencies. Failure mode: returns null and the prompts fall back to
// their generic behavior.

import "server-only";

export type Specialty =
  | "psychiatry"
  | "therapy"
  | "primary-care"
  | "nutrition"
  | "physical-therapy"
  | "occupational-therapy";

export type Subspecialty =
  | "womens-mental-health"
  | "child-adolescent"
  | "addiction"
  | "perinatal"
  | "geriatric";

export interface SpecialtyDetection {
  specialty: Specialty;
  subspecialty?: Subspecialty;
  /** Snippet that matched, for logging/debugging. */
  evidence: string;
}

// Ordered most-specific-first so longer phrase wins on tie. Each pattern is
// matched case-insensitively against the joined user-message text.
const PATTERNS: Array<{
  re: RegExp;
  specialty: Specialty;
  subspecialty?: Subspecialty;
}> = [
  // Psychiatry — subspecialty variants first
  { re: /\bwomen'?s\s+mental\s+health\b/i, specialty: "psychiatry", subspecialty: "womens-mental-health" },
  { re: /\bperinatal\s+(?:psychiatry|mental\s+health)\b/i, specialty: "psychiatry", subspecialty: "perinatal" },
  { re: /\bperimenopaus(?:e|al)\b/i, specialty: "psychiatry", subspecialty: "womens-mental-health" },
  { re: /\bchild\s+(?:and\s+)?adolescent\s+(?:psychiatry|psychiatrist)\b/i, specialty: "psychiatry", subspecialty: "child-adolescent" },
  { re: /\baddiction\s+(?:psychiatry|medicine)\b/i, specialty: "psychiatry", subspecialty: "addiction" },
  { re: /\bgeriatric\s+(?:psychiatry|psychiatrist)\b/i, specialty: "psychiatry", subspecialty: "geriatric" },
  { re: /\b(?:psychiatry|psychiatrist|psychiatric|telepsych)\b/i, specialty: "psychiatry" },

  // Therapy / counseling
  { re: /\b(?:LCSW|LMFT|LPCC|LPC|LMHC|LICSW)\b/, specialty: "therapy" },
  { re: /\b(?:psychotherap(?:y|ist)|talk\s+therapy|therapist)\b/i, specialty: "therapy" },

  // Primary care
  { re: /\b(?:primary\s+care|family\s+medicine|internal\s+medicine|family\s+practice|PCP)\b/i, specialty: "primary-care" },

  // Nutrition
  { re: /\b(?:registered\s+dietitian|dietitian|nutritionist|dietetic)\b/i, specialty: "nutrition" },

  // PT / OT
  { re: /\bphysical\s+therap(?:y|ist)\b/i, specialty: "physical-therapy" },
  { re: /\boccupational\s+therap(?:y|ist)\b/i, specialty: "occupational-therapy" },
];

/**
 * Infer specialty from arbitrary user text. Returns null when no pattern
 * matches with high confidence. Callers MUST treat the result as advisory —
 * the system prompts fall back to their generic behavior when null.
 */
export function detectSpecialty(userText: string): SpecialtyDetection | null {
  if (!userText) return null;
  const text = userText.length > 4000 ? userText.slice(0, 4000) : userText;
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      return {
        specialty: p.specialty,
        subspecialty: p.subspecialty,
        evidence: m[0],
      };
    }
  }
  return null;
}

/**
 * Human-readable specialty label for prompt insertion. Stable string the
 * LLM can anchor on. Never throws.
 */
export function formatSpecialty(d: SpecialtyDetection | null | undefined): string | null {
  if (!d) return null;
  const sub = d.subspecialty ? ` (${d.subspecialty.replace(/-/g, " ")})` : "";
  switch (d.specialty) {
    case "psychiatry":
      return `psychiatry${sub}`;
    case "therapy":
      return `psychotherapy / counseling${sub}`;
    case "primary-care":
      return `primary care${sub}`;
    case "nutrition":
      return `nutrition / dietetics${sub}`;
    case "physical-therapy":
      return `physical therapy${sub}`;
    case "occupational-therapy":
      return `occupational therapy${sub}`;
  }
}

/**
 * One-paragraph specialty-specific operational context for system-prompt
 * injection. Keeps the LLM anchored on the actual decision surfaces a
 * solo practitioner in that specialty faces. Each entry is curated by
 * hand from real practice taxonomy; do not auto-generate.
 */
export function specialtyContext(d: SpecialtyDetection | null | undefined): string | null {
  if (!d) return null;
  const sub = d.subspecialty;

  switch (d.specialty) {
    case "psychiatry": {
      const subFragment =
        sub === "womens-mental-health"
          ? "Perinatal mood, perimenopause, postpartum anxiety, trauma; OB-Gyn collaboration is common; lactation-safe Rx is a recurring constraint."
          : sub === "perinatal"
          ? "Pregnancy + postpartum mood, lactation-compatible regimens, urgent-triage protocols (suicidality during the perinatal window)."
          : sub === "child-adolescent"
          ? "School-day scheduling, parent-portal communication, mandated reporter exposure, age-banded telehealth limits."
          : sub === "addiction"
          ? "Controlled-substance prescribing (buprenorphine X-waiver), state PDMP checks, induction visits, contingency-management workflows."
          : sub === "geriatric"
          ? "Polypharmacy review, caregiver triangulation, slower telehealth onboarding, Medicare billing nuance."
          : "Variable subspecialty mix; treat as solo outpatient psychiatry by default.";
      return [
        `The practitioner is a SOLO PSYCHIATRIST.`,
        subFragment,
        `Operational realities to anchor questions on:`,
        `- EHR / scheduling: SimplePractice, Osmind, Headway, Alma, Charm, Practice Fusion, DrChrono — name explicitly.`,
        `- Billing model: in-network vs out-of-network ratio, superbill-only, panel-contract obligations.`,
        `- Patient flow: weekly intake volume, no-show / late-cancel rate, telepsych vs in-person share.`,
        `- Compliance: HIPAA-trained VA sourcing, e-prescribing controlled substances (EPCS), state-PDMP integration, audit trail expectations.`,
        `- Scheduling rhythm: 50-min sessions, 30-min med-management slots, urgent-triage carve-outs.`,
        `Generic small-business framing (runway, delegation comfort, growth horizon) is acceptable as background but MUST NOT replace specialty-specific questions.`,
      ].join("\n");
    }
    case "therapy":
      return [
        `The practitioner is a SOLO PSYCHOTHERAPIST (LCSW/LMFT/LPCC/LPC).`,
        `Operational realities to anchor questions on:`,
        `- EHR / scheduling: SimplePractice, TheraNest, Headway, Alma, Sondermind, Grow Therapy.`,
        `- Billing model: self-pay vs in-network panels (often 1-3 panels max), session-rate norms by region.`,
        `- Patient flow: weekly clinical hours (caseload caps are tighter than psychiatry), late-cancel policy, telehealth share.`,
        `- Compliance: HIPAA, mandated reporter exposure, state telehealth licensure boundaries.`,
        `- No prescribing — do NOT ask about EPCS, PDMP, or controlled substances.`,
      ].join("\n");
    case "primary-care":
      return [
        `The practitioner is a SOLO PRIMARY-CARE PHYSICIAN (family or internal medicine).`,
        `- EHR: Athenahealth, eClinicalWorks, Practice Fusion, Elation, DrChrono.`,
        `- Insurance: typically heavy in-network mix; capitation/value-based contracts may apply.`,
        `- Workflow: high message volume, prior-auth load, lab/imaging follow-up, refill ladder, MIPS reporting.`,
        `- Compliance: HIPAA + meaningful-use attestations + immunization-registry reporting.`,
      ].join("\n");
    case "nutrition":
      return [
        `The practitioner is a SOLO REGISTERED DIETITIAN.`,
        `- EHR / scheduling: Practice Better, Healthie, SimplePractice.`,
        `- Billing: often self-pay; medical-nutrition-therapy CPT codes (97802/97803) when in-network.`,
        `- Workflow: meal-plan delivery, food-log review, async messaging > sessions, package-based offerings.`,
      ].join("\n");
    case "physical-therapy":
    case "occupational-therapy":
      return [
        `The practitioner is a SOLO ${d.specialty === "physical-therapy" ? "PHYSICAL" : "OCCUPATIONAL"} THERAPIST.`,
        `- EHR / scheduling: WebPT, Jane App, ClinicSource, Practice Perfect.`,
        `- Billing: heavy insurance + Medicare; CPT 97110/97140/97530 (PT) or 97165/97166 (OT eval).`,
        `- Workflow: home-exercise-program delivery, progress-note compliance, plan-of-care re-cert cadence.`,
      ].join("\n");
  }
}
