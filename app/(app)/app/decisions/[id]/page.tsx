// PRD §F-04 — Recommendation view (authenticated). Reads the row via RLS.

import { notFound } from "next/navigation";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActorSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { DecisionOutputSchema, ChatTranscriptSchema, type DecisionOutput } from "@/shared/schema";
import { RecommendationView } from "@/components/recommendation/recommendation-view";
import { SavedConversationView } from "@/components/recommendation/saved-conversation-view";
import { loadTemplate } from "@/lib/engine/templates";

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getActorSession();
  if (!session) redirect("/sign-in");
  const { id } = await params;

  const row = await runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () =>
      withActor(async (tx) => {
        const rows = await tx.select().from(decisions).where(eq(decisions.id, id)).limit(1);
        return rows[0] ?? null;
      }),
  );
  if (!row) notFound();

  // Empty/pending row (chat created the row but engine hasn't completed yet).
  // Do NOT 404 — show a calm "still working" state. (Persona panel 2026-05-10:
  // Hank hit a 404 on a row that did exist; better to render something.)
  if (!row.recommendation || row.status === "pending") {
    return (
      <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold">Still working on it</h1>
        <p className="mt-3 text-ink-subtle">
          We saved the conversation but haven't produced a recommendation yet.
        </p>
        <a
          href="/app/chat"
          className="mt-6 inline-flex items-center justify-center px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px]"
        >
          Continue the conversation
        </a>
      </main>
    );
  }

  const candidate: DecisionOutput = {
    decisionId: row.id,
    decidedAt: row.createdAt,
    recommendation: row.recommendation as DecisionOutput["recommendation"],
    alternatives: row.alternatives as DecisionOutput["alternatives"],
    robustAlternative: row.robustAlternative as DecisionOutput["robustAlternative"],
    methodTrace: row.methodTrace as DecisionOutput["methodTrace"],
    workloadReducers: row.workloadReducers as DecisionOutput["workloadReducers"],
    destinations: (row.destinations as DecisionOutput["destinations"]) ?? [],
  };
  const parsed = DecisionOutputSchema.safeParse(candidate);
  const decision = parsed.success ? parsed.data : candidate;

  // Detect saved-conversation rows (modes 2-4 placeholder) and render the
  // dedicated transcript view instead of the full ranking UI.
  const isSavedConversation =
    candidate.recommendation?.option === "Conversation saved" ||
    candidate.recommendation?.option === "Mode-specific output coming in v1.1"; // legacy rows pre-fix

  const transcriptParsed = ChatTranscriptSchema.safeParse(row.transcript);
  const transcript = transcriptParsed.success ? transcriptParsed.data : null;

  if (isSavedConversation) {
    return (
      <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        <div className="text-xs text-ink-muted">
          <span>Saved {new Date(row.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="mt-3">
          <SavedConversationView
            decision={decision}
            transcript={transcript ? { messages: transcript.messages } : null}
            shareToken={row.shareToken}
          />
        </div>
      </main>
    );
  }

  const validIds = ["capacity", "pricing", "admin-hire"] as const;
  const tplId = (validIds as readonly string[]).includes(row.templateId)
    ? (row.templateId as (typeof validIds)[number])
    : null;
  const tplTitle = tplId ? loadTemplate(tplId).title : "Decision";
  return (
    <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Lightweight breadcrumb only — the RecommendationView owns the H1 */}
      <div className="text-xs text-ink-muted">
        <span className="uppercase tracking-wide">{tplTitle}</span>
        <span className="mx-2">·</span>
        <span>{new Date(row.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-3">
        <RecommendationView decision={decision} shareToken={row.shareToken} />
      </div>
    </main>
  );
}
