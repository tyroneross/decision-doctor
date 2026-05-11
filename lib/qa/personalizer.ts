// lib/qa/personalizer.ts — Q1: Personalization context for authed users.
//
// Reads the user's recent recommendations (E3 table) to surface context
// for the synthesizer prompt. Gracefully falls back to the `decisions`
// table if the `recommendations` table doesn't exist yet (E3 not landed).
//
// PHI sanitization: strips challengeSummary and any free-text field that
// could carry patient-identifiable content before adding to the prompt.

import "server-only";
import { desc, eq } from "drizzle-orm";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, recommendations } from "@/lib/db/schema";
import type { PainPath } from "@/lib/db/schema";
import type { ResolvedActor } from "@/lib/auth-session";

export interface PersonalizationContext {
  recentPainPaths: PainPath[];
  /** Sanitized: free-text stripped. Metadata-only labels. */
  recentChallenges: string[];
  savedLibraryCount: number;
}

// Fields we are willing to surface from the recommendations table.
// challengeSummary is explicitly excluded — it's free-text user input
// that may contain PHI or at minimum patient-adjacent context.
const SAFE_RECOMMENDATION_FIELDS = {
  id: recommendations.id,
  painPath: recommendations.painPath,
  status: recommendations.status,
  createdAt: recommendations.createdAt,
} as const;

/**
 * Returns null for guests (no actor → no history).
 * For authed users: top-5 recent recommendations via RLS-scoped query.
 * Falls back to the `decisions` table if `recommendations` table is absent.
 */
export async function getPersonalizationContext(
  actor: ResolvedActor,
): Promise<PersonalizationContext | null> {
  const userId = actor.userId;
  const tenantId = actor.tenantId;

  // Try recommendations table first (E3).
  let recentPainPaths: PainPath[] = [];

  try {
    const rows = await runWithActor({ userId, tenantId }, () =>
      withActor(async (tx) =>
        tx
          .select(SAFE_RECOMMENDATION_FIELDS)
          .from(recommendations)
          .where(eq(recommendations.userId, userId))
          .orderBy(desc(recommendations.createdAt))
          .limit(5),
      ),
    );

    recentPainPaths = rows.map((r) => r.painPath);
  } catch (err) {
    // recommendations table doesn't exist yet (E3 not landed) — fall back
    // to decisions table and approximate pain path from templateId.
    const errMsg = String(err);
    const isTableMissing =
      errMsg.includes("relation") &&
      errMsg.includes("does not exist");

    if (!isTableMissing) {
      // Unexpected error — surface via console but don't block the request.
      console.warn("[personalizer] recommendations query failed:", errMsg);
    }

    // Fallback: read decisions table (templateId → pain_path approximation).
    try {
      const decisionRows = await runWithActor({ userId, tenantId }, () =>
        withActor(async (tx) =>
          tx
            .select({ templateId: decisions.templateId })
            .from(decisions)
            .where(eq(decisions.userId, userId))
            .orderBy(desc(decisions.createdAt))
            .limit(5),
        ),
      );

      recentPainPaths = decisionRows.map((r) =>
        templateIdToPainPath(r.templateId),
      );
    } catch {
      // Complete fallback failure — proceed without personalization.
      return null;
    }
  }

  if (recentPainPaths.length === 0) return null;

  // Deduplicate pain paths and label them as structured metadata (no PHI).
  const uniquePaths = [...new Set(recentPainPaths)];

  return {
    recentPainPaths: uniquePaths,
    // Safe challenge labels — templated metadata only, never user free-text.
    recentChallenges: uniquePaths.map((p) => painPathToLabel(p)),
    savedLibraryCount: 0, // TODO: Iteration Q2 — count scope=user_id rows in library tables
  };
}

/**
 * Format personalization context into a prompt block for the synthesizer.
 */
export function formatPersonalization(ctx: PersonalizationContext): string {
  const lines: string[] = [
    "The practitioner has recently worked on these AI-adoption areas:",
    ...ctx.recentPainPaths.map((p) => `- ${painPathToLabel(p)}`),
  ];

  if (ctx.savedLibraryCount > 0) {
    lines.push(
      `They have saved ${ctx.savedLibraryCount} library items for future reference.`,
    );
  }

  lines.push(
    "If your answer is relevant to one of these areas, acknowledge the connection briefly.",
  );

  return lines.join("\n");
}

// --- Helpers ---

function templateIdToPainPath(templateId: string): PainPath {
  // V1 templates map to approximations — not perfect but better than nothing.
  if (templateId === "capacity") return "capacity_growth";
  if (templateId === "admin-hire") return "admin";
  if (templateId === "pricing") return "follow_up"; // closest V1 proxy
  return "admin"; // safe default
}

function painPathToLabel(path: PainPath): string {
  const labels: Record<PainPath, string> = {
    referrals: "patient referrals and outreach",
    research: "clinical research and knowledge management",
    admin: "administrative workflows and scheduling",
    capacity_growth: "practice capacity and patient volume",
    follow_up: "patient follow-up and engagement",
    custom: "custom AI workflows",
  };
  return labels[path] ?? path;
}
