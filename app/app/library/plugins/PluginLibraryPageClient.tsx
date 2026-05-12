"use client";

// PluginLibraryPageClient — filter chips + result list + detail drawer.
// Calm Precision: ink-only, single border around grouped list, status via text
// color, action buttons muted-until-dirty, no badges, no shadows beyond card.

import * as React from "react";
import type { PluginListItem, SkillListItem } from "@/lib/plugin-lib";
import { AssetDetailDrawer } from "@/components/plugin-lib/AssetDetailDrawer";

type ViewKind = "all" | "plugins" | "skills" | "mine";

interface Props {
  initialPlugins: PluginListItem[];
  initialSkills: SkillListItem[];
}

export function PluginLibraryPageClient({ initialPlugins, initialSkills }: Props) {
  const [plugins, setPlugins] = React.useState(initialPlugins);
  const [skills, setSkills] = React.useState(initialSkills);
  const [view, setView] = React.useState<ViewKind>("all");
  const [showHidden, setShowHidden] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [openAsset, setOpenAsset] = React.useState<
    { kind: "plugin"; id: string } | { kind: "skill"; id: string } | null
  >(null);

  const hiddenCount =
    plugins.filter((p) => p.isDismissed).length +
    skills.filter((s) => s.isDismissed).length;

  // Apply filters in-memory (the server-side fetch already returned the full
  // visible set including hidden rows).
  const filteredPlugins = React.useMemo(() => {
    let out = plugins;
    if (view === "skills") return [] as PluginListItem[];
    if (view === "mine") out = out.filter((p) => p.isMine);
    if (!showHidden) out = out.filter((p) => !p.isDismissed);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      out = out.filter(
        (p) =>
          p.title.toLowerCase().includes(qq) ||
          p.description.toLowerCase().includes(qq) ||
          p.slug.toLowerCase().includes(qq),
      );
    }
    return out;
  }, [plugins, view, showHidden, q]);

  const filteredSkills = React.useMemo(() => {
    let out = skills;
    if (view === "plugins") return [] as SkillListItem[];
    if (view === "mine") out = out.filter((s) => s.isMine);
    if (!showHidden) out = out.filter((s) => !s.isDismissed);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      out = out.filter(
        (s) =>
          s.title.toLowerCase().includes(qq) ||
          s.description.toLowerCase().includes(qq) ||
          s.slug.toLowerCase().includes(qq),
      );
    }
    return out;
  }, [skills, view, showHidden, q]);

  // Mutation helpers — re-fetch the full list after each action to stay in
  // sync. The endpoints return enough info to be smart, but a full refetch is
  // simpler + still cheap for ≤200 rows.
  const refresh = React.useCallback(async () => {
    const [pr, sr] = await Promise.all([
      fetch("/api/plugins?scope=all&include_hidden=1").then((r) => r.json()),
      fetch("/api/skills?scope=all&attached=all&include_hidden=1").then((r) =>
        r.json(),
      ),
    ]);
    setPlugins(pr.plugins ?? []);
    setSkills(sr.skills ?? []);
  }, []);

  return (
    <div>
      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={view === "all"} onClick={() => setView("all")}>
          All
        </Chip>
        <Chip active={view === "plugins"} onClick={() => setView("plugins")}>
          Plugins
        </Chip>
        <Chip active={view === "skills"} onClick={() => setView("skills")}>
          Skills
        </Chip>
        <Chip active={view === "mine"} onClick={() => setView("mine")}>
          My library
        </Chip>
        <Chip
          active={showHidden}
          onClick={() => setShowHidden((v) => !v)}
          subdued
        >
          Show hidden{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
        </Chip>
        <div className="ml-auto">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, description, slug"
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-[14px] text-text placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-ink min-w-[240px]"
            aria-label="Search plugins and skills"
          />
        </div>
      </div>

      {/* Empty state */}
      {filteredPlugins.length + filteredSkills.length === 0 && (
        <div className="rounded-md border border-line bg-paper p-6 text-center text-mute">
          <p className="text-[14px] mb-2">No assets match the current filters.</p>
          <p className="text-[13px]">
            Try clearing the search, switching to “All”, or toggling “Show hidden”.
          </p>
        </div>
      )}

      {/* Plugins section */}
      {filteredPlugins.length > 0 && (
        <Section title={`Plugins (${filteredPlugins.length})`}>
          {filteredPlugins.map((p, i) => (
            <Row
              key={p.id}
              isLast={i === filteredPlugins.length - 1}
              title={p.title}
              subtitle={p.description}
              meta={[
                p.isMine ? "Mine" : "Global",
                `${p.skillCount} skill${p.skillCount === 1 ? "" : "s"}`,
                p.isDismissed ? "Hidden" : null,
                p.forkedFromId ? `Forked from upstream v${p.upstreamVersion ?? "?"}` : null,
              ].filter(Boolean) as string[]}
              onOpen={() => setOpenAsset({ kind: "plugin", id: p.id })}
            />
          ))}
        </Section>
      )}

      {/* Skills section */}
      {filteredSkills.length > 0 && (
        <Section title={`Skills (${filteredSkills.length})`}>
          {filteredSkills.map((s, i) => (
            <Row
              key={s.id}
              isLast={i === filteredSkills.length - 1}
              title={s.title}
              subtitle={s.description}
              meta={[
                s.isMine ? "Mine" : "Global",
                s.pluginIds.length > 0
                  ? `Nested in ${s.pluginIds.length} plugin${s.pluginIds.length === 1 ? "" : "s"}`
                  : "Standalone",
                s.isDismissed ? "Hidden" : null,
                s.forkedFromId ? `Forked from upstream v${s.upstreamVersion ?? "?"}` : null,
              ].filter(Boolean) as string[]}
              onOpen={() => setOpenAsset({ kind: "skill", id: s.id })}
            />
          ))}
        </Section>
      )}

      {/* Detail drawer */}
      {openAsset && (
        <AssetDetailDrawer
          kind={openAsset.kind}
          id={openAsset.id}
          onClose={() => setOpenAsset(null)}
          onMutated={async () => {
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ---- Local UI primitives ---------------------------------------------------
// Inline to keep the patch self-contained. Tone matches Calm Precision baseline.

interface ChipProps extends React.HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  subdued?: boolean;
  children: React.ReactNode;
}

function Chip({ active, subdued, children, ...rest }: ChipProps) {
  const base =
    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors border";
  const styles = active
    ? "bg-ink text-paper border-ink"
    : subdued
      ? "bg-paper text-mute border-line hover:text-text"
      : "bg-paper text-text border-line hover:border-ink";
  return (
    <button type="button" className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="mb-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mute mb-2">
        {title}
      </h2>
      <div className="rounded-md border border-line bg-paper overflow-hidden">
        {children}
      </div>
    </section>
  );
}

interface RowProps {
  title: string;
  subtitle: string;
  meta: string[];
  isLast: boolean;
  onOpen: () => void;
}

function Row({ title, subtitle, meta, isLast, onOpen }: RowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left flex flex-col gap-1 px-4 py-3 hover:bg-bg focus:bg-bg focus:outline-none ${
        isLast ? "" : "border-b border-line"
      }`}
      style={{ minHeight: 44 }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-text">{title}</span>
        {meta.length > 0 && (
          <span className="text-[11px] text-mute whitespace-nowrap">
            {meta.join(" · ")}
          </span>
        )}
      </div>
      {subtitle && (
        <span className="text-[13px] text-mute line-clamp-2">{subtitle}</span>
      )}
    </button>
  );
}
