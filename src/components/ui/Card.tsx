import type { ReactNode } from "react";

import { cardClasses, type CardPadding } from "./variants";

type CardProps = {
  /** §5 gives 16–20. 16 for a card among cards, 20 for one carrying prose. */
  padding?: CardPadding;
  /** §5: the border is optional. On when a card must separate from a card. */
  bordered?: boolean;
  /** Renders as `<section>` when given a heading id to point at. */
  labelledBy?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Card (design-spec.md §5) — `--surface-1`, `--r-sm`, padding 16–20, optional
 * `--glass-border`, and the inset edge highlight at 10%.
 *
 * **The edge is the part worth having a component for.** §0 law 5 makes the
 * specular line the signature, and a card's is the same gesture as glass at a
 * lower volume — 10% against glass's 16%. It is the one value in the recipe
 * that appears nowhere else, so a card assembled from utilities at each call
 * site is a card that quietly loses it.
 *
 * **Not glass.** §0 law 10 pins glass to the navigation layer; a card is
 * content, and content that floats muddies the hierarchy it was reached for.
 */
export function Card({
  padding = 16,
  bordered = false,
  labelledBy,
  children,
  className,
}: CardProps) {
  const classes = cardClasses({ padding, bordered, className });

  if (labelledBy) {
    return (
      <section aria-labelledby={labelledBy} className={classes}>
        {children}
      </section>
    );
  }

  return <div className={classes}>{children}</div>;
}
