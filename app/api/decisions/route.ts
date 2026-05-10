// PRD §7.3 + §6 — Route handler skeleton showing the runWithActor pattern.
// Every DB-touching route must follow this pattern.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { DecisionInputSchema } from "@/shared/schema";

// LD-08 — REQUIRED. Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1. Auth check (Better Auth — wire up once auth.ts exists)
  // const session = await getSession(req);
  // if (!session) return new Response("Unauthorized", { status: 401 });
  const session = { userId: "TODO", tenantId: "TODO" }; // STUB — replace with Better Auth session

  // 2. Parse + validate input (Zod rejects PHI per ADR-002 / T-09)
  const body = await req.json().catch(() => ({}));
  const parsed = DecisionInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 3. Wrap handler in actor context — RLS GUCs scoped per transaction
  return runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () => {
      return withActor(async (tx) => {
        // TODO: Run the engine pipeline (lib/engine/orchestrator.ts) once implemented
        // const output = await runDecision(parsed.data);
        // const [row] = await tx.insert(decisions).values({ ... }).returning();

        return Response.json({
          status: "stub",
          note: "Engine not yet implemented — see PRD §6.2 for the pipeline",
        });
      });
    },
  );
}

export async function GET(req: Request) {
  // const session = await getSession(req);
  // if (!session) return new Response("Unauthorized", { status: 401 });
  const session = { userId: "TODO", tenantId: "TODO" }; // STUB

  return runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () => {
      return withActor(async (tx) => {
        // RLS auto-enforced — no need to write WHERE tenant_id = ...
        const rows = await tx.select().from(decisions);
        return Response.json(rows);
      });
    },
  );
}
