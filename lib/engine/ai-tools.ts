// AI-leverage tool catalog — the candidate set the engine ranks against.
// Source: .build-loop/decisions/2026-05-10-research-digest.md §D
// (validated against solo-healthcare-practitioner consulting heuristics).
//
// This catalog REPLACES the v1 candidate-set-per-template approach.
// Every recommendation the engine produces names one or more of these tools.

import "server-only";

export type WorkflowArea =
  | "clinical_notes"        // SOAP, charting, dictation
  | "patient_comms"         // messaging, FAQ, reminders
  | "scheduling"            // booking, no-show, reminders
  | "billing"               // claims, denials, prior-auth
  | "admin_ops"             // intake docs, policies, vendor calls
  | "personal_ai"           // generic prompts, copy drafting
  | "human_help";           // a person, not a tool

export type Specialty =
  | "psychiatry"
  | "therapy"               // LMFT / LCSW
  | "primary_care"
  | "pediatrics"
  | "physical_therapy"
  | "nutrition"
  | "any";                  // applies regardless

export type HipaaPosture =
  | "baa_required"          // tool MUST have a BAA before any PHI touches it
  | "deidentify_then_use"   // tool is fine for non-PHI; deidentify before paste
  | "no_phi_allowed"        // tool should never see PHI of any kind
  | "no_phi_relevant";      // workflow doesn't touch PHI (admin / vendor)

export interface AiTool {
  id: string;                // stable id (used in DecisionOutput.recommendation)
  name: string;              // user-facing display name
  url?: string;              // canonical product URL
  area: WorkflowArea;
  replaces: string;          // 1-line — the workflow this tool replaces
  hrPerWeekSavedRange: [number, number];
  setupDays: number;         // typical days from "decide to deploy" → "actually using"
  monthlyCostRange: [number, number]; // USD
  hipaa: HipaaPosture;
  fitsSpecialty: Specialty[]; // empty = "any"; specific list = constrained
  defaultRecommend: WorkflowArea[]; // workflow areas where this tool is a default-recommend
  warnings?: string[];        // surfaced in the recommendation card
  // Setup playbook — the "what to do next" steps shown to the user
  // post-recommendation. Short, actionable, sequenced.
  setupSteps: string[];
  // Paste-ready prompt template for tools that are LLM-prompt-driven.
  // Variable substitutions: {practitioner} = "psychiatrist" / "physical therapist" etc.
  // {hours} = current weekly hours, {patients} = panel size, etc. Filled by Stage 5.
  promptTemplate?: string;
}

// ---------------------------------------------------------------------------
// The 12-tool master catalog
// ---------------------------------------------------------------------------

