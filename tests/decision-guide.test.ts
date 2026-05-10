import { describe, expect, it } from "vitest";
import { guideDecisionQuestion } from "../lib/decision-guide";

describe("decision question guide", () => {
  it("guides a new-to-AI capacity user into the capacity intake", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "new_to_ai",
      question:
        "I am exhausted and my waitlist keeps growing. Should I keep accepting new intakes?",
    });

    expect(result.status).toBe("ready");
    expect(result.templateId).toBe("capacity");
    expect(result.startPath).toBe("/app/decisions/new/capacity");
    expect(result.plainAnswer).toMatch(/business questions/i);
    expect(result.nextQuestions.map((item) => item.fieldId)).toContain(
      "weeklyVisitCount",
    );
    expect(result.primaryQuestion?.chips).toContain("24-32");
    expect(result.inferredAssumptions[0]?.topic).toBe("Primary risk");
    expect(result.framework.methods.join(" ")).toMatch(/minimax-regret/i);
    expect(result.framework.aiWorkflowIdeas[0]?.title).toMatch(/Waitlist/i);
  });

  it("guides a comfortable user with pricing language into pricing", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "comfortable",
      question:
        "Should I raise my fee or keep prices stable while I still take insurance?",
    });

    expect(result.status).toBe("ready");
    expect(result.templateId).toBe("pricing");
    expect(result.plainAnswer).toMatch(/tradeoff/i);
    expect(result.nextQuestions.map((item) => item.fieldId)).toContain(
      "currentFee",
    );
    expect(result.progressLabel).toBe("1 of 3 intake anchors");
    expect(result.framework.criteria.map((item) => item.id)).toContain(
      "retention_risk",
    );
  });

  it("guides an advanced user with delegation language into admin hire", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "advanced",
      question:
        "I spend 12 hours a week on calls and billing. Should I hire admin help or automate first?",
    });

    expect(result.status).toBe("ready");
    expect(result.templateId).toBe("admin-hire");
    expect(result.plainAnswer).toMatch(/decision model/i);
    expect(result.simpleSteps.join(" ")).toMatch(/method trace/i);
    expect(result.framework.decisionType).toBe("GDD");
    expect(result.framework.aiWorkflowIdeas.map((item) => item.title)).toContain(
      "Admin SOP generator",
    );
  });

  it("builds a custom framework when the decision area is unclear", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "new_to_ai",
      question: "I need help deciding what to do next this week.",
    });

    expect(result.status).toBe("ready");
    expect(result.templateId).toBeUndefined();
    expect(result.framework.name).toBe("Custom practice decision framework");
    expect(result.primaryQuestion?.chips).toContain("Capacity returned");
    expect(result.chat.quickReplies.length).toBeGreaterThanOrEqual(3);
    expect(result.alternatives.map((item) => item.templateId).sort()).toEqual([
      "admin-hire",
      "capacity",
      "pricing",
    ]);
  });

  it("creates an AI workflow framework for non-template automation questions", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "comfortable",
      question:
        "Where should I start using AI to reduce follow-up work and free two hours each week?",
    });

    expect(result.status).toBe("ready");
    expect(result.templateId).toBeUndefined();
    expect(result.framework.name).toBe("AI workflow opportunity framework");
    expect(result.framework.decisionType).toBe("EDD");
    expect(result.framework.methods.join(" ")).toMatch(/RGT-style/i);
    expect(result.framework.aiWorkflowIdeas.map((item) => item.title)).toContain(
      "Workflow triage prompt",
    );
  });

  it("rejects PHI-shaped questions before template guidance", () => {
    const result = guideDecisionQuestion({
      aiMaturity: "comfortable",
      question: "Should I call Jane Smith before deciding about my schedule?",
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.plainAnswer).toMatch(/Remove patient/i);
    expect(result.safetyNotes[0]).toMatch(/PHI-shaped/i);
  });
});
