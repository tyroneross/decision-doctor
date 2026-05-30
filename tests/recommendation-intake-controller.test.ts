import { describe, expect, it } from "vitest";
import {
  challengeAssumption,
  finalize,
  ingestAnswer,
  nextStep,
} from "@/lib/engine/recommendation-intake/controller";

const challenge =
  "Prior authorization paperwork eats every Monday morning and slows down new referrals.";

describe("recommendation adaptive intake controller", () => {
  it("asks only high-leverage scoring questions, infers safe defaults, then finalizes", async () => {
    const first = await nextStep({
      challengeText: challenge,
      painPath: "admin",
    });

    expect(first.action).toBe("ask");
    if (first.action !== "ask") throw new Error("expected ask");
    expect(first.question.topic).toBe("frequency");

    const afterFrequency = ingestAnswer({
      state: first.state,
      question: first.question,
      display: "Several times a week",
      raw: "0.75",
    });

    const second = await nextStep({ state: afterFrequency });
    expect(second.action).toBe("ask");
    if (second.action !== "ask") throw new Error("expected ask");
    expect(second.question.topic).toBe("time_burden");

    const afterTime = ingestAnswer({
      state: second.state,
      question: second.question,
      display: "1 to 3 hours",
      raw: "0.75",
    });

    const third = await nextStep({ state: afterTime });
    expect(third.action).toBe("ask");
    if (third.action !== "ask") throw new Error("expected ask");
    expect(third.question.topic).toBe("pain_severity");

    const afterSeverity = ingestAnswer({
      state: third.state,
      question: third.question,
      display: "Serious bottleneck",
      raw: "1",
    });

    const inferred = await nextStep({ state: afterSeverity });
    expect(inferred.action).toBe("infer");
    if (inferred.action !== "infer") throw new Error("expected infer");
    expect(inferred.defaults.map((d) => d.topic)).toEqual(
      expect.arrayContaining([
        "goal",
        "risk_tolerance",
        "ai_comfort",
        "data_readiness",
      ]),
    );

    const done = await nextStep({ state: inferred.state });
    expect(done.action).toBe("done");
    if (done.action !== "done") throw new Error("expected done");
    expect(done.recommendationInput).toMatchObject({
      painPath: "admin",
      challengeText: challenge,
      scoringInput: {
        frequency: 0.75,
        timeBurden: 0.75,
        painSeverity: 1,
        riskTolerance: 0.4,
        aiComfort: 0.5,
        dataReadiness: 0.5,
      },
    });
  });

  it("does not ask the same topic twice after an answer is ingested", async () => {
    const first = await nextStep({
      challengeText: challenge,
      painPath: "admin",
    });
    if (first.action !== "ask") throw new Error("expected ask");

    const state = ingestAnswer({
      state: first.state,
      question: first.question,
      display: "Weekly",
      raw: "0.5",
    });

    const next = await nextStep({ state });
    expect(next.action).toBe("ask");
    if (next.action !== "ask") throw new Error("expected ask");
    expect(next.question.topic).not.toBe(first.question.topic);
  });

  it("finalize provides stable scorer defaults for any skipped fields", () => {
    const recommendationInput = finalize({
      state: {
        challengeText: challenge,
        painPath: "admin",
        scoringInput: { frequency: 1 },
        answers: [],
        assumptions: [],
        askedTopics: [],
        filledPaths: ["painPath", "scoringInput.frequency"],
        challengedTopics: [],
        questionCount: 0,
        routingDeclined: false,
      },
    });

    expect(recommendationInput.scoringInput).toMatchObject({
      frequency: 1,
      painSeverity: 0.7,
      timeBurden: 0.6,
      riskTolerance: 0.4,
      aiComfort: 0.5,
      dataReadiness: 0.5,
    });
  });
});

describe("intake questions carry a muted example (harvest #2)", () => {
  it("every asked question includes an example within the 140-char cap", async () => {
    // Walk the full ask sequence and assert each emitted question carries a
    // bounded, non-empty example string.
    let step = await nextStep({
      challengeText:
        "Prior authorization paperwork eats every Monday morning and slows down new referrals.",
    });
    let asked = 0;
    while (step.action === "ask" && asked < 12) {
      expect(typeof step.question.example).toBe("string");
      expect(step.question.example!.length).toBeGreaterThan(0);
      expect(step.question.example!.length).toBeLessThanOrEqual(140);
      const next = ingestAnswer({
        state: step.state,
        question: step.question,
        display: step.question.widget.kind === "chips"
          ? step.question.widget.options[0]!.label
          : "1",
        raw: step.question.widget.kind === "chips"
          ? step.question.widget.options[0]!.value
          : "1",
      });
      step = await nextStep({ state: next });
      asked += 1;
    }
    expect(asked).toBeGreaterThan(0);
  });

  it("rejects an example longer than 140 chars at the schema layer", async () => {
    const { RecommendationIntakeQuestionSchema } = await import(
      "@/shared/schema"
    );
    const tooLong = "x".repeat(141);
    const result = RecommendationIntakeQuestionSchema.safeParse({
      id: "q1",
      topic: "frequency",
      prompt: "p",
      example: tooLong,
      widget: {
        kind: "chips",
        fieldId: "frequency",
        label: "L",
        options: [{ value: "0.5", label: "Weekly" }],
      },
      fills: { path: "scoringInput.frequency", kind: "number", mergeStrategy: "replace" },
      blockingScore: { topic: "frequency", blocking: 1, decision: "ask", reason: "r" },
    });
    expect(result.success).toBe(false);
  });
});

describe("challengeAssumption re-opens an inferred topic (harvest #1)", () => {
  it("moves a challenged assumption back into the ask queue", async () => {
    // Answer every asked question until the controller switches to `infer`.
    let step = await nextStep({
      challengeText:
        "Prior authorization paperwork eats every Monday morning and slows down new referrals.",
      painPath: "admin",
    });
    let guard = 0;
    while (step.action === "ask" && guard < 12) {
      const next = ingestAnswer({
        state: step.state,
        question: step.question,
        display:
          step.question.widget.kind === "chips"
            ? step.question.widget.options[0]!.label
            : "1",
        raw:
          step.question.widget.kind === "chips"
            ? step.question.widget.options[0]!.value
            : "1",
      });
      step = await nextStep({ state: next });
      guard += 1;
    }

    expect(step.action).toBe("infer");
    if (step.action !== "infer") throw new Error("expected infer");
    const target = step.defaults[0]!;
    expect(step.state.assumptions.some((a) => a.topic === target.topic)).toBe(
      true,
    );

    const reopened = challengeAssumption({
      state: step.state,
      challengeTopic: target.topic,
    });

    // Assumption gone, topic no longer marked asked, path cleared.
    expect(reopened.assumptions.some((a) => a.topic === target.topic)).toBe(
      false,
    );
    expect(reopened.askedTopics.includes(target.topic)).toBe(false);
    expect(reopened.filledPaths.includes(target.path)).toBe(false);

    // Next pass surfaces the challenged topic as an explicit question.
    const after = await nextStep({ state: reopened });
    expect(after.action).toBe("ask");
    if (after.action !== "ask") throw new Error("expected ask after challenge");
    expect(after.question.topic).toBe(target.topic);
  });
});
