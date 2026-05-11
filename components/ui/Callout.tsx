import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Callout — UI Guidelines v0.1.
 *
 *   bg-paper/60 border-l-[3px] border-ink rounded-r-lg p-3
 *
 * Used for "If this stops working" sub-card, system disclaimers,
 * inline notes inside chat. Always anchored on the left rule; never
 * uses a background tint other than paper.
 */
export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional small eyebrow above the body. */
  eyebrow?: React.ReactNode;
}

export function Callout({
  eyebrow,
  className,
  children,
  ...rest
}: CalloutProps) {
  return (
    <div
      className={twMerge(
        "bg-paper/60 border-l-[3px] border-ink rounded-r-lg p-3 text-[14px] leading-snug text-text",
        className
      )}
      {...rest}
    >
      {eyebrow && (
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink mb-1">
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  );
}
