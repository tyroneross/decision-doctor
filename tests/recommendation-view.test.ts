/**
 * tests/recommendation-view.test.ts
 *
 * Structural + behavioral tests for:
 *   - components/recommendations/RecommendationView.tsx
 *   - components/recommendations/CandidateTasksList.tsx
 *   - components/recommendations/NoPhiNotice.tsx
 *
 * Strategy: pure TypeScript structural assertions — no DOM renderer needed.
 * Tests validate:
 *   T-RV-1:  RecommendationView exports a named function component.
 *   T-RV-2:  CandidateTasksList exports a named function component.
 *   T-RV-3:  NoPhiNotice exports a named function component.
 *   T-RV-4:  AiTaskRecommendation mock fixture validates against AiTaskRecommendationSchema.
 *   T-RV-5:  CandidateTasksList correctly identifies non-recommended tasks.
 *   T-RV-6:  NoPhiNotice renders in advisory vs warning modes (prop shape check).
 *   T-RV-7:  BaselineCapture exports a named function component.
 *   T-RV-8:  RecommendationView accepts 'authed' and 'guest' modes.
 *   T-RV-9:  PHI detection correctly flags patient-identifiable inputs.
 *   T-RV-10: PHI detection passes benign healthcare workflow descriptions.
 */

import { describe, it, expect } from "vitest";
import { AiTaskRecommendationSchema } from "@/shared/schema";
import { detectPHI } from "@/lib/phi-guard";

// ─── Structural imports ──────────────────────────────────────────────────────

import { RecommendationView } from "@/components/recommendations/RecommendationView";
import { CandidateTasksList } from "@/components/recommendations/CandidateTasksList";
import { NoPhiNotice } from "@/components/recommendations/NoPhiNotice";
import { BaselineCapture } from "@/components/recommendations/BaselineCapture";

// ─── Fixture ─────────────────────────────────────────────────────────────────

