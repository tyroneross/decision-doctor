"use client";

// BackToParent — single back-arrow link with parent label.
//
// Calm Precision: subtle text-only chrome (no card, no background), 14px icon
// + 13px label, text-mute → text-ink on hover. Hidden on /app (the workspace
// root has no parent). Mapping is pathname-driven; dynamic [id] routes are
// matched via startsWith() before the static-route fallback.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface ParentLink {
  label: string;
  href: string;
}

/**
 * Resolve the parent link for a given pathname.
 * Returns null when the page should not show a back link (e.g. /app itself).
 *
 * Order matters: dynamic routes (matched via startsWith() with a non-suffix
 * tail) must be checked before their list parents so /app/history/[id] wins
 * over /app/history.
 */
function resolveParent(pathname: string): ParentLink | null {
  // Workspace root — no parent.
  if (pathname === "/app" || pathname === "/app/") return null;

  // Dynamic detail pages → their list (or home for guest-preview).
  if (pathname.startsWith("/app/history/") && pathname !== "/app/history") {
    return { label: "History", href: "/app/history" };
  }

  if (
    pathname.startsWith("/app/recommendations/") &&
    pathname !== "/app/recommendations"
  ) {
    // /app/recommendations/new and /app/recommendations/guest-preview both
    // come from the home composer — point back there. The /[id] detail page
    // is reached from /app/history (default) and routes there too.
    if (
      pathname === "/app/recommendations/new" ||
      pathname === "/app/recommendations/guest-preview"
    ) {
      return { label: "Home", href: "/app" };
    }
    // Anything else under /app/recommendations/* is a detail page.
    return { label: "History", href: "/app/history" };
  }

  // First-level pages → home.
  return { label: "Home", href: "/app" };
}

export function BackToParent() {
  const pathname = usePathname() ?? "";
  const parent = resolveParent(pathname);
  if (!parent) return null;

  return (
    <div className="px-5 pt-3 lg:px-8 lg:pt-4">
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1.5 min-h-[32px] text-[13px] font-medium text-mute hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-[14px] h-[14px]" aria-hidden="true" />
        <span>{parent.label}</span>
      </Link>
    </div>
  );
}