export const AI_TOOLS: AiTool[] = [
  {
    id: "ai_scribe_baa",
    name: "AI clinical scribe (Heidi / Freed / Nuance DAX / Abridge)",
    url: "https://www.heidihealth.com",
    area: "clinical_notes",
    replaces: "Manually authoring SOAP / progress notes after every visit",
    hrPerWeekSavedRange: [5, 10],
    setupDays: 2,
    monthlyCostRange: [99, 200],
    hipaa: "baa_required",
    fitsSpecialty: ["primary_care", "pediatrics", "physical_therapy", "psychiatry"],
    defaultRecommend: ["clinical_notes"],
    warnings: ["Sign the BAA before turning microphone on for the first patient. Verify the product's BAA covers your jurisdiction."],
    setupSteps: [
      "Pick one of the 4 vendors (Heidi has the simplest free trial in 2026)",
      "Sign the BAA — required before any patient visit",
      "Run 3 supervised visits to tune note format to your style",
      "Decide on note retention policy — most clinicians delete the audio after 24h",
    ],
  },
  {
    id: "non_clinical_transcription",
    name: "Otter.ai or Granola for non-clinical meetings",
    url: "https://otter.ai",
    area: "admin_ops",
    replaces: "Manual note-taking on referral calls, vendor calls, supervision",
    hrPerWeekSavedRange: [1, 3],
    setupDays: 1,
    monthlyCostRange: [10, 30],
    hipaa: "no_phi_allowed",
    fitsSpecialty: ["any"],
    defaultRecommend: ["admin_ops"],
    warnings: ["Never on a patient-facing visit without a BAA — use the AI scribe option (above) for clinical work."],
    setupSteps: [
      "Sign up; install desktop + phone apps",
      "Calendar-connect so meetings record automatically when joined",
      "Set retention policy — delete recordings after 30 days unless tagged keep",
    ],
  },
  {
    id: "patient_comms_prompt_lib",
    name: "Claude / ChatGPT prompt library for patient comms",
    url: "https://claude.ai",
    area: "patient_comms",
    replaces: "Re-writing the same email or appointment-confirmation 30x/week",
    hrPerWeekSavedRange: [1, 2],
    setupDays: 1,
    monthlyCostRange: [0, 25],
    hipaa: "no_phi_allowed",
    fitsSpecialty: ["any"],
    defaultRecommend: ["patient_comms", "admin_ops"],
    setupSteps: [
      "Open a notes file titled 'Patient comms prompts'",
      "Add 3-5 templates for the messages you send most often (rate change, intake confirmation, no-show follow-up)",
      "Paste each template into Claude/ChatGPT once to generate variants you can keep",
      "Bookmark the file — refer back when drafting",
    ],
    promptTemplate: `Write a short, warm message I can send to my patients about [SUBJECT]. Tone: calm, professional, no exclamation points. 4 sentences max. Do NOT include any patient names or details.`,
  },
  {
    id: "scheduling_stack",
    name: "Acuity / Cal.com + Stripe + automated reminders",
    url: "https://acuityscheduling.com",
    area: "scheduling",
    replaces: "Manual booking, reminder calls, no-show enforcement",
    hrPerWeekSavedRange: [2, 4],
    setupDays: 3,
    monthlyCostRange: [16, 60],
    hipaa: "deidentify_then_use",
    fitsSpecialty: ["any"],
    defaultRecommend: ["scheduling"],
    setupSteps: [
      "Sign up for Acuity (Pro tier) or Cal.com",
      "Connect Stripe for the no-show fee + deposit",
      "Configure 24h reminder + 2h reminder texts",
      "Set the cancellation policy + late-fee inside the scheduler",
      "Embed the booking link on your website",
    ],
  },
  {
    id: "stack_glue_zapier",
    name: "Zapier / Make for stack glue",
    url: "https://zapier.com",
    area: "admin_ops",
    replaces: "Manual transcribing of new bookings into the EHR; manual receipts; manual no-show charges",
    hrPerWeekSavedRange: [1, 3],
    setupDays: 2,
    monthlyCostRange: [30, 50],
    hipaa: "deidentify_then_use",
    fitsSpecialty: ["any"],
    defaultRecommend: [],
    warnings: ["Only useful when your scheduler / EHR has an API. Skip for paper-heavy practices."],
    setupSteps: [
      "Map the 1-2 most repetitive transcribe-from-A-to-B tasks you do",
      "Build one Zap (e.g. 'New Acuity booking → row in Google Sheets → Stripe receipt')",
      "Test with 5 fake bookings before going live",
    ],
  },
  {
    id: "billing_automation",
    name: "SimplePractice / Headway / Alma billing automation",
    url: "https://simplepractice.com",
    area: "billing",
    replaces: "Manual claim submission + denial follow-up",
    hrPerWeekSavedRange: [3, 6],
    setupDays: 7,
    monthlyCostRange: [69, 200],
    hipaa: "baa_required",
    fitsSpecialty: ["psychiatry", "therapy", "primary_care", "pediatrics", "physical_therapy"],
    defaultRecommend: ["billing"],
    warnings: ["Insurance-paneled practices only. Cash-pay practices get little ROI."],
    setupSteps: [
      "Pick the platform that supports YOUR payer mix (Headway/Alma for psych; SimplePractice broadly)",
      "Migrate your current patient roster + payer info",
      "Run 1 week in parallel with old system to catch claim denials",
    ],
  },
  {
    id: "secure_messaging",
    name: "Spruce / OhMD secure messaging + AI replies",
    url: "https://sprucehealth.com",
    area: "patient_comms",
    replaces: "Phone tag, repeated FAQs (when's my next appt, do you take Aetna)",
    hrPerWeekSavedRange: [2, 4],
    setupDays: 2,
    monthlyCostRange: [30, 80],
    hipaa: "baa_required",
    fitsSpecialty: ["any"],
    defaultRecommend: ["patient_comms"],
    setupSteps: [
      "Sign up + sign the BAA",
      "Set up auto-replies for your top 5 FAQs",
      "Train staff (or yourself) on triage rules — what gets a same-day reply vs next-day",
    ],
  },
  {
    id: "voice_to_ehr",
    name: "Voice-to-EHR dictation (Apple/Google native + AI scribe)",
    area: "clinical_notes",
    replaces: "Typing notes between visits",
    hrPerWeekSavedRange: [2, 4],
    setupDays: 1,
    monthlyCostRange: [0, 30],
    hipaa: "baa_required",
    fitsSpecialty: ["primary_care", "pediatrics", "physical_therapy"],
    defaultRecommend: [],
    warnings: ["Pairs well with the AI scribe option. If you have the AI scribe, this is redundant."],
    setupSteps: [
      "Enable native dictation in your EHR's text fields",
      "Calibrate the medical-vocabulary dictionary (most EHRs ship with one)",
      "Practice 10 minutes a day for a week — accuracy doubles",
    ],
  },
  {
    id: "prior_auth_drafting",
    name: "Claude/ChatGPT for insurance prior-auth letter drafting",
    area: "billing",
    replaces: "Hand-writing prior-auth justification letters",
    hrPerWeekSavedRange: [1, 2],
    setupDays: 1,
    monthlyCostRange: [0, 20],
    hipaa: "deidentify_then_use",
    fitsSpecialty: ["psychiatry", "physical_therapy", "primary_care"],
    defaultRecommend: ["billing"],
    warnings: ["Strip patient name, DOB, MRN BEFORE pasting case details. Use 'Patient is a [age]yo with [condition]' format."],
    setupSteps: [
      "Save a Claude/ChatGPT bookmark titled 'Prior-auth drafts'",
      "Build the prompt template (below) once and reuse",
      "Always deidentify before paste",
    ],
    promptTemplate: `Draft a prior-authorization justification letter for [SERVICE] for a deidentified patient with the following clinical picture: [DEIDENTIFIED CASE]. Cite typical insurance criteria for medical necessity. 3 paragraphs.`,
  },
  {
    id: "intake_doc_generator",
    name: "AI-drafted patient onboarding / intake docs",
    area: "admin_ops",
    replaces: "Maintaining policies, intake forms, NSA disclosures by hand",
    hrPerWeekSavedRange: [0.5, 1],
    setupDays: 1,
    monthlyCostRange: [0, 20],
    hipaa: "no_phi_allowed",
    fitsSpecialty: ["any"],
    defaultRecommend: ["admin_ops"],
    setupSteps: [
      "List the 5-10 patient-facing documents you maintain",
      "Generate first drafts in Claude/ChatGPT using your existing language as input",
      "Review with your malpractice carrier before publishing",
    ],
    promptTemplate: `Draft a [DOC TYPE] for a solo [PRACTITIONER TYPE] practice. Tone: warm, professional, plain English at 8th-grade reading level. Include: [REQUIRED FIELDS]. Length: 1 page.`,
  },
  {
    id: "explainer_video_loom",
    name: "Loom / Tella + AI summary for repeat patient explanations",
    url: "https://loom.com",
    area: "patient_comms",
    replaces: "Repeating the same 5-minute explanation 20x/week (med ed, prep, post-visit instructions)",
    hrPerWeekSavedRange: [1, 2],
    setupDays: 2,
    monthlyCostRange: [0, 15],
    hipaa: "no_phi_relevant",
    fitsSpecialty: ["psychiatry", "pediatrics", "primary_care"],
    defaultRecommend: [],
    setupSteps: [
      "Pick the 3 explanations you give most often (e.g. 'how to take this med', 'what to expect for the procedure')",
      "Record one 3-5 min Loom for each. Don't perfect them — done is better than polished",
      "Share the link in your patient-comms templates",
    ],
  },
  {
    id: "hipaa_va_service",
    name: "HIPAA-compliant VA service (HelloRache / MEDVA / Hello Mira)",
    url: "https://hellorache.com",
    area: "human_help",
    replaces: "In-house admin hire (or your own admin time)",
    hrPerWeekSavedRange: [5, 15],
    setupDays: 14,
    monthlyCostRange: [800, 2400],
    hipaa: "baa_required",
    fitsSpecialty: ["any"],
    defaultRecommend: ["admin_ops"],
    warnings: ["Bigger commitment than the other options. Right answer when you've already automated everything you can and STILL need 8+ more hours."],
    setupSteps: [
      "Audit which 8-15 hr/wk of admin you actually want a person doing (vs. automating)",
      "Pick the service that supports your time zone",
      "Sign the BAA + run a 30-day trial with one VA",
      "Build a written SOP for the 3-5 tasks they own",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper queries
// ---------------------------------------------------------------------------

export function toolsByArea(area: WorkflowArea): AiTool[] {
  return AI_TOOLS.filter((t) => t.area === area);
}

export function defaultsForArea(area: WorkflowArea): AiTool[] {
  return AI_TOOLS.filter((t) => t.defaultRecommend.includes(area));
}

export function toolsByHipaaPosture(posture: HipaaPosture): AiTool[] {
  return AI_TOOLS.filter((t) => t.hipaa === posture);
}

export function fitsSpecialty(tool: AiTool, specialty: Specialty | null): boolean {
  if (!specialty || specialty === "any") return true;
  if (tool.fitsSpecialty.length === 0) return true;
  if (tool.fitsSpecialty.includes("any")) return true;
  return tool.fitsSpecialty.includes(specialty);
}

export function getToolById(id: string): AiTool | undefined {
  return AI_TOOLS.find((t) => t.id === id);
}

// Average value used by the engine for ranking.
export function avgHrPerWeekSaved(tool: AiTool): number {
  const [lo, hi] = tool.hrPerWeekSavedRange;
  return (lo + hi) / 2;
}

export function avgMonthlyCost(tool: AiTool): number {
  const [lo, hi] = tool.monthlyCostRange;
  return (lo + hi) / 2;
}
