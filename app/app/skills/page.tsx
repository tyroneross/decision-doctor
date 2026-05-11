// app/app/skills/page.tsx — U4: Real skills catalog (replaces stub).
//
// SSR: fetches user-scoped library_skills + library_plugins via getUserSkills()
// and getUserPlugins() from lib/library/index.ts.
//
// Auth-gated: guests are redirected to sign-in (artifacts are user-scoped only).
// Empty state: clear call-to-action pointing back to recommendations.

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionActor } from "@/lib/auth-session";
import { getUserSkills, getUserPlugins } from "@/lib/library";
import type { LibrarySkill, LibraryPlugin } from "@/lib/library";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
// TODO: Iteration 2 — extract SkillCard/PluginCard to client components for copy-to-clipboard.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date | string): string {
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function painPathLabel(path: string): string {
  const labels: Record<string, string> = {
    referrals: "Referrals",
    research: "Research",
    admin: "Admin",
    capacity_growth: "Capacity growth",
    follow_up: "Follow-up",
    custom: "Custom",
  };
  return labels[path] ?? path;
}

// ---------------------------------------------------------------------------
// Skill card
// ---------------------------------------------------------------------------

function SkillCard({ skill }: { skill: LibrarySkill }) {
  const sourceRecId =
    typeof skill.sourceRecommendationId === "string"
      ? skill.sourceRecommendationId
      : null;

  return (
    <article
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Kind + pain path labels */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--mute)" }}
            >
              🛠️ Skill
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--mute)" }}
            >
              · {painPathLabel(skill.painPath)}
            </span>
            <span
              className="text-[11px] italic"
              style={{ color: "var(--mute)" }}
            >
              · draft
            </span>
          </div>

          {/* Title */}
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {skill.title}
          </h3>

          {/* Description from metadata */}
          {typeof (skill.metadata as Record<string, unknown>)?.description === "string" && (
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: "var(--mute)" }}
            >
              {(skill.metadata as Record<string, unknown>).description as string}
            </p>
          )}

          {/* Source recommendation link */}
          {sourceRecId && (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--mute)" }}>
              Source:{" "}
              <Link
                href={`/app/recommendations/${sourceRecId}`}
                className="underline decoration-current underline-offset-2 hover:opacity-70"
                style={{ color: "var(--ink)" }}
              >
                View recommendation →
              </Link>
            </p>
          )}

          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--mute)" }}
          >
            Created {formatDate(skill.createdAt)}
          </p>
        </div>

        {/* Actions — static in SSR; copy interactivity added in future client wrapper */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="inline-flex items-center rounded-[10px] border px-3 py-[9px] text-[12px] font-semibold leading-none"
            style={{ borderColor: "var(--ink)", color: "var(--ink)", backgroundColor: "var(--paper)" }}
            aria-label={`Install skill: ${skill.title}`}
          >
            Install skill
          </span>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Plugin card
// ---------------------------------------------------------------------------

function PluginCard({ plugin }: { plugin: LibraryPlugin }) {
  const sourceRecId =
    typeof plugin.sourceRecommendationId === "string"
      ? plugin.sourceRecommendationId
      : null;

  const meta = plugin.metadata as Record<string, unknown>;
  const isPromptKind = meta?.sourceKind === "prompt" || meta?.sourceKind === "checklist";

  return (
    <article
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Kind + pain path labels */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--mute)" }}
            >
              {isPromptKind ? "📋 Prompt" : "🧩 Plugin"}
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--mute)" }}
            >
              · {painPathLabel(plugin.painPath)}
            </span>
            <span
              className="text-[11px] italic"
              style={{ color: "var(--mute)" }}
            >
              · draft
            </span>
          </div>

          {/* Title */}
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {plugin.title}
          </h3>

          {/* Description from metadata */}
          {typeof meta?.description === "string" && (
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: "var(--mute)" }}
            >
              {meta.description as string}
            </p>
          )}

          {/* Source recommendation link */}
          {sourceRecId && (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--mute)" }}>
              Source:{" "}
              <Link
                href={`/app/recommendations/${sourceRecId}`}
                className="underline decoration-current underline-offset-2 hover:opacity-70"
                style={{ color: "var(--ink)" }}
              >
                View recommendation →
              </Link>
            </p>
          )}

          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--mute)" }}
          >
            Created {formatDate(plugin.createdAt)}
          </p>
        </div>

        {/* Actions — static in SSR; copy interactivity added in future client wrapper */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="inline-flex items-center rounded-[10px] border px-3 py-[9px] text-[12px] font-semibold leading-none"
            style={{ borderColor: "var(--ink)", color: "var(--ink)", backgroundColor: "var(--paper)" }}
            aria-label={`View ${isPromptKind ? "prompt" : "plugin"}: ${plugin.title}`}
          >
            {isPromptKind ? "View prompt" : "View plugin"}
          </span>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <Card className="py-10 text-center">
      <p
        className="text-[16px] font-medium"
        style={{ color: "var(--ink)" }}
      >
        No skills or plugins yet
      </p>
      <p
        className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--mute)" }}
      >
        You haven&apos;t promoted any tasks to skills or plugins yet. Find a
        recommendation and pick a rung from the adoption pathway.
      </p>
      <div className="mt-5">
        <Link href="/app/recommendations/new">
          <Button variant="primary">Get a recommendation →</Button>
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SkillsPage() {
  const actor = await getSessionActor();
  if (!actor) {
    redirect("/sign-in");
  }

  const [skills, plugins] = await Promise.all([
    getUserSkills(actor.userId, actor.tenantId),
    getUserPlugins(actor.userId, actor.tenantId),
  ]);

  const hasContent = skills.length > 0 || plugins.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 lg:px-8 lg:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1
          className="text-[20px] font-bold"
          style={{ color: "var(--ink)" }}
        >
          Your skills &amp; plugins
        </h1>
        <Link href="/app/recommendations/new">
          <Button variant="secondary" className="text-[13px]">
            New recommendation
          </Button>
        </Link>
      </div>

      {!hasContent ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Skills section */}
          {skills.length > 0 && (
            <section>
              <p
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--mute)" }}
              >
                YOUR SKILLS · {skills.length}
              </p>
              <div className="space-y-3">
                {skills.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} />
                ))}
              </div>
            </section>
          )}

          {/* Plugins section */}
          {plugins.length > 0 && (
            <section>
              <p
                className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--mute)" }}
              >
                YOUR PLUGINS · {plugins.length}
              </p>
              <div className="space-y-3">
                {plugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
