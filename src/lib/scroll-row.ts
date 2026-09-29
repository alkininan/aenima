/**
 * design-spec §4's 768 line — "tabs, the pipeline strip and tables scroll rather than
 * wrap" — and §8.19 / §8.26: "with the active tab scrolled into view", "with the active
 * segment in view, the same rule as tabs".
 *
 * The arithmetic is here, pure, so it is tested without a DOM; `revealActive` applies it to
 * a row. It scrolls the row alone, never the page: `scrollIntoView` on the active element
 * would also scroll the document toward it, and §6 lets no programmatic scroll touch the
 * page for a strip.
 */

export type ScrollRowInput = {
  /** The row's visible width. */
  listWidth: number;
  /** The row's whole content width. */
  scrollWidth: number;
  /** The active element's left edge and width, measured from the content's start. */
  activeLeft: number;
  activeWidth: number;
};

/**
 * The `scrollLeft` that centres the active element in a row that overflows, clamped to the
 * row's own range. Zero when nothing overflows: a row that fits scrolls nowhere.
 */
export function activeScrollLeft({
  listWidth,
  scrollWidth,
  activeLeft,
  activeWidth,
}: ScrollRowInput): number {
  const overflow = scrollWidth - listWidth;
  if (overflow <= 0) return 0;
  const centred = activeLeft + activeWidth / 2 - listWidth / 2;
  return Math.min(overflow, Math.max(0, centred));
}

/** Scrolls `list` so the element matching `selector` is in view. Nothing to do when it fits. */
export function revealActive(list: HTMLElement, selector: string): void {
  const active = list.querySelector<HTMLElement>(selector);
  if (!active) return;
  const listRect = list.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  list.scrollLeft = activeScrollLeft({
    listWidth: list.clientWidth,
    scrollWidth: list.scrollWidth,
    activeLeft: activeRect.left - listRect.left + list.scrollLeft,
    activeWidth: activeRect.width,
  });
}
