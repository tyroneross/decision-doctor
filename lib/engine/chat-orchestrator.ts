// Chat-first orchestrator. Bridges between free-form chat turns and the
// engine pipelines. Invoked by /api/chat per turn.
//
// Responsibilities per turn:
//   1. Take the new user message + prior transcript
//   2. If no router decision yet — run Stage 0 router (or use prior router output)
//   3. Decide: ask another clarifier, OR run the engine for the committed mode,
//      OR ask for confirmation before mode-commit
//   4. Return the next assistant message + status

import "server-only";
import {
  type ChatTranscript,
  type ChatMessage,
  type DecisionMode,
} from "@/shared/schema";
import { routeMessage, type RouterOutput } from "./router";
import { loadTemplate } from "./templates";
import type { TemplateField } from "./templates/types";
import { callStage } from "@/lib/groq";

export type ChatTurnStatus =
  | { kind: "chatting"; assistant: ChatMessage; transcript: ChatTranscript }
  | { kind: "ready"; assistant: ChatMessage; transcript: ChatTranscript; mode: DecisionMode }
  | { kind: "needs_confirm_mode"; assistant: ChatMessage; transcript: ChatTranscript };

const MAX_CHAT_TURNS = 12; // hard cap on user turns before we must commit

function makeMsg(
  role: ChatMessage["role"],
  content: string,
  extras: Partial<ChatMessage> = {},
): ChatMessage {
  return { role, content, timestamp: new Date(), ...extras };
}

/**
 * Process one user turn. Returns the next assistant message + updated state +
 * status flag. The /api/chat route handler is responsible for persisting the
 * transcript back to the decisions row.
 */
export async function processChatTurn(opts: {
  userMessage: string;
  transcript: ChatTranscript;
}): Promise<ChatTurnStatus> {
  const userTurn = makeMsg("user", opts.userMessage);
  const transcript: ChatTranscript = {
    ...opts.transcript,
    messages: [...opts.transcript.messages, userTurn],
  };

  // Phase A — first turn or no router decision yet → classify
  if (!transcript.routerOutput) {
    return handleFirstClassification(transcript);
  }

  // Phase B — committed to a mode; check whether we have enough info
  const mode = transcript.routerOutput.mode;
  const userTurnCount = transcript.messages.filter((m) => m.role === "user").length;

  if (userTurnCount >= MAX_CHAT_TURNS) {
    // Out of patience — commit to whatever info we have. Engine handles defaults.
    return readyToRun(transcript, mode);
  }

  // For structured_enumerable + matched template — extract intake fields
  // conversationally. When we have all required fields, ready_to_run.
  if (
    mode === "structured_enumerable" &&
    transcript.routerOutput.templateMatch
  ) {
    return handleTemplateExtraction(transcript);
  }

  // For other modes — for v1 we defer to the structured pipeline using
  // a generic "tell me more" loop until we have enough. v1.1 will add
  // mode-specific runDesignBrief / runValuesMap pipelines.
  return handleGenericClarifier(transcript);
}

// ---------------------------------------------------------------------------
// Phase A — first message → router → either commit or ask clarifying chips
// ---------------------------------------------------------------------------

async function handleFirstClassification(
  transcript: ChatTranscript,
): Promise<ChatTurnStatus> {
  const firstUser = transcript.messages.find((m) => m.role === "user");
  if (!firstUser) {
    const assistant = makeMsg(
      "assistant",
      "Tell me about a decision you're trying to make. One sentence is enough to start.",
    );
    return { kind: "chatting", assistant, transcript: { ...transcript, messages: [...transcript.messages, assistant] } };
  }

  const routerOut = await routeMessage(firstUser.content);

  // If router low-confidence and produced a clarifying chip-question, surface it
  if (routerOut.clarifyingQuestion && routerOut.confidence < 0.7) {
    const assistant = makeMsg(
      "assistant",
      routerOut.clarifyingQuestion.text,
      { chips: routerOut.clarifyingQuestion.chips.map((c) => ({ value: c.value, label: c.label })) },
    );
    return {
      kind: "needs_confirm_mode",
      assistant,
      transcript: {
        ...transcript,
        messages: [...transcript.messages, assistant],
        // Don't commit routerOutput yet — the user's chip pick will resolve it.
      },
    };
  }

  // Confident enough — commit the router output and start the mode-specific flow
  const next: ChatTranscript = {
    ...transcript,
    routerOutput: {
      mode: routerOut.mode,
      confidence: routerOut.confidence,
      templateMatch: routerOut.templateMatch,
      rationale: routerOut.rationale,
    },
  };

  // For structured_enumerable with template → start asking for the missing fields
  if (routerOut.mode === "structured_enumerable" && routerOut.templateMatch) {
    return askFirstTemplateField(next);
  }

  // For other modes → ask for the first piece of missing info
  const ack = `${routerOut.rationale} ${
    routerOut.missingInfo.length > 0
      ? `To do this well, ${routerOut.missingInfo[0]}.`
      : "Tell me a bit more."
  }`;
  const assistant = makeMsg("assistant", ack);
  return {
    kind: "chatting",
    assistant,
    transcript: { ...next, messages: [...next.messages, assistant] },
  };
}

