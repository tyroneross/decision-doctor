"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Sparkles,
  ShieldCheck,
  Library,
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
}

const WORKSPACE = [
  {
    href: "/app/chat",
    label: "Chat",
    icon: MessageSquare,
    match: (p: string) => p.startsWith("/app/chat"),
  },
  {
    href: "/app/history",
    label: "History",
    icon: FileText,
    match: (p: string) => p.startsWith("/app/history"),
  },
  {
    href: "/app/skills",
    label: "Skills",
    icon: Sparkles,
    match: (p: string) => p.startsWith("/app/skills"),
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
    match: (p: string) => p.startsWith("/app/audit"),
  },
];

export function DesktopSidebar({
  email,
  initials,
  totalHrs,
  skillCount,
  recentDecisions,
  openCase,
}: DesktopSidebarProps) {
  const pathname = usePathname() ?? "";

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
          decision doctor
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
          {WORKSPACE.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={twMerge(
                    "relative flex items-center gap-2 px-3 py-2 rounded-md text-[14px] " +
                      "transition-colors",
                    active
                      ? "text-ink font-medium bg-line/30"
                      : "text-text hover:bg-line/30"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-ink rounded-r"
                    />
                  )}
                  <Icon size={16} aria-hidden />
                  <span>{label}</span>
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
            {recentDecisions.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/history/${d.id}`}
                  className="block px-3 py-1 rounded-md text-[13px] text-mute hover:bg-line/30 hover:text-text leading-snug line-clamp-1"
                  title={d.title}
                >
                  {d.title}
                </Link>
              </li>
            ))}
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
