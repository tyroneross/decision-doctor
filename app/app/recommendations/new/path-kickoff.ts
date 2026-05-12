import type { PainPathId } from "@/lib/engine/types";

export interface PathKickoffArtifact {
  kind: "Prompt" | "Checklist" | "Skill" | "Plugin";
  title: string;
  description: string;
}

export interface PathKickoff {
  label: string;
  headline: string;
  summary: string;
  firstAdvice: string[];
  artifacts: PathKickoffArtifact[];
  infoNeeded: string[];
  seedChallenge: string;
  detailPlaceholder: string;
  requiresDetail?: boolean;
}

export const PATH_KICKOFFS: Record<PainPathId, PathKickoff> = {
  referrals: {
    label: "Referral network",
    headline: "Start by separating source quality from follow-up work.",
    summary:
      "Aida can help rank referral sources, draft outreach, and keep the follow-up loop from depending on memory.",
    firstAdvice: [
      "List the referral sources that send volume, the ones that send the right fit, and the ones that need follow-up.",
      "Automate the lowest-risk task first: source notes, outreach drafts, or reminder tracking.",
      "Keep patient identifiers out of the workflow; use source-level and task-level context only.",
    ],
    artifacts: [
      {
        kind: "Checklist",
        title: "Referral source scorecard",
        description: "Rank sources by volume, fit, responsiveness, and next action.",
      },
      {
        kind: "Prompt",
        title: "Outreach follow-up drafter",
        description: "Draft concise non-PHI follow-ups for sources you owe a response.",
      },
      {
        kind: "Skill",
        title: "Referral cadence tracker",
        description: "Turn weekly source updates into a repeatable review habit.",
      },
    ],
    infoNeeded: [
      "Referral volume per week",
      "What slips most often",
      "Which outreach channels you use",
    ],
    seedChallenge:
      "I want help growing or managing my referral network without using patient-identifiable information.",
    detailPlaceholder:
      "e.g. Referral follow-ups pile up by Friday, and I need a better way to prioritize who gets outreach first...",
  },
  research: {
    label: "Research tracking",
    headline: "Start with a digest queue, not an open-ended research habit.",
    summary:
      "Aida can help filter new research by specialty, rank what matters, and preserve evidence caveats before anything becomes advice.",
    firstAdvice: [
      "Pick the sources you trust before adding AI; noisy sources create noisy summaries.",
      "Separate awareness from action: not every paper deserves a workflow change.",
      "Require caveats, population fit, and confidence notes in every digest.",
    ],
    artifacts: [
      {
        kind: "Prompt",
        title: "Weekly evidence digest",
        description: "Summarize new papers with relevance, caveats, and actionability.",
      },
      {
        kind: "Checklist",
        title: "Evidence caveat checklist",
        description: "Check population, effect size, limitations, and practice relevance.",
      },
      {
        kind: "Skill",
        title: "Specialty review queue",
        description: "Maintain a repeatable queue for items worth reading closely.",
      },
    ],
    infoNeeded: [
      "Your specialty or focus area",
      "Trusted sources or journals",
      "How often you want a digest",
    ],
    seedChallenge:
      "I want help keeping up with research in my specialty and separating useful updates from noise.",
    detailPlaceholder:
      "e.g. I need a weekly psychiatry digest that flags practice-relevant updates without overstating weak evidence...",
  },
  admin: {
    label: "Administrative overload",
    headline: "Start by splitting requests into triage, drafting, and checklist work.",
    summary:
      "Aida can help identify the repetitive admin task that is safe to standardize first, then turn it into a prompt, checklist, skill, or plugin.",
    firstAdvice: [
      "Choose one recurring request type before trying to clean up the whole admin pile.",
      "Use AI for routing, summaries, and drafts; keep clinical judgment and final sending with a human.",
      "Measure the current weekly time burden so the recommendation can rank effort against payoff.",
    ],
    artifacts: [
      {
        kind: "Prompt",
        title: "Request triage prompt",
        description: "Sort incoming admin work by owner, urgency, and next action.",
      },
      {
        kind: "Skill",
        title: "Patient message draft batcher",
        description: "Create non-PHI reply drafts for common scheduling and billing patterns.",
      },
      {
        kind: "Plugin",
        title: "Admin task tracker",
        description: "Track recurring admin load and estimate time saved week over week.",
      },
    ],
    infoNeeded: [
      "The request type that repeats most",
      "How often it shows up",
      "What tools already hold the work",
    ],
    seedChallenge:
      "I want to reduce administrative overload in my practice without putting patient-identifiable information into AI tools.",
    detailPlaceholder:
      "e.g. Prior authorization paperwork eats every Monday morning, and I need a safer triage and drafting workflow...",
  },
  capacity_growth: {
    label: "Capacity, pricing, or growth",
    headline: "Start by separating the constraint from the growth decision.",
    summary:
      "Aida can help compare capacity, pricing, waitlist, and workload tradeoffs before you commit to a change.",
    firstAdvice: [
      "Name the limiting factor first: open slots, admin time, demand, pricing, or follow-through.",
      "Run a small sensitivity check before changing rates, panels, or service lines.",
      "Pair every growth move with a workload guardrail so more demand does not create a new bottleneck.",
    ],
    artifacts: [
      {
        kind: "Prompt",
        title: "Capacity tradeoff calculator",
        description: "Compare slots, hours, demand, and workload before changing the plan.",
      },
      {
        kind: "Skill",
        title: "Rate-change patient notice",
        description: "Draft clear non-clinical communication for pricing changes.",
      },
      {
        kind: "Plugin",
        title: "Waitlist tier tracker",
        description: "Keep weekly capacity and waitlist movement visible.",
      },
    ],
    infoNeeded: [
      "Current weekly clinical hours",
      "Demand or waitlist pressure",
      "The decision you are considering",
    ],
    seedChallenge:
      "I want help planning capacity, pricing, or growth while understanding workload tradeoffs.",
    detailPlaceholder:
      "e.g. I am near capacity and need to decide whether to raise rates, add hours, or manage a waitlist differently...",
  },
  follow_up: {
    label: "Follow-up consistency",
    headline: "Start by defining what counts as unresolved.",
    summary:
      "Aida can help categorize follow-ups, create reminders, and turn loose tasks into a reviewable queue.",
    firstAdvice: [
      "Group follow-ups by due date, owner, and consequence if missed.",
      "Automate reminders and drafts before automating any action that reaches a patient.",
      "Define the weekly review moment; a tool without a review habit still leaks work.",
    ],
    artifacts: [
      {
        kind: "Checklist",
        title: "Unresolved task review",
        description: "A short weekly pass over open follow-ups and blocked items.",
      },
      {
        kind: "Skill",
        title: "Follow-up reminder categories",
        description: "Convert loose notes into categories, owners, and next actions.",
      },
      {
        kind: "Plugin",
        title: "Callback tracker",
        description: "Track follow-up status and surface overdue work.",
      },
    ],
    infoNeeded: [
      "Which follow-ups get missed",
      "How you track them today",
      "How often you review open loops",
    ],
    seedChallenge:
      "I want to improve follow-up consistency and catch unresolved tasks before they slip.",
    detailPlaceholder:
      "e.g. Lab callbacks and referral follow-ups get scattered across notes, inboxes, and memory...",
  },
  custom: {
    label: "Custom challenge",
    headline: "Start with the workflow shape, then Aida will classify it.",
    summary:
      "Aida can still provide a recommendation if the pain does not fit a preset path, but it needs a concrete workflow description.",
    firstAdvice: [
      "Describe the repeating business or admin task, not a patient situation.",
      "Include frequency, rough time cost, and what goes wrong when it slips.",
      "Name the line AI should not cross, especially around PHI, clinical judgment, or external sending.",
    ],
    artifacts: [
      {
        kind: "Prompt",
        title: "Pain classifier prompt",
        description: "Convert a rough workflow description into the closest recommendation path.",
      },
      {
        kind: "Checklist",
        title: "Workflow boundary checklist",
        description: "Clarify data, risk, owner, and review boundaries before recommending.",
      },
      {
        kind: "Skill",
        title: "Custom starter skill blueprint",
        description: "Draft a narrow first-pass skill after the recommendation is known.",
      },
    ],
    infoNeeded: [
      "The repeating task",
      "How often it happens",
      "The boundary AI should not cross",
    ],
    seedChallenge:
      "I have a custom workflow challenge and want Aida to classify the best starting point.",
    detailPlaceholder:
      "e.g. Every week I lose time reconciling intake forms, scheduling notes, and unanswered messages...",
    requiresDetail: true,
  },
};
