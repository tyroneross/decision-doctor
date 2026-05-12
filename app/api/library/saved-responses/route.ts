// GET  /api/library/saved-responses  — list current user's saved responses
// POST /api/library/saved-responses  — save an /app/ask answer
//
// Authed-only. Guests get 401.
//
// POST body:
//   {
//     question:    string,
//     answer:      string,                  // markdown
//     citations:   QACitation[],            // { uuid, kind, title }
//     wasGrounded?: boolean,                // default true
//   }

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import {
  createSavedResponse,
  listSavedResponses,
} from "@/lib/library";

export const runtime = "nodejs";

const CitationSchema = z.object({
  uuid: z.string().min(1),
  kind: z.enum(["use_case", "prompt", "skill", "plugin", "corpus"]),
  title: z.string().default(""),
});

const CreateSchema = z.object({
  question: z.string().min(1).max(4000),
  answer: z.string().min(1).max(60000),
  citations: z.array(CitationSchema).max(50).optional().default([]),
  wasGrounded: z.boolean().optional().default(true),
});

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await listSavedResponses(actor.userId, actor.tenantId);
  return NextResponse.json({ saved_responses: rows });
}

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await createSavedResponse(actor.userId, actor.tenantId, {
    question: parsed.data.question,
    answer: parsed.data.answer,
    citations: parsed.data.citations,
    wasGrounded: parsed.data.wasGrounded,
  });

  return NextResponse.json({ saved_response: row }, { status: 201 });
}
