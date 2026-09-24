/**
 * design-spec.md §11, and C-17's two clauses about Tab out of an open panel.
 *
 * §8.18: "Tab closes and carries focus to the stop after the trigger, Shift+Tab to the
 * one before." §8.5 says the same with a commit in front of it. Both need an answer to
 * one question the browser will not give us: where would Tab have gone, had the panel not
 * been in the way?
 *
 * It cannot be left to the platform. §6 puts the panel in the top layer and hides the
 * trigger for the panel's lifetime, so at the moment Tab is pressed focus is inside a
 * popover that sits outside the trigger's place in the document's order, and the trigger
 * is a stop nobody can see. A bare Tab from there lands wherever the top layer happens
 * to sit, which is not "the stop after the trigger" on any engine.
 *
 * So the order is read from the document: every stop in source order, the trigger's
 * position among them found by document position rather than by identity — the trigger
 * may be a wrapper that is not a stop at all.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The tab stop immediately after `trigger` in the document, or before it when
 * `backwards`. Null where there is none on that side.
 *
 * Stops inside the trigger are not answers: a select's own field sits inside the element
 * the panel was opened from, and Tab out of the panel means out of the whole control.
 */
export function tabStopAround(trigger: HTMLElement, backwards: boolean): HTMLElement | null {
  const doc = trigger.ownerDocument;
  const stops = Array.from(doc.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !trigger.contains(element),
  );

  if (backwards) {
    let found: HTMLElement | null = null;
    for (const stop of stops) {
      // Everything that precedes the trigger; the last such is the one before it.
      if (trigger.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_PRECEDING) found = stop;
    }
    return found;
  }

  for (const stop of stops) {
    if (trigger.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING) return stop;
  }
  return null;
}
