import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Card — UI Guidelines v0.1.
 *
 *   bg-paper border-line rounded-xl p-4 shadow-card
 *
 * The single canonical surface primitive. Use anywhere a content block
 * needs visual containment without the noise of individual borders on
 * every child (per Gestalt grouping rule: one border around the group,
 * dividers between).
 *
 * Renders as a plain <div>; pass `as` to switch the element (e.g. for
 * `<article>` or `<section>` semantics).
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Drop the default padding — for cards that own their own padding scheme. */
  flush?: boolean;
  /** Drop the shadow — for cards inside another card / sidebar. */
  flat?: boolean;
}

export function Card({
  flush,
  flat,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={twMerge(
        "bg-paper border border-line rounded-xl",
        !flush && "p-4",
        !flat && "shadow-card",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
