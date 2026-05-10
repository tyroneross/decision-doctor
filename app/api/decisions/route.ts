// PRD §6 + §7.3 — Decisions API.
// Wires Better Auth session + actor context + (Phase 3) engine pipeline.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { DecisionInputSchema } from "@/shared/schema";
import { getSessionActor } from "@/lib/auth-session";
import { desc } from "drizzle-orm";

// LD-08 — Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // PHI rejection: Zod schema rejects free-form long strings (T-09).
  const body = await req.json().catch(() => ({}));
  // Force the input.context to the server-side actor — never trust client.
  const enriched = {
    ...body,
    context: {
      ...(body?.context ?? {}),
      userId: actor.userId,
      tenantId: actor.tenantId,
    },
  };
  const parsed = DecisionInputSchema.safeParse(enriched);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        // C5 will replace this stub with the engine pipeline.
        // For now: persist the intake row and return the decisionId so the
        // C6/C7 UI can scaffold against a real handle.
        const [row] = await tx
          .insert(decisions)
          .values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            templateId: parsed.data.templateId,
            intake: parsed.data.fields,
            status: "pending",
          })
          .returning({ id: decisions.id });

        return Response.json(
          {
            decisionId: row!.id,
            status: "pending",
            note: "Engine not yet implemented — see PRD §6.2 (C5 commit).",
          },
          { status: 202 },
        );
      }),
  );
}

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        // RLS auto-enforced — no need to filter by tenant_id.
        const rows = await tx
          .select()
          .from(decisions)
          .orderBy(desc(decisions.createdAt))
          .limit(50);
        return Response.json(rows);
      }),
  );
}
