// PRD §6 (chat extension) — conversational front door.
// Single non-streaming endpoint. Two phases:
//   Phase A (status: "asking"): Groq picks the next question. Frontend appends to thread.
//   Phase B (status: "ready"): Groq has full intake; we call runDecision(); frontend renders.
//
// Server-side rate limit + audit just like /api/decisions.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { runDecision } from "@/lib/engine/orchestrator";
import { ClarifierWidgetSchema } from "@/lib/engine/clarifier";
import {
  runStage0Classifier,
  shouldDeclineAndReframe,
  isVdd,
  reframeMessageFor,
} from "@/lib/engine/stage0-classifier";
import {
  detectDecisionIntent,
  shouldOfferHelp,
  type DecisionDetection,
} from "@/lib/chat/decision-detector";
import {
  shouldFireDetector,
  deriveFlowState,
  type FlowState,
  type MessageForFlow,
} from "@/lib/chat/flow-state";
import { generateSurvey } from "@/lib/chat/survey-generator";
import { adaptSubmission } from "@/lib/chat/survey-adapter";
import { SurveySchema, SurveySubmissionSchema } from "@/lib/engine/survey";
import { runRecommendation } from "@/lib/engine/orchestrator";
import type { RecommendationInput } from "@/lib/engine/types";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_USER_ID, GUEST_TENANT_ID } from "@/lib/guest-identity";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, recommendations, auditEvents } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/ratelimit";
import { detectPHI } from "@/lib/phi-guard";
import {
  TemplateIdSchema,
  type DecisionInput,
  type DecisionOutput,
  type TemplateId,
} from "@/shared/schema";

export const runtime = "nodejs";

// Per-message metadata flags used for server-side FSM derivation.
// Only the BOOLEAN PRESENCE matters — actual widget contents stay
// client-side. These let the route compute deriveFlowState() over the
// message log and cross-check against the client's hint.
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
  /** Assistant emitted a clarifier widget on this message. */
  hasClarifier: z.boolean().optional(),
  /** Assistant emitted a survey card on this message. */
  hasSurvey: z.boolean().optional(),
  /** Assistant emitted an engine result with save-skill affordance. */
  hasSaveOffer: z.boolean().optional(),
  /** User has resolved the clarifier/survey/save on this message. */
  clarifierResolved: z.boolean().optional(),
  surveyResolved: z.boolean().optional(),
  saveSkillResolved: z.boolean().optional(),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  /**
   * E5 — Stay-with-original-question fallback. When `true`, the Stage-0
   * decline-and-reframe branch is skipped so the user's question runs
   * through the closest-fit engine pipeline anyway. Recorded in the
   * methodTrace so we can tell user-overridden runs from policy-aligned
   * runs in evals.
   */
  userOverrode: z.boolean().optional(),
  /**
   * Chat-flow FSM hint from the client. When provided, the route uses it
   * to gate the decision-intent detector — saves ~1 Groq call per turn
   * when the thread is already in a clarifier/survey/resolved flow. The
   * server doesn't see message-level affordance metadata, so the client
   * is the authoritative source for flow state.
   *
   * If absent (older client or unknown state), the route falls back to
   * the previous behavior: fire the detector on every turn.
   */
  clientFlowState: z
    .enum(["idle", "conversational", "survey", "resolved"])
    .optional(),
  /**
   * Phase 2 — when the user clicks the offer-help affordance, the client
   * sends this signal so the route generates a fresh adaptive survey
   * instead of continuing the conversational clarifier loop.
   */
  engageSurvey: z
    .object({
      question: z.string().min(1).max(2000),
      suggestedPath: z.enum(["decision", "recommendation"]),
      rationale: z.string().max(400).optional(),
    })
    .optional(),
  /**
   * Phase 3 — when the user submits a Survey, the client sends the
   * original survey + their answers + their original question. The
   * route maps the answers into a typed engine input via the
   * survey-adapter and runs runDecision()/runRecommendation() directly,
   * skipping the conversational intake. On adapter failure, the route
   * falls back to the conversational loop with the formatted answers
   * already in the message history.
   */
  submitSurvey: z
    .object({
      userQuestion: z.string().min(1).max(2000),
      survey: SurveySchema,
      submission: SurveySubmissionSchema,
    })
    .optional(),
});

const FieldValueSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(80)),
  z.array(z.number().finite()),
]);

