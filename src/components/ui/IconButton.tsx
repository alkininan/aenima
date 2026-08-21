import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "./Spinner";
import {
  BUTTON_SPINNER_SIZE,
  iconButtonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./variants";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Accessible name. An icon-only control has no visible label to fall back on. */
  label: string;
  icon: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  loading?: boolean;
};

/**
 * Square icon button (design-spec.md §8) — the pill button's grammar at
 * 28/34/48 square, same variants and same press physics.
 */
export function IconButton({
  label,
  icon,
  size = "md",
  variant = "primary",
  loading = false,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={iconButtonClasses({ size, variant, loading, className })}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={BUTTON_SPINNER_SIZE[size]} tone="inherit" /> : icon}
    </button>
  );
}
