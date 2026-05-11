import * as React from "react";
import { twMerge } from "tailwind-merge";

/**
 * Input — UI Guidelines v0.1.
 *
 * - bg-paper, border-line, rounded-[10px], 14/400 type
 * - focus: border-ink + 3px ring at ink/12
 * - 44px minimum tap target on mobile (handled by padding)
 *
 * Accepts a `label` prop that, when set, renders a properly associated
 * <label> + <input> pair. Otherwise renders just <input> (parent owns
 * the label semantics).
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Sub-label / hint shown beneath the input. */
  hint?: string;
  /** Inline error text — switches border to bad and announces error. */
  error?: string;
}

const fieldClass =
  "block w-full rounded-[10px] bg-paper border border-line " +
  "px-3.5 py-2.5 text-[14px] leading-snug text-text " +
  "placeholder:text-mute placeholder:font-normal " +
  "transition-[border-color,box-shadow] duration-150 " +
  "focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/15 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, hint, error, id, className, ...rest }, ref) {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-1.5 text-[12px] font-medium text-mute"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={twMerge(
            fieldClass,
            error && "border-red-700 focus:border-red-700 focus:ring-red-700/15",
            className
          )}
          {...rest}
        />
        {hint && !error && (
          <p id={hintId} className="mt-1 text-[12px] text-mute leading-snug">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-[12px] text-red-700 leading-snug"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
