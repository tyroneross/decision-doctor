// POST /api/library/save
//
// Authed-only: inserts a user-scoped library_use_cases row.
// Used when a user "saves" a curated use case to their personal library
// or creates a net-new use case from a recommendation.
//
// Body:
//   {
//     painPath: PainPath,
//     startingLevel: StartingLevel,
//     title: string,
//     body: string,
//     rationale?: string,
//     estimatedMinutesSavedPerWeek?: number,
//     metadata?: Record<string, unknown>,
//   }

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { saveUserUseCase } from "@/lib/library";
import { isBlockedBodyKind } from "@/lib/corpus/body-kind";

// Hardening item 7.
export const runtime = "nodejs";

const SaveSchema = z.object({
  painPath: z.enum([
    "referrals",
    "research",
    "admin",
    "capacity_growth",
    "follow_up",
    "custom",
  ]),
  startingLevel: z.enum(["prompt", "checklist", "skill", "plugin", "agent"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  rationale: z.string().optional(),
  estimatedMinutesSavedPerWeek: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // C10 guard: refuse to promote any item whose source is classified as
  // blocked/degraded/metadata_only. The frontend already filters these out
  // of search results, but this is defense in depth — a hand-crafted POST
  // (curl, scripted client) must not bypass the trust filter.
  // We accept either a top-level body_kind property in the request body or
  // metadata.body_kind so callers can propagate the field naturally.
  const incomingBodyKind =
    (body as { body_kind?: unknown }).body_kind ??
    (parsed.data.metadata as { body_kind?: unknown } | undefined)?.body_kind ??
    (parsed.data.metadata as { corpus_body_kind?: unknown } | undefined)?.corpus_body_kind;
  if (isBlockedBodyKind(incomingBodyKind)) {
    return NextResponse.json(
      {
        error: "blocked_body_kind",
        message:
          "This source did not pass the corpus quality gate and cannot be saved to your library.",
      },
      { status: 422 },
    );
  }

  const row = await saveUserUseCase(actor.userId, actor.tenantId, {
    scope: actor.userId, // always user-scoped on save
    painPath: parsed.data.painPath,
    startingLevel: parsed.data.startingLevel,
    title: parsed.data.title,
    body: parsed.data.body,
    rationale: parsed.data.rationale,
    estimatedMinutesSavedPerWeek: parsed.data.estimatedMinutesSavedPerWeek,
    metadata: parsed.data.metadata,
  });

  return NextResponse.json({ use_case: row }, { status: 201 });
}
