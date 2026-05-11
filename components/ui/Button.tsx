import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Button — UI Guidelines v0.1.
 *
 * Variants:
 *  - primary   : bg-ink text-paper border-ink (terracotta fill, paper text)
 *  - secondary : bg-paper text-ink border-ink
 *  - ghost     : transparent, text-ink, no border, hover bg-line/40
 *
 * Per spec: 9px 16px padding, 10px radius, 14px / 600 type.
 * No gradient. No coral shadow. Single shadow-card on primary only.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Full-width — use for conversion CTAs (sign-in, send magic link, "Use these →"). */
  full?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] " +
  "px-4 py-[9px] text-[14px] font-semibold leading-none " +
  "transition-[background-color,border-color,color] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-paper border border-ink hover:bg-ink/90 active:bg-ink shadow-card",
  secondary:
    "bg-paper text-ink border border-ink hover:bg-line/40 active:bg-line/60",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-line/40",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", full, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        className={twMerge(base, variants[variant], full && "w-full", className)}
        {...rest}
      />
    );
  }
);
