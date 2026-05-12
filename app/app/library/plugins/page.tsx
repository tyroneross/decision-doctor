// app/app/library/plugins/page.tsx — C5: Plugin & Skill Library landing.
//
// SSR: requires auth (Plugin & Skill Library is an authed surface).
// Fetches initial visible plugins + skills via the helper module.
// Client takes over for filter chips, detail drawer, fork/download/learn-more.

import "server-only";
import * as React from "react";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { runWithActor } from "@/lib/db/actor";
import { listPlugins, listSkills } from "@/lib/plugin-lib";
import { PluginLibraryPageClient } from "./PluginLibraryPageClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PluginsLibraryPage() {
  const actor = await getSessionActor();
  if (!actor) {
    redirect("/auth/signin?next=/app/library/plugins");
  }

  const [plugins, skills] = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () => {
      const [p, s] = await Promise.all([
        listPlugins({
          scope: "all",
          userId: actor.userId,
          includeHidden: true, // client filters; we want full list for the toggle
        }),
        listSkills({
          scope: "all",
          userId: actor.userId,
          attached: "all",
          includeHidden: true,
        }),
      ]);
      return [p, s];
    },
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-h1 sm:text-h1-lg text-text mb-1">
          Plugin & Skill Library
        </h1>
        <p className="text-[14px] text-mute">
          Browse, fork, edit, and download reusable AI assets. Forks become your own
          editable copies. Hide rows you don&apos;t want to see.
        </p>
      </header>
      <PluginLibraryPageClient initialPlugins={plugins} initialSkills={skills} />
    </div>
  );
}
