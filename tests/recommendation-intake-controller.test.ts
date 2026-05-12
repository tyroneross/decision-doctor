import { describe, expect, it } from "vitest";
import {
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
        questionCount: 0,
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
