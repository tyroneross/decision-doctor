"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, FileText, Sparkles, ShieldCheck, User, Lock } from "lucide-react";
import { twMerge } from "tailwind-merge";

/**
 * Mobile bottom 5-tab nav — UI Guidelines v0.1.
 *
 *   Search · History · Skills · Audit · Account
 *   52px high. Active tab = text-ink + 2px top border. Others = text-mute.
 *   Hidden ≥ lg (desktop uses the left sidebar instead).
 *
 * Guest mode: tabs whose route is user-scoped (currently /app/skills) render
 * with a lock affordance — muted opacity, lock icon overlay, and a title
 * tooltip explaining sign-in is required. Click still routes (sign-in flow
 * picks up the saving-requires-sign-in hint via ?reason=skills); the visual
 * treatment alone makes the gating predictable.
 */
type Tab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  match: (p: string) => boolean;
  /** When true, this tab requires a real account; locked for guests. */
  requiresAuth?: boolean;
};

const TABS: Tab[] = [
  { href: "/app", label: "Search", icon: Search, match: (p) => p === "/app" },
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
    href: "/app/audit",
    label: "Audit",
    icon: ShieldCheck,
    match: (p) => p.startsWith("/app/audit"),
  },
  {
    href: "/app/account",
    label: "Account",
    icon: User,
    match: (p) => p.startsWith("/app/account"),
  },
];

export interface MobileBottomNavProps {
  guest?: boolean;
}

export function MobileBottomNav({ guest = false }: MobileBottomNavProps) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary"
      className={
        "lg:hidden fixed bottom-0 inset-x-0 z-40 h-[52px] " +
        "bg-paper border-t border-line " +
        "grid grid-cols-5 items-stretch"
      }
    >
      {TABS.map(({ href, label, icon: Icon, match, requiresAuth }) => {
        const active = match(pathname);
        const locked = guest && !!requiresAuth;
        // Locked tabs route to sign-in with a hint param so the sign-in
        // page can show "saving requires sign-in" context. Non-locked
        // tabs use their normal href.
        const linkHref = locked
          ? `/sign-in?reason=${encodeURIComponent(label.toLowerCase())}`
          : href;
        return (
          <Link
            key={href}
            href={linkHref}
            title={locked ? `Sign in to use ${label}` : undefined}
            aria-label={
              locked ? `${label} — sign in required` : undefined
            }
            className={twMerge(
              "relative flex flex-col items-center justify-center gap-0.5 " +
                "text-[11px] font-medium transition-colors",
              active ? "text-ink" : "text-mute hover:text-text",
              locked && "opacity-60"
            )}
            aria-current={active ? "page" : undefined}
          >
            {/* 2px top border on active */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-ink"
              />
            )}
            <span className="relative inline-flex">
              <Icon size={18} aria-hidden />
              {locked && (
                <Lock
                  size={10}
                  aria-hidden
                  className="absolute -right-1.5 -bottom-1 bg-paper rounded-full p-[1px]"
                />
              )}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