// C6b — clarifier widget schema imported from lib/engine/clarifier.
// Engine owns the source of truth for clarifier shape; this route is just
// the wire-format validator. Future non-chat surfaces (voice / native /
// async weekly-audit) reuse the same schema without going through this
// streaming HTTP path. See lib/engine/clarifier.ts for the rationale.

// Phase-1 chat-as-decision-front-door — offer-help affordance shape.
// Optional metadata attached to "asking" responses when the user's latest
// message classifies as decision-shaped with confidence ≥ MIN_CONFIDENCE.
// Client renders an inline chip below the assistant message; click triggers
// future-phase intake. Never blocks the chat response.
export interface OfferHelpAffordance {
  kind: "offer-decision-help";
  suggestedPath: "decision" | "recommendation";
  rationale: string;
}

const AssistantPayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("asking"),
    reply: z.string().min(1).max(2000),
  }),
  // C6b — structured clarifier. Replaces a free-text question with an
  // inline widget the user fills directly. The orchestrator keeps emitting
  // these until it has enough fields, then flips to status:"ready".
  z.object({
    status: z.literal("clarifier"),
    reply: z.string().min(1).max(2000),
    widget: ClarifierWidgetSchema,
    /** Inferred template id, if known. Drives the "use the survey form
     *  instead" link inside the FIRST clarifier bubble of the thread. */
    inferredTemplateId: TemplateIdSchema.nullable().optional(),
  }),
  z.object({
    status: z.literal("ready"),
    reply: z.string().min(1).max(2000),
    templateId: TemplateIdSchema,
    fields: z.record(z.string(), FieldValueSchema),
    painPoints: z.array(z.string().max(140)).max(5).default([]),
  }),
]);

