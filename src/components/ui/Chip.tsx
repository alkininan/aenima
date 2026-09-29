import Link from "next/link";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { splitAround } from "@/lib/chip-label";

import { chipClasses, chipFillClasses, type ChipGapTone, type ChipVariant } from "./variants";

type ChipProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** `base` · `soft` · `type-badge` (outline, never colourful) · `gap` (tone-carrying). */
  variant?: ChipVariant;
  /** §8.9 gap chips: open Must · open Should · accepted · excluded. */
  tone?: ChipGapTone;
  /** §8: interactive chips get hover + press, so they render as a button. */
  interactive?: boolean;
  /**
   * §8.27: the row's gap chip "is a link to the item page with the check list expanded".
   * With a destination the chip is an `<a>` carrying the interactive states.
   */
  href?: string;
  /** §2 Dimming: the fill at .60 on a layer of its own, the text at its tone. */
  dimmed?: boolean;
  tabIndex?: number;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
};

/**
 * Chip and badge (design-spec.md §8.9). 24h pill, ui-caption.
 *
 * Type badges stay outlined and neutral — §8.9 is explicit that types are
 * informative, never colourful. Gap chips carry the only tone a chip may have,
 * and never Danger red: §0 reserves red for destructive actions and validation.
 *
 * **Dimmed, the fill is a layer.** §2: "Dimming never takes text below AA … applies
 * opacity .60 to its non-text parts only — accent, meters, dots, chip fills." Opacity on
 * the chip would dim its words too, so a dimmed chip keeps its text tone and paints the
 * fill — or an outlined chip its outline — on an `aria-hidden` span beneath the text.
 */
export function Chip({
  variant = "base",
  tone = "should",
  interactive = false,
  href,
  dimmed = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ChipProps) {
  const classes = chipClasses({
    variant,
    tone,
    interactive: interactive || href !== undefined,
    dimmed,
    className,
  });
  const content = (
    <>
      {dimmed ? <span aria-hidden="true" className={chipFillClasses({ variant, tone })} /> : null}
      {leadingIcon}
      {children}
      {trailingIcon}
    </>
  );

  if (href !== undefined) {
    // The element attributes a chip takes are the link's own; `LinkProps` spells its
    // optionals without `undefined`, which `exactOptionalPropertyTypes` holds it to.
    const linkRest = rest as Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {content}
      </Link>
    );
  }

  if (!interactive) {
    return (
      <span className={classes} {...rest}>
        {content}
      </span>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {content}
    </button>
  );
}

/**
 * §8.9's "Must · {check id}" — "the id in mono-readout" inside the ui-caption chip. The
 * dictionary formats §12's one string; this splits it around the id wherever the locale
 * put it, and renders the label whole when it does not carry the id at all.
 */
export function ChipIdLabel({ label, id }: { label: string; id: string }) {
  const parts = splitAround(label, id);
  if (parts === null) return <>{label}</>;
  return (
    <>
      {parts.before}
      <span className="type-mono-readout">{id}</span>
      {parts.after}
    </>
  );
}
