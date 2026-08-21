import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Spinner } from "./Spinner";
import {
  BUTTON_SPINNER_SIZE,
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./variants";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** §8: the spinner replaces the label and the width stays locked. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
};

/**
 * Pill button (design-spec.md §8). Sizes sm/md/lg, variants primary/soft/
 * secondary/ghost/danger. Press physics and interaction states come from
 * `.control` in globals.css.
 *
 * Danger is for destructive actions only, and §8 requires a confirm step
 * behind every one of them.
 */
export function Button({
  size = "md",
  variant = "primary",
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ size, variant, loading, fullWidth, className })}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={BUTTON_SPINNER_SIZE[size]} tone="inherit" />
        </span>
      ) : null}
      {/* Hidden rather than removed, so the button keeps its width while loading. */}
      <span className={cx("inline-flex items-center gap-[4px]", loading && "invisible")}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
}
