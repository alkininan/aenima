/**
 * design-spec.md §6 Morph, last paragraph — what moves a panel's anchor.
 *
 * "Any open panel closes, and reopens only by hand, when the viewport's *width* changes
 * or the orientation does — its anchor may have moved — and when the docked dock opens or
 * closes, which moves every anchor in the content column without a viewport change; a
 * height-only change (a collapsing browser toolbar, the software keyboard) leaves it open
 * and re-places it."
 *
 * Two signals, because they mean different things. A width or orientation change re-flows
 * the page, so the rect the panel was placed against is gone and §6 says the choice is
 * "made at open and held until close" — there is nothing to re-place *to*. A height-only
 * change is the browser's own chrome coming and going; the anchor has not moved, so the
 * panel stays and is re-placed against the shorter viewport.
 *
 * The dock's signal is a broadcast rather than a resize listener because the dock changes
 * no viewport dimension at all — it takes 380 out of the content column (§4), which moves
 * every anchor in it and is invisible to `resize`. The dock is T3.2's and does not exist
 * yet; `dockChanged()` is the seam it calls when it lands, and until then the browser
 * check drives it directly. That is the whole of the coupling: one function, no import
 * from the dock in either direction.
 */

export type ViewportState = {
  width: number;
  height: number;
  /** `screen.orientation.angle`, or 0 where the API is absent. */
  angle: number;
};

export type ViewportChange = "close" | "replace" | "none";

/** What an open panel should do about a viewport that has just changed. */
export function classifyViewportChange(prev: ViewportState, next: ViewportState): ViewportChange {
  if (prev.width !== next.width || prev.angle !== next.angle) return "close";
  if (prev.height !== next.height) return "replace";
  return "none";
}

type Listener = () => void;

const dockListeners = new Set<Listener>();

/**
 * The docked dock has opened or closed. Called by the dock; every open panel closes.
 *
 * Deliberately not a DOM event: a `CustomEvent` name is a string two modules have to
 * agree on with nothing checking that they do, and this is a same-process call.
 */
export function dockChanged(): void {
  // Copied first: a listener that unsubscribes itself while we are iterating would
  // otherwise mutate the set mid-loop.
  for (const listener of [...dockListeners]) listener();
}

/** Subscribes to the dock's signal. Returns the unsubscribe. */
export function subscribeDockChange(listener: Listener): () => void {
  dockListeners.add(listener);
  return () => {
    dockListeners.delete(listener);
  };
}

/** Test-only: the set is module state, so each test starts from empty. */
export function resetDockListeners(): void {
  dockListeners.clear();
}

/** The viewport as it is now. Reads `screen.orientation` where the engine has it. */
export function readViewport(): ViewportState {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    angle: window.screen?.orientation?.angle ?? 0,
  };
}
