"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, FileText, Sparkles, ShieldCheck, User } from "lucide-react";
import { twMerge } from "tailwind-merge";

/**
 * Mobile bottom 5-tab nav — UI Guidelines v0.1.
 *
 *   Search · Decisions · Skills · Audit · Account
 *   52px high. Active tab = text-ink + 2px top border. Others = text-mute.
 *   Hidden ≥ lg (desktop uses the left sidebar instead).
 */
const TABS = [
  { href: "/app", label: "Search", icon: Search, match: (p: string) => p === "/app" },
  {
    href: "/app/decisions",
    label: "Decisions",
    icon: FileText,
    match: (p: string) => p.startsWith("/app/decisions"),
  },
  {
    href: "/app/skills",
    label: "Skills",
    icon: Sparkles,
    match: (p: string) => p.startsWith("/app/skills"),
  },
  {
    href: "/app/audit",
    label: "Audit",
    icon: ShieldCheck,
    match: (p: string) => p.startsWith("/app/audit"),
  },
  {
    href: "/app/account",
    label: "Account",
    icon: User,
    match: (p: string) => p.startsWith("/app/account"),
  },
];

export function MobileBottomNav() {
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
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={twMerge(
              "relative flex flex-col items-center justify-center gap-0.5 " +
                "text-[11px] font-medium transition-colors",
              active ? "text-ink" : "text-mute hover:text-text"
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
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