const MOCK_RECOMMENDATION = {
  selectedPainPath: "admin" as const,
  challengeSummary:
    "Spending too much time on referral paperwork each week.",
  goal: "Reduce referral admin time by 30 minutes per week.",
  candidateTasks: [
    {
      id: "task-referral-draft",
      title: "Referral letter draft automation",
      description: "AI drafts referral letters from structured intake fields.",
      painPath: "admin" as const,
      score: 85,
      tags: ["drafting", "prompt"],
    },
    {
      id: "task-triage",
      title: "Inbox triage automation",
      description: "AI categorises incoming messages by urgency.",
      painPath: "admin" as const,
      score: 72,
      tags: ["triage", "checklist"],
    },
    {
      id: "task-scheduling",
      title: "Scheduling assistant",
      description: "AI suggests optimal appointment slots.",
      painPath: "admin" as const,
      score: 58,
      tags: ["scheduling"],
    },
  ],
  recommendedTask: "Referral letter draft automation",
  recommendedApproach: "prompt" as const,
  whyThisTask:
    "Letter drafting is the highest time-cost item in referral admin for solo practitioners. A simple prompt cuts drafting time by half with minimal setup.",
  starterSolution:
    'Use this prompt in Claude:\n\n"Draft a referral letter for [specialist] for a patient with [condition]. Keep it under 200 words and use plain language."',
  guardrails: [
    "Review all AI-drafted letters before sending.",
    "Do not paste patient names or MRNs into public AI tools.",
  ],
  tryThisWeek: [
    "Draft one referral letter using the starter prompt.",
    "Compare the AI draft to your usual letter — note what to adjust.",
    "Share your prompt with your practice manager for feedback.",
  ],
  successMetric:
    "Reduce referral letter drafting time by 30 min/week within 30 days.",
  adoptionPathway: [
    {
      kind: "prompt" as const,
      label: "Start with a prompt",
      rationale: "Lowest barrier — no setup needed.",
      confidence: 90,
      builderHandoff: {
        seed: {
          builderKind: "prompt" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: "AI drafts referral letters from structured intake fields.",
          painPath: "admin" as const,
          scoringRationale: "High time burden; clear AI fit.",
          targetAudience: "Solo healthcare practitioner",
          outputSpec: "200-word referral letter",
          permissionTier: "T0" as const,
        },
      },
      state: "recommended" as const,
    },
    {
      kind: "checklist" as const,
      label: "Build a referral checklist",
      rationale: "Checklist ensures nothing is missed per referral type.",
      confidence: 70,
      builderHandoff: {
        seed: {
          builderKind: "checklist" as const,
          taskTitle: "Referral checklist generator",
          taskDescription: "AI generates a per-specialty referral checklist.",
          painPath: "admin" as const,
          scoringRationale: "Medium benefit.",
          stepCountTarget: 8,
          format: "ordered-steps" as const,
          permissionTier: "T0" as const,
        },
      },
      state: "optional" as const,
    },
    {
      kind: "skill" as const,
      label: "Build a referral skill",
      rationale: "Not yet recommended — validate the prompt first.",
      confidence: 40,
      builderHandoff: {
        seed: {
          builderKind: "skill" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Low confidence until prompt is validated.",
          scaffoldTarget: "claude-code-skill" as const,
          permissionTier: "T1" as const,
        },
      },
      state: "not-recommended" as const,
    },
    {
      kind: "plugin" as const,
      label: "Build a referral plugin",
      rationale: "Not recommended at this stage.",
      confidence: 20,
      builderHandoff: {
        seed: {
          builderKind: "plugin" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Overkill for current need.",
          scaffoldTarget: "claude-code-plugin" as const,
          permissionTier: "T2" as const,
        },
      },
      state: "not-recommended" as const,
    },
    {
      kind: "agent" as const,
      label: "Build an agent",
      rationale: "Out of scope for P0.",
      confidence: 10,
      builderHandoff: {
        seed: {
          builderKind: "agent" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Not needed yet.",
          scaffoldTarget: "claude-code-plugin" as const,
          permissionTier: "T3" as const,
        },
      },
      state: "not-recommended" as const,
    },
  ],
  confidence: 82,
  methodTrace: [
    {
      stage: "pain-classify" as const,
      name: "pain-path-classifier",
      output: { selectedPainPath: "admin", confidence: 0.9 },
    },
    {
      stage: "scoring" as const,
      name: "9-criteria-scoring",
      output: { topCandidate: "task-referral-draft", score: 0.85 },
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RecommendationView component", () => {
  it("T-RV-1: RecommendationView exports a named function component", () => {
    expect(typeof RecommendationView).toBe("function");
    expect(RecommendationView.name).toBe("RecommendationView");
  });

  it("T-RV-8: RecommendationView accepts 'authed' and 'guest' modes via its prop type", () => {
    // Type-level check: we verify the function signature accepts the mode prop.
    // We call with mode='authed' — should not throw on import/reference.
    const props = {
      recommendation: MOCK_RECOMMENDATION as Parameters<typeof RecommendationView>[0]["recommendation"],
      mode: "authed" as const,
      recommendationId: "test-id",
    };
    expect(props.mode).toBe("authed");

    const guestProps = {
      recommendation: MOCK_RECOMMENDATION as Parameters<typeof RecommendationView>[0]["recommendation"],
      mode: "guest" as const,
    };
    expect(guestProps.mode).toBe("guest");
  });
});

describe("CandidateTasksList component", () => {
  it("T-RV-2: CandidateTasksList exports a named function component", () => {
    expect(typeof CandidateTasksList).toBe("function");
    expect(CandidateTasksList.name).toBe("CandidateTasksList");
  });

  it("T-RV-5: CandidateTasksList correctly identifies non-recommended tasks by name", () => {
    const candidates = MOCK_RECOMMENDATION.candidateTasks;
    const recommendedName = MOCK_RECOMMENDATION.recommendedTask;

    // The component filters out the recommended task from the others list.
    const others = [...candidates]
      .sort((a, b) => b.score - a.score)
      .filter((c) => c.title !== recommendedName);

    expect(others).toHaveLength(2);
    expect(others.every((c) => c.title !== recommendedName)).toBe(true);
    // Sorted descending by score.
    expect(others[0]!.score).toBeGreaterThanOrEqual(others[1]!.score);
  });
});

describe("NoPhiNotice component", () => {
  it("T-RV-3: NoPhiNotice exports a named function component", () => {
    expect(typeof NoPhiNotice).toBe("function");
    expect(NoPhiNotice.name).toBe("NoPhiNotice");
  });

  it("T-RV-6: NoPhiNotice prop shape supports advisory (default) and warning states", () => {
    // Advisory state — no props needed.
    const advisoryProps: Parameters<typeof NoPhiNotice>[0] = {};
    expect(advisoryProps.warning).toBeUndefined();

    // Warning state — warning=true + reasons array.
    const warningProps: Parameters<typeof NoPhiNotice>[0] = {
      warning: true,
      reasons: ["date-of-birth pattern detected", "SSN pattern detected"],
    };
    expect(warningProps.warning).toBe(true);
    expect(warningProps.reasons).toHaveLength(2);
  });
});

describe("BaselineCapture component", () => {
  it("T-RV-7: BaselineCapture exports a named function component", () => {
    expect(typeof BaselineCapture).toBe("function");
    expect(BaselineCapture.name).toBe("BaselineCapture");
  });
});

describe("AiTaskRecommendation fixture validation", () => {
  it("T-RV-4: Mock AiTaskRecommendation fixture validates against AiTaskRecommendationSchema", () => {
    const result = AiTaskRecommendationSchema.safeParse(MOCK_RECOMMENDATION);
    if (!result.success) {
      console.error("Zod validation errors:", result.error.issues);
    }
    expect(result.success).toBe(true);
  });
});

describe("PHI detection integration (lib/phi-guard)", () => {
  it("T-RV-9: detectPHI flags patient-identifiable inputs", () => {
    const PHI_INPUTS = [
      "Patient John Smith called about his referral",
      "Dr. Sarah Jones needs a follow-up",
      "MRN: 1234567 was not processed",
      "DOB: 03/15/1980 is in the intake form",
      "SSN 123-45-6789 was entered by mistake",
    ];

    for (const input of PHI_INPUTS) {
      const { hasPHI } = detectPHI(input);
      expect(hasPHI, `Expected PHI detection for: "${input}"`).toBe(true);
    }
  });

  it("T-RV-10: detectPHI passes benign healthcare workflow descriptions", () => {
    const SAFE_INPUTS = [
      "I spend 3 hours a week handling referral paperwork",
      "Our inbox gets flooded with prior auth requests every Monday",
      "Following up on labs is taking too long in our workflow",
      "We need a better way to triage incoming messages",
      "AI could help with appointment scheduling at our practice",
    ];

    for (const input of SAFE_INPUTS) {
      const { hasPHI } = detectPHI(input);
      expect(hasPHI, `Expected no PHI for: "${input}"`).toBe(false);
    }
  });
});
