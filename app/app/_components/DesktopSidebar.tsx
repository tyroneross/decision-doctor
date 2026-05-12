"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Sparkles,
  ShieldCheck,
  Lock,
  Library,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { SignOutButton } from "./sign-out";

/**
 * Desktop sidebar (210px) — UI Guidelines v0.1 F3 left rail.
 *
 *   Brand "decision doctor" 20/700 ink
 *   Ledger summary "{N} hrs/wk back · {M} skills" 12/500 mute
 *   Section "WORKSPACE": Chat · Decisions · Skills · Audit
 *     Active item = text-ink font-medium + 2px left border
 *   Section "OPEN CASE": current case + recent list (server-passed)
 *   Footer: avatar + name + role + sign-out
 *
 *   Hidden < lg (mobile uses bottom nav).
 *
 * Server-rendered data is passed in as props (totalHrs, skillCount,
 * recentDecisions, openCase) so the sidebar stays a Client Component for
 * usePathname() while the layout fetches data server-side.
 */
export interface RecentDecisionLink {
  id: string;
  title: string;
}

export interface DesktopSidebarProps {
  email: string;
  initials: string;
  totalHrs: number;
  skillCount: number;
  recentDecisions: RecentDecisionLink[];
  openCase?: { id: string; title: string } | null;
  /** Layout passes guest=true when the request is in guest mode. Locked
   *  workspace items (Skills) get a muted/lock affordance and route to
   *  /sign-in with a hint param instead of silently 307'ing. */
  guest?: boolean;
}

type WorkspaceItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  match: (p: string) => boolean;
  /** True when this surface is user-scoped and unavailable in guest mode. */
  requiresAuth?: boolean;
};

const WORKSPACE: WorkspaceItem[] = [
  {
    href: "/app/chat",
    label: "Chat",
    icon: MessageSquare,
    match: (p) => p.startsWith("/app/chat"),
  },
  {
    href: "/app/learn",
    label: "Learn",
    icon: GraduationCap,
    match: (p) => p.startsWith("/app/learn"),
  },
  {
    href: "/app/history",
    label: "History",
    icon: FileText,
    match: (p) => p.startsWith("/app/history"),
  },
  {
    href: "/app/skills",
    label: "Skills",
    icon: Sparkles,
    match: (p) => p.startsWith("/app/skills"),
    requiresAuth: true,
  },
  {
    href: "/app/library/plugins",
    label: "Library",
    icon: Library,
    match: (p: string) => p.startsWith("/app/library"),
  },
  {
    href: "/app/audit",
    label: "Audit",
    icon: ShieldCheck,
    match: (p) => p.startsWith("/app/audit"),
  },
];

export function DesktopSidebar({
  email,
  initials,
  totalHrs,
  skillCount,
  recentDecisions,
  openCase,
  guest = false,
}: DesktopSidebarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      `Delete "${title}"? This can't be undone.`,
    );
    if (!ok) return;
    setPendingDelete(id);
    try {
      const res = await fetch(`/api/decisions/${id}`, { method: "DELETE" });
      if (res.status === 204) {
        // SSR refresh re-queries layout.tsx → drops the row.
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        console.warn("[sidebar] delete failed:", res.status, body);
        window.alert("Couldn't delete that decision. Please try again.");
      }
    } catch (err) {
      console.warn("[sidebar] delete error:", err);
      window.alert("Network error. Please try again.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <aside
      aria-label="Primary"
      className={
        "hidden lg:flex flex-col w-[210px] shrink-0 " +
        "bg-paper border-r border-line h-screen sticky top-0"
      }
    >
      {/* Brand + ledger summary */}
      <div className="px-4 pt-5 pb-4 border-b border-line">
        <Link
          href="/app"
          className="block text-[20px] font-bold leading-tight text-ink"
        >
          Aida
        </Link>
        {(totalHrs > 0 || skillCount > 0) && (
          <p className="mt-1 text-[12px] font-medium text-mute leading-snug">
            {totalHrs > 0 && <>{totalHrs} hrs/wk back</>}
            {totalHrs > 0 && skillCount > 0 && " · "}
            {skillCount > 0 && <>{skillCount} skills</>}
          </p>
        )}
      </div>

      {/* WORKSPACE */}
      <div className="px-2 pt-4 pb-2">
        <h2 className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
          Workspace
        </h2>
        <ul className="space-y-0.5">
          {WORKSPACE.map(({ href, label, icon: Icon, match, requiresAuth }) => {
            const active = match(pathname);
            const locked = guest && !!requiresAuth;
            const linkHref = locked
              ? `/sign-in?reason=${encodeURIComponent(label.toLowerCase())}`
              : href;
            return (
              <li key={href}>
                <Link
                  href={linkHref}
                  aria-current={active ? "page" : undefined}
                  title={locked ? `Sign in to use ${label}` : undefined}
                  aria-label={
                    locked ? `${label} · sign in required` : undefined
                  }
                  className={twMerge(
                    "relative flex items-center gap-2 px-3 py-2 rounded-md text-[14px] " +
                      "transition-colors",
                    active
                      ? "text-ink font-medium bg-line/30"
                      : "text-text hover:bg-line/30",
                    locked && "opacity-60"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-ink rounded-r"
                    />
                  )}
                  <Icon size={16} aria-hidden />
                  <span className="flex-1">{label}</span>
                  {locked && (
                    <Lock
                      size={12}
                      aria-hidden
                      className="text-mute"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* OPEN CASE */}
      <div className="px-2 pt-4 pb-2 border-t border-line">
        <h2 className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
          Open case
        </h2>
        {openCase ? (
          <div className="px-3 py-2 mb-1 rounded-md bg-line/30">
            <Link
              href={`/app/history/${openCase.id}`}
              className="block text-[13px] font-medium text-ink leading-snug line-clamp-2"
            >
              {openCase.title}
            </Link>
          </div>
        ) : (
          <p className="px-3 text-[12px] text-mute italic">no active case</p>
        )}
        {recentDecisions.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {recentDecisions.slice(0, 5).map((d) => {
              const isDeleting = pendingDelete === d.id;
              return (
                <li
                  key={d.id}
                  className={twMerge(
                    "group relative flex items-center rounded-md",
                    "hover:bg-line/30",
                    isDeleting && "opacity-50"
                  )}
                >
                  <Link
                    href={`/app/history/${d.id}`}
                    className="flex-1 min-w-0 px-3 py-1 text-[13px] text-mute hover:text-text leading-snug line-clamp-1"
                    title={d.title}
                  >
                    {d.title}
                  </Link>
                  {!guest && (
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id, d.title)}
                      disabled={isDeleting}
                      aria-label={`Delete decision: ${d.title}`}
                      title="Delete this decision"
                      className={twMerge(
                        "shrink-0 px-2 py-1 text-mute opacity-0",
                        "transition-opacity",
                        "group-hover:opacity-100 focus-visible:opacity-100",
                        "hover:text-red-600",
                        "disabled:cursor-not-allowed"
                      )}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-line p-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            title={email}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper text-[12px] font-semibold shrink-0"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text truncate">
              {email.split("@")[0]}
            </p>
            <p className="text-[11px] text-mute truncate">solo practice</p>
          </div>
        </div>
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
