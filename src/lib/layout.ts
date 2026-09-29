/**
 * design-spec.md §4 — the layout modes, the read-only line and the queries that decide them.
 *
 * The mode itself is CSS: the frame carries `--layout-mode` under Tailwind's `lg`, `xl` and
 * the `wide` variant (1024, 1280, 1440 CSS px), and the write gate hides under the read-only
 * queries before hydration. What lives here is the same arithmetic for the one reader that is
 * script — `useMediaQuery` over `matchMedia` — and for the tests, so a breakpoint is written
 * as a number in exactly two places that a test can compare: the stylesheet and this file.
 *
 * §7: "Pointer rules are gated by `@media (hover: hover) and (pointer: fine)`; touch is
 * everything else, at any width." §4: the read-only line is 768 on touch and 600 on pointer,
 * "because a 200% zoom on a 1280 laptop is 640 wide and is not a phone (§13)".
 */

export type LayoutMode = "wide" | "standard" | "desk" | "hand";

/** §4's table: wide ≥1440 · standard 1280–1439 · desk 1024–1279 · hand <1024. */
export const BREAKPOINTS = { wide: 1440, standard: 1280, desk: 1024 } as const;

export function modeFor(width: number): LayoutMode {
  if (width >= BREAKPOINTS.wide) return "wide";
  if (width >= BREAKPOINTS.standard) return "standard";
  if (width >= BREAKPOINTS.desk) return "desk";
  return "hand";
}

/** §4: below this the product is read-only — every `data-writes` control absent. */
export const READ_ONLY_LINE = { pointer: 600, touch: 768 } as const;

/** §4's "768 line": below it modals and sheets are bottom sheets, tabs and the strip scroll. */
export const COMPONENT_LINE = 768;

export function isReadOnly(width: number, pointer: boolean): boolean {
  return width < (pointer ? READ_ONLY_LINE.pointer : READ_ONLY_LINE.touch);
}

/** §7's one pointer gate. Everything that does not match it is touch. */
export const POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/** Where the sidebar stands and the top bar does not (§4: the top bar replaces it below 1024). */
export const SIDEBAR_QUERY = `(min-width: ${BREAKPOINTS.desk}px)`;

/** The width half of the read-only line, per input kind; combined with `POINTER_QUERY` in script. */
export const READ_ONLY_QUERY = {
  pointer: `(max-width: ${READ_ONLY_LINE.pointer - 1}px)`,
  touch: `(max-width: ${READ_ONLY_LINE.touch - 1}px)`,
} as const;

/**
 * C-45's three paints, as `performance.mark` names: the chrome (the frame, and the page
 * topbar on every route), the content column's skeleton, and its data-bound content.
 * `PaintMark` writes them and `e2e/budget.spec.ts` reads them.
 */
export const PAINT_MARKS = {
  chrome: "aenima:chrome",
  skeleton: "aenima:skeleton",
  content: "aenima:content",
} as const;

export type PaintMarkName = (typeof PAINT_MARKS)[keyof typeof PAINT_MARKS];
