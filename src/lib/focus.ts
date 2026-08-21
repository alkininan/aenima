/**
 * Focus containment — design-spec.md §11: "focus trapped inside modals; on
 * close, focus returns to the opener."
 *
 * DOM helpers rather than React, so the trap can be exercised directly.
 */

/** Everything Tab can reach. `[hidden]` and negative tabindex are excluded. */
const FOCUSABLE = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Where Tab should land next inside a trap.
 *
 * Returns undefined when the browser's own tab order is already correct — i.e.
 * the move stays inside the container — so the handler only intervenes at the
 * two ends, and at the point where focus has escaped the container entirely.
 */
export function nextTrapTarget(
  focusable: readonly HTMLElement[],
  active: Element | null,
  backwards: boolean,
): HTMLElement | undefined {
  if (focusable.length === 0) return undefined;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const index = active instanceof HTMLElement ? focusable.indexOf(active) : -1;

  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === focusable.length - 1) return first;
  return undefined;
}