export async function POST(req: Request) {
  // 1. Auth — guests allowed. Engine + Groq run normally; only DB persist
  // is skipped. Guest actor uses synthetic UUIDs and RLS-narrowed scope.
  const sessionActor = await getSessionActor();
  const guest = !sessionActor && (await isGuestRequest());
  if (!sessionActor && !guest) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actor = sessionActor ?? {
    userId: GUEST_USER_ID,
    tenantId: GUEST_TENANT_ID,
  };
  const isGuest = !sessionActor;

  // 2. Parse + validate
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // 3. Rate limit (shared bucket with /api/decisions — chat-driven runs cost
  //    the same Groq budget). Guests share a single bucket via "guest:shared"
  //    so a stampede on the demo doesn't burn unbounded Groq credits.
  const rl = await checkRateLimit(isGuest ? "guest:shared" : actor.userId);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Daily decision limit reached. Try again tomorrow.",
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  // Phase-3 chat-as-decision-front-door — short-circuit when the user
  // submitted a Survey. Map the answers onto a typed engine input via
  // the survey-adapter and run runDecision()/runRecommendation()
  // directly. On adapter failure, fall through to the conversational
  // intake loop with the formatted answers already in the history.
  if (parsed.data.submitSurvey) {
    const { userQuestion, survey, submission } = parsed.data.submitSurvey;

    // PHI guard on the user question (defense in depth — same standard
    // as engageSurvey).
    const phi = detectPHI(userQuestion);
    if (phi.hasPHI) {
      return NextResponse.json(
        {
          phiBlocked: true,
          reasons: phi.reasons,
          message:
            "Your question appears to include patient identifiers. Please rephrase without PHI and try again.",
        },
        { status: 400 },
      );
    }

    const adapted = await adaptSubmission({
      userQuestion,
      survey,
      submission,
    });

    if (adapted && adapted.kind === "decision") {
      try {
        const engineInputDirect: DecisionInput = {
          templateId: adapted.templateId as TemplateId,
          source: { type: "user_form", capturedAt: new Date() },
          fields: adapted.fields as DecisionInput["fields"],
          context: { userId: actor.userId, tenantId: actor.tenantId },
        };
        const engineResult = await runDecision(engineInputDirect);
        if (process.env.NODE_ENV !== "production") {
          console.info(
            "[/api/chat] survey-adapter decision:",
            JSON.stringify({
              templateId: adapted.templateId,
              option: engineResult.output.recommendation.option,
              confidence: engineResult.output.recommendation.confidence,
            }),
          );
        }
        // Persist for authed users; guests stay ephemeral.
        let decisionId: string | undefined;
        if (!isGuest) {
          try {
            await runWithActor(
              { userId: actor.userId, tenantId: actor.tenantId },
              () =>
                withActor(async (tx) => {
                  const [row] = await tx
                    .insert(decisions)
                    .values({
                      userId: actor.userId,
                      tenantId: actor.tenantId,
                      templateId: engineInputDirect.templateId,
                      intake: engineInputDirect.fields,
                      recommendation: engineResult.output.recommendation,
                      alternatives: engineResult.output.alternatives,
                      robustAlternative: engineResult.output.robustAlternative,
                      methodTrace: engineResult.output.methodTrace,
                      workloadReducers: engineResult.output.workloadReducers,
                      destinations: engineResult.output.destinations,
                      status: "complete",
                    })
                    .returning({ id: decisions.id });
                  decisionId = row?.id;
                  await tx.insert(auditEvents).values({
                    userId: actor.userId,
                    tenantId: actor.tenantId,
                    action: "decision.create.via-chat-survey",
                    targetId: decisionId,
                    metadata: {
                      surveyId: survey.id,
                      templateId: adapted.templateId,
                    },
                  });
                }),
            );
          } catch (persistErr) {
            // Persistence is non-fatal — still return the recommendation.
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[/api/chat] decision persist failed (chat-survey):",
                persistErr,
              );
            }
          }
        }
        return NextResponse.json({
          status: "ready",
          reply:
            "Here's what the numbers say. Take a look — you can refine and we'll re-run.",
          decision: {
            decisionId: decisionId ?? "ephemeral",
            decidedAt: new Date(),
            ...engineResult.output,
          },
          templateId: adapted.templateId,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[/api/chat] runDecision failed after survey-adapter:",
            err,
          );
        }
        // fall through to intake
      }
    } else if (adapted && adapted.kind === "recommendation") {
      try {
        const recInput: RecommendationInput = {
          painPath: adapted.painPath,
          challengeText: adapted.challengeText,
          goal: adapted.goal,
          scoringInput: adapted.scoringInput,
          userId: actor.userId,
          tenantId: actor.tenantId,
        };
        const recResult = await runRecommendation(recInput);
        if (process.env.NODE_ENV !== "production") {
          console.info(
            "[/api/chat] survey-adapter recommendation:",
            JSON.stringify({
              painPath: adapted.painPath,
              recommendedTask: recResult.recommendedTask,
            }),
          );
        }
        // Persist for authed users; guests stay ephemeral.
        let recommendationId: string | undefined;
        if (!isGuest) {
          try {
            await runWithActor(
              { userId: actor.userId, tenantId: actor.tenantId },
              () =>
                withActor(async (tx) => {
                  const [row] = await tx
                    .insert(recommendations)
                    .values({
                      userId: actor.userId,
                      tenantId: actor.tenantId,
                      painPath: recResult.selectedPainPath,
                      challengeSummary: recResult.challengeSummary,
                      goal: recResult.goal,
                      intake: {
                        source: "chat-survey",
                        surveyId: survey.id,
                        answers: submission.answers,
                      } as unknown as Record<string, unknown>,
                      candidateTasks:
                        recResult.candidateTasks as unknown as Record<
                          string,
                          unknown
                        >[],
                      recommendedTask: {
                        title: recResult.recommendedTask,
                        approach: recResult.recommendedApproach,
                        why: recResult.whyThisTask,
                      } as unknown as Record<string, unknown>,
                      starterSolution: {
                        text: recResult.starterSolution,
                      } as unknown as Record<string, unknown>,
                      guardrails:
                        recResult.guardrails as unknown as Record<
                          string,
                          unknown
                        >[],
                      successMetric: recResult.successMetric,
                      adoptionPathway:
                        recResult.adoptionPathway as unknown as Record<
                          string,
                          unknown
                        >[],
                      methodTrace:
                        recResult.methodTrace as unknown as Record<
                          string,
                          unknown
                        >[],
                      status: "planned",
                      confidence: String(
                        (recResult.confidence / 100).toFixed(2),
                      ),
                    })
                    .returning({ id: recommendations.id });
                  recommendationId = row?.id;
                  await tx.insert(auditEvents).values({
                    userId: actor.userId,
                    tenantId: actor.tenantId,
                    action: "recommendation.create.via-chat-survey",
                    targetId: recommendationId,
                    metadata: {
                      surveyId: survey.id,
                      painPath: adapted.painPath,
                    },
                  });
                }),
            );
          } catch (persistErr) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[/api/chat] recommendation persist failed (chat-survey):",
                persistErr,
              );
            }
          }
        }
        return NextResponse.json({
          status: "recommendation",
          reply:
            "Here's the recommendation tailored to your answers. Refine anything and we'll re-run.",
          recommendation: recResult,
          recommendationId: recommendationId ?? "ephemeral",
        });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[/api/chat] runRecommendation failed after survey-adapter:",
            err,
          );
        }
        // fall through to intake
      }
    }
    // Unmappable submission or engine failure — fall through to the normal
    // conversational intake. The message log already contains the
    // formatted answers (the client sends both submitSurvey AND appends
    // the human-readable user message), so the intake LLM has full
    // context.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[/api/chat] survey-adapter unmappable; falling back to intake",
      );
    }
  }

  // Phase-2 chat-as-decision-front-door — short-circuit when the user
  // accepted the offer-help affordance. Generate a fresh adaptive survey
  // tailored to their decision question and return it as
  // `status: "survey"`. On generation failure, fall through to the normal
  // conversational clarifier loop with a polite "let's keep talking"
  // primer so the user is never left staring at a dead chip.
  if (parsed.data.engageSurvey) {
    // PHI guard on the engageSurvey.question — same standard as messages.
    const phi = detectPHI(parsed.data.engageSurvey.question);
    if (phi.hasPHI) {
      return NextResponse.json(
        {
          phiBlocked: true,
          reasons: phi.reasons,
          message:
            "Your question appears to include patient identifiers. Please rephrase without PHI and try again.",
        },
        { status: 400 },
      );
    }
    const survey = await generateSurvey({
      question: parsed.data.engageSurvey.question,
      suggestedPath: parsed.data.engageSurvey.suggestedPath,
      rationale: parsed.data.engageSurvey.rationale,
    });
    if (survey) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[/api/chat] generated survey:",
          JSON.stringify({
            id: survey.id,
            fields: survey.fields.length,
            suggestedPath: survey.suggestedPath,
          }),
        );
      }
      return NextResponse.json({
        status: "survey",
        reply: survey.intro ?? "A few quick questions to make this decision well.",
        survey,
      });
    }
    // Generation failed — fall through. The normal clarifier loop below
    // will pick up from the existing messages history.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[/api/chat] survey generation failed, falling back to clarifier loop",
      );
    }
  }

  // S1: PHI guard — scan every message content before invoking Groq.
  // Returns 400 if ANY message contains PHI patterns. No LLM call is made.
  // Audit row records the PHI-blocked event (no raw content — only reasons).
  for (let i = 0; i < parsed.data.messages.length; i++) {
    const msg = parsed.data.messages[i]!;
    const phi = detectPHI(msg.content);
    if (phi.hasPHI) {
      // Best-effort audit row — fire-and-forget. Skipped for guests (no
      // tenant FK + nothing to attribute to).
      if (!isGuest) {
        void runWithActor(
          { userId: actor.userId, tenantId: actor.tenantId },
          () =>
            withActor(async (tx) => {
              await tx.insert(auditEvents).values({
                userId: actor.userId,
                tenantId: actor.tenantId,
                action: "chat.phi_blocked",
                metadata: {
                  reasons: phi.reasons,
                  message_index: i,
                  message_role: msg.role,
                },
              });
            }),
        ).catch(() => {
          // Audit is non-fatal.
        });
      }

      return NextResponse.json(
        {
          phiBlocked: true,
          reasons: phi.reasons,
          messageIndex: i,
          message:
            "One or more messages appear to contain protected health information (PHI). Please remove patient identifiers and try again.",
        },
        { status: 400 },
      );
    }
  }

  // Phase-1 chat-as-decision-front-door — kick off decision-intent detection
  // on the most recent user message IN PARALLEL with the Groq response
  // synthesis, BUT only when the FSM says we're in `idle`.
  //
  // Defense in depth: derive the FSM state SERVER-SIDE from per-message
  // metadata flags the client sends, then cross-check against the client's
  // hint. On disagreement we trust the server (don't take client gating
  // decisions on faith) and log the divergence so we can investigate.
  const latestUserMessage =
    [...parsed.data.messages].reverse().find((m) => m.role === "user")
      ?.content ?? "";
  const messagesForFlow: MessageForFlow[] = parsed.data.messages.map((m) => ({
    role: m.role,
    clarifier: m.hasClarifier ? true : undefined,
    clarifierResolved: m.clarifierResolved,
    survey: m.hasSurvey ? true : undefined,
    surveyResolved: m.surveyResolved,
    savedFromSurvey: m.hasSaveOffer ? true : undefined,
    saveSkillResolved: m.saveSkillResolved,
  }));
  // For Phase-3 / Phase-4 inbound signals: the user is mid-flight on a
  // survey or just received an engine output. Treat as conservative
  // server signals so we don't fire detector on submitSurvey/engageSurvey
  // round-trips.
  const serverDerivedState: FlowState = parsed.data.submitSurvey
    ? "survey"
    : parsed.data.engageSurvey
      ? "idle" // user just accepted; new flow starting; detector NOT useful (we already know the answer)
      : deriveFlowState(messagesForFlow).state;
  const flowState: FlowState = serverDerivedState;
  if (
    parsed.data.clientFlowState &&
    parsed.data.clientFlowState !== serverDerivedState &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      "[/api/chat] flow-state disagreement:",
      JSON.stringify({
        client: parsed.data.clientFlowState,
        server: serverDerivedState,
      }),
    );
  }
  const detectionEligible = latestUserMessage && shouldFireDetector(flowState);
  const NO_DETECTION: DecisionDetection = {
    kind: "not-decision" as const,
    confidence: 0,
    suggestedPath: null,
    rationale: detectionEligible ? "" : `skipped — flow state is ${flowState}`,
  };
  const detectionPromise: Promise<DecisionDetection> = detectionEligible
    ? detectDecisionIntent(latestUserMessage)
    : Promise.resolve(NO_DETECTION);

  // 4. Ask Groq for next message OR ready directive.
  let raw = "{}";
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...parsed.data.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      response_format: { type: "json_object" },
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch (e) {
    console.error("[/api/chat] groq failure:", e);
    // Don't 500 the user — surface a friendly message and let them retry.
    return NextResponse.json({
      status: "asking",
      reply:
        "I'm having trouble reaching my reasoning model right now. Could you try sending that again in a moment?",
    });
  }
  let parsedAssistant: z.infer<typeof AssistantPayloadSchema>;
  try {
    parsedAssistant = AssistantPayloadSchema.parse(JSON.parse(raw));
  } catch {
    // Fallback: if the LLM produced invalid output, treat it as a question.
    return NextResponse.json({
      status: "asking",
      reply:
        "Sorry, I lost the thread. Could you restate the situation in a sentence or two?",
    });
  }

  // Phase-1 chat-as-decision-front-door — resolve the decision-intent
  // detection that was kicked off in parallel with the Groq call. Both
  // the "asking" and "clarifier" branches attach the offerHelp affordance
  // when confidence ≥ MIN_CONFIDENCE so the user can opt into the
  // structured-survey path regardless of which conversational mode the
  // LLM chose for its reply.
  let offerHelp: OfferHelpAffordance | undefined;
  if (
    parsedAssistant.status === "asking" ||
    parsedAssistant.status === "clarifier"
  ) {
    const detection = await detectionPromise;
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[/api/chat] decision-intent:",
        JSON.stringify({
          kind: detection.kind,
          confidence: detection.confidence,
          suggestedPath: detection.suggestedPath,
          replyStatus: parsedAssistant.status,
        }),
      );
    }
    offerHelp = shouldOfferHelp(detection)
      ? {
          kind: "offer-decision-help",
          suggestedPath: detection.suggestedPath!,
          rationale: detection.rationale,
        }
      : undefined;
  }

  // Phase A — continue the conversation
  if (parsedAssistant.status === "asking") {
    return NextResponse.json({
      status: "asking",
      reply: parsedAssistant.reply,
      ...(offerHelp ? { offerHelp } : {}),
    });
  }

  // C6b — Phase A' — the model is asking for ONE structured value via a
  // clarifier widget. The frontend renders the widget; the user's submission
  // comes back as a normal user-message in the next request. No engine call.
  if (parsedAssistant.status === "clarifier") {
    return NextResponse.json({
      status: "clarifier",
      reply: parsedAssistant.reply,
      widget: parsedAssistant.widget,
      inferredTemplateId: parsedAssistant.inferredTemplateId ?? null,
      ...(offerHelp ? { offerHelp } : {}),
    });
  }

  // F-11 Stage 0 — classify the user's most recent message BEFORE the engine
  // runs. If the question is out-of-scope (diagnostic / predictive /
  // optimization / descriptive / sequential), decline-and-reframe instead of
  // running the engine. Defensive: if classifier fails, default to engine.
  const lastUserMessage =
    [...parsed.data.messages].reverse().find((m) => m.role === "user")
      ?.content ?? "";
  let classifierResult: Awaited<ReturnType<typeof runStage0Classifier>> | null = null;
  try {
    classifierResult = await runStage0Classifier(lastUserMessage);
  } catch (e) {
    console.error("[/api/chat] stage0 classifier failure:", e);
    classifierResult = null;
  }

  // E5: user explicitly requested "run it anyway" — skip decline-and-reframe.
  const userOverrode = parsed.data.userOverrode === true;
  if (
    !userOverrode &&
    classifierResult &&
    shouldDeclineAndReframe(classifierResult.classification)
  ) {
    const reframe = reframeMessageFor(classifierResult.classification);
    return NextResponse.json({
      status: "asking", // stay in conversation
      reply: reframe.reply,
      reframeChips: reframe.chips,
      decisionType: classifierResult.classification,
    });
  }

  // Phase B — assistant says it's ready. Run the engine.
  const engineInput: DecisionInput = {
    templateId: parsedAssistant.templateId as TemplateId,
    source: { type: "user_form", capturedAt: new Date() },
    fields: parsedAssistant.fields as DecisionInput["fields"],
    context: { userId: actor.userId, tenantId: actor.tenantId },
  };

  let engineResult: Awaited<ReturnType<typeof runDecision>>;
  try {
    engineResult = await runDecision(engineInput);
  } catch (e) {
    return NextResponse.json(
      {
        status: "asking",
        reply:
          "I had trouble running that. Mind sharing the numbers again or skipping any I got wrong?",
      },
      { status: 200 },
    );
  }

  // E5: when the user overrode the decline-and-reframe path, prepend a
  // Stage-0 trace entry so the persisted decision row carries an audit
  // trail. The original classification (when present) is included for
  // eval visibility.
  if (userOverrode) {
    const classification = classifierResult?.classification ?? "unknown";
    engineResult.output.methodTrace = [
      {
        stage: 0,
        name: "classifier",
        output: {
          userOverrode: true,
          classification,
          note: `Stage-0 classifier flagged this as "${classification}" but the user chose "Stay with original question". Engine routed to the closest-fit template.`,
        },
      },
      ...engineResult.output.methodTrace,
    ];
  }

  // Persist + audit (best-effort). Skipped entirely for guests — the
  // recommendation is returned ephemerally with decisionId="ephemeral".
  let decisionId: string | undefined;
  if (isGuest) {
    // No-op; guests never write to decisions or audit tables.
  } else try {
    await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(decisions)
            .values({
              userId: actor.userId,
              tenantId: actor.tenantId,
              templateId: engineInput.templateId,
              intake: engineInput.fields,
              recommendation: engineResult.output.recommendation,
              alternatives: engineResult.output.alternatives,
              robustAlternative: engineResult.output.robustAlternative,
              methodTrace: engineResult.output.methodTrace,
              workloadReducers: engineResult.output.workloadReducers,
              destinations: engineResult.output.destinations,
              status: "complete",
            })
            .returning({ id: decisions.id });
          decisionId = row?.id;

          const totalIn = engineResult.llmCalls.reduce(
            (s, c) => s + c.tokensIn,
            0,
          );
          const totalOut = engineResult.llmCalls.reduce(
            (s, c) => s + c.tokensOut,
            0,
          );
          await tx.insert(auditEvents).values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            action: "decision.create.via-chat",
            targetId: decisionId,
            metadata: {
              tokensIn: totalIn,
              tokensOut: totalOut,
              model: GROQ_MODEL,
              painPoints: parsedAssistant.painPoints,
            },
          });
        }),
    );
  } catch {
    // Persistence is non-fatal here; we still return the recommendation.
  }

  // F-11 VDD: when the classification is values-dominant, strip the
  // numerical confidence on the recommendation. The values-map output is the
  // contract — there is no single ranked answer to anchor a percent on.
  const isVddOutput =
    !!classifierResult && isVdd(classifierResult.classification);

  const decisionOutput: DecisionOutput = {
    decisionId: decisionId ?? "ephemeral",
    decidedAt: new Date(),
    ...engineResult.output,
    ...(classifierResult
      ? { decisionType: classifierResult.classification }
      : {}),
    recommendation: isVddOutput
      ? {
          option: engineResult.output.recommendation.option,
          // confidence intentionally omitted — VDD contract.
          rationale: engineResult.output.recommendation.rationale,
        }
      : engineResult.output.recommendation,
  };

  return NextResponse.json({
    status: "ready",
    reply: parsedAssistant.reply,
    painPoints: parsedAssistant.painPoints,
    decision: decisionOutput,
  });
}
