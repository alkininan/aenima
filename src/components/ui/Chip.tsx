import type { ButtonHTMLAttributes, ReactNode } from "react";

import { chipClasses, type ChipGapTone, type ChipVariant } from "./variants";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** `base` · `type-badge` (outline, never colourful) · `gap` (tone-carrying). */
  variant?: ChipVariant;
  /** §8 gap chips: open Must · open Should · accepted · excluded. */
  tone?: ChipGapTone;
  /** §8: interactive chips get hover + press, so they render as a button. */
  interactive?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
};

/**
 * Chip and badge (design-spec.md §8). 24h pill, ui-caption.
 *
 * Type badges stay outlined and neutral — §8 is explicit that types are
 * informative, never colourful. Gap chips carry the only tone a chip may have,
 * and never Danger red: §0 reserves red for destructive actions and validation.
 */
export function Chip({
  variant = "base",
  tone = "should",
  interactive = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ChipProps) {
  const classes = chipClasses({ variant, tone, interactive, className });
  const content = (
    <>
      {leadingIcon}
      {children}
      {trailingIcon}
    </>
  );

  if (!interactive) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <button type="button" className={classes} {...rest}>
      {content}
    </button>
  );
}