// ---------------------------------------------------------------------------
// Template extraction loop — for structured_enumerable mode
// ---------------------------------------------------------------------------

async function askFirstTemplateField(
  transcript: ChatTranscript,
): Promise<ChatTurnStatus> {
  const tplId = transcript.routerOutput?.templateMatch;
  if (!tplId) {
    return readyToRun(transcript, "structured_enumerable");
  }
  const template = loadTemplate(tplId);
  const firstField = template.fields[0];
  if (!firstField) {
    return readyToRun(transcript, "structured_enumerable");
  }

  const ack =
    transcript.routerOutput?.rationale ?? "We can use the right template here.";
  const intro = `${ack} I'll ask ${template.fields.length} short questions — about 5 minutes.`;
  const question = formatFieldAsQuestion(firstField);
  const assistant = makeMsg("assistant", `${intro}\n\n${question}`, {
    chips: chipsForField(firstField),
    delta: { askingField: firstField.id },
  });
  return {
    kind: "chatting",
    assistant,
    transcript: { ...transcript, messages: [...transcript.messages, assistant] },
  };
}

async function handleTemplateExtraction(
  transcript: ChatTranscript,
): Promise<ChatTurnStatus> {
  const tplId = transcript.routerOutput?.templateMatch;
  if (!tplId) return readyToRun(transcript, "structured_enumerable");
  const template = loadTemplate(tplId);

  // Find which field we last asked about (set in the previous assistant.delta)
  const lastAssistant = [...transcript.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const askingFieldId =
    (lastAssistant?.delta?.askingField as string | undefined) ?? null;

  const lastUser = [...transcript.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return readyToRun(transcript, "structured_enumerable");

  // Try to extract a value for the field that was asked. For v1 this is naive:
  // use a Groq call to map free-form text to the field's expected shape. The
  // alternative is to use chips/sliders which the user clicked instead of typing.
  const extracted = await extractFieldValue(
    template.fields.find((f) => f.id === askingFieldId) ?? null,
    lastUser.content,
  );

  const newExtracted = { ...transcript.extractedFields };
  if (askingFieldId && extracted !== undefined) {
    newExtracted[askingFieldId] = extracted;
  }

  // Find the next required field that's still missing
  const nextField = template.fields.find(
    (f) => f.required !== false && !(f.id in newExtracted),
  );

  if (!nextField) {
    // We have everything required — ready to run the engine
    return readyToRun(
      { ...transcript, extractedFields: newExtracted },
      "structured_enumerable",
    );
  }

  // Ask the next field
  const assistant = makeMsg("assistant", formatFieldAsQuestion(nextField), {
    chips: chipsForField(nextField),
    delta: { askingField: nextField.id, extracted: extracted },
  });
  return {
    kind: "chatting",
    assistant,
    transcript: {
      ...transcript,
      extractedFields: newExtracted,
      messages: [...transcript.messages, assistant],
    },
  };
}

// ---------------------------------------------------------------------------
// Generic clarifier — used for modes 2/3/4 in v1 (the runDesignBrief +
// runValuesMap pipelines come in v1.1)
// ---------------------------------------------------------------------------

async function handleGenericClarifier(
  transcript: ChatTranscript,
): Promise<ChatTurnStatus> {
  const userTurnCount = transcript.messages.filter((m) => m.role === "user").length;
  // Simple v1 behavior: after 4-5 user turns, commit and run.
  if (userTurnCount >= 4) {
    return readyToRun(transcript, transcript.routerOutput!.mode);
  }
  // Otherwise ask the LLM to generate the next clarifier question.
  const lastUser = [...transcript.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return readyToRun(transcript, transcript.routerOutput!.mode);

  const sys = `You are a calm, focused decision-aid assistant for solo healthcare practitioners. Your job: ask ONE short clarifying question that surfaces the single most important missing piece for this decision. NO numbered lists, NO multi-paragraph essays. Plain language. ≤2 sentences. End with a question mark. NEVER ask for patient identifying info (PHI).`;

  const transcriptText = transcript.messages
    .slice(-6) // last 3 turns from each side
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  try {
    const { answer } = await callStage({
      systemPrompt: sys,
      userPrompt: `Mode: ${transcript.routerOutput?.mode}\n\nConversation so far:\n${transcriptText}\n\nWrite the next clarifier.`,
      temperature: 0.4,
    });
    const cleaned = answer.trim().slice(0, 600) || "Tell me more about that.";
    const assistant = makeMsg("assistant", cleaned);
    return {
      kind: "chatting",
      assistant,
      transcript: { ...transcript, messages: [...transcript.messages, assistant] },
    };
  } catch {
    const assistant = makeMsg("assistant", "Tell me one more thing about your situation.");
    return {
      kind: "chatting",
      assistant,
      transcript: { ...transcript, messages: [...transcript.messages, assistant] },
    };
  }
}

// ---------------------------------------------------------------------------
// Ready-to-run — emits the closing assistant message; route handler runs engine
// ---------------------------------------------------------------------------

function readyToRun(transcript: ChatTranscript, mode: DecisionMode): ChatTurnStatus {
  const assistant = makeMsg(
    "assistant",
    "Got what I need. Building your recommendation now — usually 8-12 seconds.",
  );
  return {
    kind: "ready",
    mode,
    assistant,
    transcript: { ...transcript, messages: [...transcript.messages, assistant] },
  };
}

// ---------------------------------------------------------------------------
// Field utilities — turn template fields into chat questions + chips
// ---------------------------------------------------------------------------

function formatFieldAsQuestion(field: TemplateField): string {
  const base = field.label.endsWith("?") ? field.label : `${field.label}?`;
  const hint = field.hint ? `\n\n_${field.hint}_` : "";
  return `${base}${hint}`;
}

function chipsForField(
  field: TemplateField,
): { value: string; label: string }[] | undefined {
  if (field.kind.type === "select") {
    return field.kind.options.map((o) => ({ value: o.value, label: o.label }));
  }
  if (field.kind.type === "boolean") {
    return [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
  }
  return undefined;
}

async function extractFieldValue(
  field: TemplateField | null,
  userText: string,
): Promise<unknown> {
  if (!field) return undefined;
  const t = userText.trim();
  if (t.length === 0) return undefined;

  // Chip clicks come in as the chip's `value`. Match exactly first.
  if (field.kind.type === "select") {
    const exact = field.kind.options.find(
      (o) => o.value === t || o.label === t,
    );
    if (exact) return exact.value;
  }
  if (field.kind.type === "boolean") {
    const lo = t.toLowerCase();
    if (lo === "yes" || lo === "true" || lo.startsWith("y")) return true;
    if (lo === "no" || lo === "false" || lo.startsWith("n")) return false;
  }
  if (field.kind.type === "number" || field.kind.type === "slider" || field.kind.type === "number-picker") {
    const m = t.match(/-?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  if (field.kind.type === "range") {
    const matches = t.match(/-?\d+(?:\.\d+)?/g);
    if (matches && matches.length >= 2) {
      const a = Number(matches[0]);
      const b = Number(matches[1]);
      return [Math.min(a, b), Math.max(a, b)];
    }
    if (matches && matches.length === 1) {
      const n = Number(matches[0]);
      return [Math.max(0, n - n * 0.15), n + n * 0.15]; // ±15% as a default range
    }
  }
  if (field.kind.type === "multiselect") {
    // Comma-separated text → match against options
    const tokens = t.toLowerCase().split(/[,;\n]/).map((s) => s.trim());
    const picks = field.kind.options
      .filter((o) => tokens.includes(o.value) || tokens.includes(o.label.toLowerCase()))
      .map((o) => o.value);
    if (picks.length > 0) return picks;
  }
  // Text fields take the raw answer (capped by Zod max length).
  if (field.kind.type === "text") {
    return t.slice(0, field.kind.maxLength);
  }
  // Last-resort LLM extraction for free-form text vs structured fields.
  // Skipped in v1 to keep latency low; can add a Groq call here later.
  return undefined;
}
