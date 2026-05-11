"use client";

import * as React from "react";
import { twMerge } from "tailwind-merge";
import {
  Users,
  BookOpen,
  Inbox,
  BarChart3,
  Clock,
  Pencil,
} from "lucide-react";
import type { PainPath } from "@/lib/engine/types";

/**
 * PainCard — V2 U1.
 *
 * One selectable entry-point card for a specific pain path.
 * Theme-token only — zero per-pain colors, zero hex. Icon in text-mute.
 * Minimum tap target ≥44px on mobile (min-h-[44px] + p-4).
 *
 * Hierarchy:
 *   label     — 15px / 600 / text-ink
 *   oneLineHook — 12px / 500 / text-mute
 */
export interface PainCardProps {
  pathId: PainPath;
  label: string;
  oneLineHook: string;
  onClick: () => void;
}

const iconMap: Record<PainPath, React.ElementType> = {
  referrals: Users,
  research: BookOpen,
  admin: Inbox,
  capacity_growth: BarChart3,
  follow_up: Clock,
  custom: Pencil,
};

export function PainCard({ pathId, label, oneLineHook, onClick }: PainCardProps) {
  const Icon = iconMap[pathId];

  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        // Layout + sizing — min-h ensures ≥44px tap target
        "flex flex-col gap-2 min-h-[44px] w-full text-left",
        // Surface — theme tokens only
        "bg-paper border border-line rounded-xl p-4",
        // Interaction states
        "hover:border-ink",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20",
        "transition-[border-color] duration-150",
        "active:bg-line/20"
      )}
    >
      <Icon size={18} className="text-mute shrink-0" aria-hidden />
      <span className="text-[15px] font-semibold leading-snug text-ink">
        {label}
      </span>
      <span className="text-[12px] font-medium leading-snug text-mute">
        {oneLineHook}
      </span>
    </button>
  );
}
