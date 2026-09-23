/**
 * design-spec.md §6 Morph — the placement rule, as arithmetic.
 *
 * §6 states it once: "a panel grows downward, and toward the side with more room, unless
 * its own height does not fit below the trigger's top edge; then it grows upward. If it
 * fits neither way it opens toward the larger side with max-height equal to that room less
 * 8. The choice is made at open and held until close."
 *
 * It lives here rather than in the component because §6 requires **two** implementations
 * of it — CSS anchor positioning where the engine has it, a JS positioner where it does
 * not — and "the two must be pixel-identical". A rule written twice is a rule that can
 * disagree with itself; this module is the one that the JS positioner runs and that the
 * browser check compares the anchor-positioned rect against.
 *
 * The measurement that is easy to get wrong: the downward room is measured from the
 * trigger's **top** edge, not its bottom. The panel grows *out of* the trigger and covers
 * it (§6: the trigger is `visibility: hidden` for the panel's lifetime), so the box the
 * panel needs starts where the trigger starts. Measuring from the bottom would flip
 * panels upward that have room to open down.
 */

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };

/** §6: "max-height equal to that room less 8" — the same 8 every floating layer stands off by. */
export const PANEL_VIEWPORT_GAP = 8;

export type PlacePanelOptions = {
  trigger: Rect;
  /** The panel's own size — its intrinsic height before any clamp. */
  panel: Size;
  viewport: Viewport;
  /** A component's own ceiling, e.g. §8.5's 320 for a select. */
  maxHeight?: number | undefined;
};

export type Placement = {
  side: "below" | "above";
  top: number;
  left: number;
  /** What the panel may actually use. Never more than the room it was given. */
  maxHeight: number;
};

/**
 * Where a panel opens, in viewport coordinates.
 *
 * Returns the top-left the JS positioner writes and the max-height the panel takes. The
 * caller adds the scroll offset if it is positioning in document rather than viewport
 * space; a popover is in the top layer, which is viewport-fixed, so it does not.
 */
export function placePanel({ trigger, panel, viewport, maxHeight }: PlacePanelOptions): Placement {
  const wanted = maxHeight === undefined ? panel.height : Math.min(panel.height, maxHeight);

  // §6 measures down from the trigger's top edge and up from its bottom: both are the
  // edge the panel's own box starts from on that side.
  const roomBelow = viewport.height - trigger.top;
  const roomAbove = trigger.top + trigger.height;

  let side: "below" | "above";
  let height: number;

  if (wanted <= roomBelow) {
    side = "below";
    height = wanted;
  } else if (wanted <= roomAbove) {
    side = "above";
    height = wanted;
  } else {
    // Neither side fits: the larger one, less the 8 stand-off.
    side = roomBelow >= roomAbove ? "below" : "above";
    height = (side === "below" ? roomBelow : roomAbove) - PANEL_VIEWPORT_GAP;
  }

  const top = side === "below" ? trigger.top : trigger.top + trigger.height - height;

  // Horizontally the same shape: rightward from the trigger's left edge, leftward from
  // its right edge, toward whichever has more room.
  const roomRight = viewport.width - trigger.left;
  const roomLeft = trigger.left + trigger.width;
  const unclamped = roomRight >= roomLeft ? trigger.left : trigger.left + trigger.width - panel.width;

  // A last guard, which §6 does not state: a panel wider than the room on the side it
  // chose would otherwise hang off the viewport. Clamping cannot move it off the other
  // edge, since the panel is never wider than the viewport in practice, and where it is
  // the left edge wins.
  const left = Math.max(0, Math.min(unclamped, viewport.width - panel.width));

  return { side, top, left, maxHeight: height };
}
