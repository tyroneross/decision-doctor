// app/api/assets/explain/route.ts — C4: SSE "Learn More" for a plugin or skill.
//
// POST /api/assets/explain
// Body: { kind: "plugin" | "skill", id: uuid, question?: string }
//
// Streams a Groq-synthesized walkthrough scoped to the asset's content. We
// build a system prompt that grounds the LLM in the asset's title, description,
// metadata, and a token-budgeted snapshot of its asset_files (notably SKILL.md,
// README.md, CLAUDE.md, plugin.json/metadata.json — the human-readable layer).
//
// Reuses the SSE wrapper from /api/ai-adoption-qa (lib/qa/stream.ts) plus the
// existing Groq client.

import "server-only";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { runWithActor } from "@/lib/db/actor";
import { getPluginById, getSkillById } from "@/lib/plugin-lib";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { createSSEResponse } from "@/lib/qa/stream";
import {
  badRequest,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

const RequestSchema = z.object({
  kind: z.enum(["plugin", "skill"]),
  id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "invalid_uuid",
    ),
  question: z.string().min(1).max(2000).optional(),
});

// Files we prefer to expose to the LLM, in priority order. We cap total chars.
const PRIORITY_FILES = [
  "SKILL.md",
  "README.md",
  "CLAUDE.md",
  "plugin.json",
  "metadata.json",
];
const MAX_CONTEXT_CHARS = 24000; // ~6k tokens — leaves headroom in Groq's window

function pickContextFiles(
  files: { path: string; content: string }[],
): { path: string; content: string }[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const ordered: { path: string; content: string }[] = [];
  let used = 0;

  for (const want of PRIORITY_FILES) {
    const f = byPath.get(want);
    if (!f) continue;
    const chunk = f.content;
    if (used + chunk.length > MAX_CONTEXT_CHARS) {
      ordered.push({ path: f.path, content: chunk.slice(0, MAX_CONTEXT_CHARS - used) });
      return ordered;
    }
    ordered.push(f);
    used += chunk.length;
  }
  // Then walk the rest in path order until we hit the budget.
  for (const f of files) {
    if (PRIORITY_FILES.includes(f.path)) continue;
    if (used >= MAX_CONTEXT_CHARS) break;
    const remaining = MAX_CONTEXT_CHARS - used;
    if (f.content.length > remaining) {
      ordered.push({ path: f.path, content: f.content.slice(0, remaining) });
      used = MAX_CONTEXT_CHARS;
    } else {
      ordered.push(f);
      used += f.content.length;
    }
  }
  return ordered;
}

const DEFAULT_QUESTION =
  "Walk me through this plugin/skill for a non-developer healthcare practitioner. Explain when to use it, the core concept, and concrete steps to apply it.";

export async function POST(req: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest({ body: "invalid_json" });
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const { kind, id, question } = parsed.data;

  const detail = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () => {
      if (kind === "plugin") return getPluginById(id, actor.userId);
      return getSkillById(id, actor.userId);
    },
  );
  if (!detail) return notFound();

  const contextFiles = pickContextFiles(detail.files);
  const sourcesBlock = contextFiles
    .map(
      (f) =>
        `### file: ${f.path}\n\n${f.content}\n`,
    )
    .join("\n---\n");

  const userQuestion = question ?? DEFAULT_QUESTION;

  const systemPrompt = `You are explaining a reusable AI asset to a solo healthcare practitioner.

You can use ONLY the information in the provided files below. If something isn't covered, say so plainly — do NOT invent steps, libraries, or APIs.

The audience is a clinician with limited engineering background. Keep the tone calm and precise. Avoid jargon. Lead with the concrete user value, then explain when to use it, then walk through one applied example.

## Asset metadata
kind: ${kind}
title: ${detail.title}
slug: ${detail.slug}
description: ${detail.description || "(none)"}
version: ${detail.version}

## Files
${sourcesBlock}
`.trim();

  const abortController = new AbortController();

  async function* buildStream() {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.3,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuestion },
        ],
      });

      for await (const chunk of completion) {
        if (abortController.signal.aborted) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) yield { type: "token", text: delta };
      }
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Best-effort audit (fire and forget) — Groq tokens accounted for downstream.
  writeAudit(actor, "asset.explain", id, {
    kind,
    context_files: contextFiles.map((f) => f.path),
    question_provided: !!question,
  });

  return createSSEResponse(buildStream(), abortController.signal);
}
