/**
 * design-spec.md §6 Morph — the view transition, and nothing else about a panel.
 *
 * §6's own mechanism paragraph, condensed to what script has to do:
 *
 * - The morph is a same-document View Transition **on open only**. `startViewTransition`
 *   wraps the `showPopover()` call; the trigger carries `view-transition-name: morph` in
 *   the old state and the panel's material layer carries it in the new.
 * - "Names are set at open and cleared at `finished`, never left on elements between
 *   transitions — two live elements sharing a name abort every transition on the page."
 *   So the hand-over happens **inside** the update callback: before it the trigger owns
 *   the name, after it the panel does, and at no point do both.
 * - `--morph-r0` is half the trigger's height, set inline at open; the image-pair's
 *   border-radius keyframe runs from it to `--r-panel`. It is the one custom property the
 *   stylesheet does not declare, which is why C-03 excepts it by name.
 * - "One transition runs per document: a second open skips the first to its end state."
 * - "Every close path, the popover's `toggle` to closed included, calls `skipTransition()`
 *   on a running morph." Close is instant on every path; there is no close transition.
 * - "Where `startViewTransition` is absent, or under `prefers-reduced-motion`, the callback
 *   runs bare and the panel simply appears" — v2.17's behaviour. The morph is pure
 *   enhancement and can never be the reason a menu fails to open, which is why the update
 *   callback is the same function on both paths and carries everything that matters:
 *   `showPopover()` and the focus placement.
 *
 * The DOM work is written against the narrowest shape it needs — an object with a
 * `style` that sets and removes properties — so the name lifecycle, which is the part
 * that is subtle and invisible, is testable without a browser. C-14 checks the rest in a
 * real engine, where alone it means anything.
 */

/** §6: the name on the panel's material layer, and on the trigger in the old state. */
export const MORPH_NAME = "morph";

/** §6: "the contents carry a second name and fade in over the last `--t-fast` of the open". */
export const MORPH_CONTENT_NAME = "morph-content";

const NAME = "view-transition-name";

/** §6 sets this per instance at runtime; C-03 excepts it from the declared-token check. */
const R0 = "--morph-r0";

export type MorphElement = {
  style: {
    setProperty(property: string, value: string): void;
    removeProperty(property: string): void;
  };
};

export type ViewTransitionLike = {
  finished: Promise<unknown>;
  skipTransition: () => void;
};

export type MorphHost = {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

export type MorphPathInput = {
  hasViewTransition: boolean;
  reducedMotion: boolean;
  /** §17's kitchen-sink switch: force the bare open so both paths run in one engine. */
  forceFallback: boolean;
};

/** Which of §6's two open paths this open takes. */
export function morphPath({
  hasViewTransition,
  reducedMotion,
  forceFallback,
}: MorphPathInput): "transition" | "bare" {
  return hasViewTransition && !reducedMotion && !forceFallback ? "transition" : "bare";
}

export type RunMorphOptions = {
  trigger: MorphElement;
  /** The panel's material layer — the element that carries the glass and the radius. */
  panel: MorphElement;
  /** The panel's contents, which fade rather than stretch. Null where there are none. */
  content: MorphElement | null;
  /** §6: `--morph-r0` is half of this. */
  triggerHeight: number;
  /** `showPopover()` and the focus placement — everything the open actually is. */
  update: () => void;
  host?: MorphHost;
};

/** §6: "One transition runs per document." */
let running: ViewTransitionLike | null = null;

/**
 * Ends a morph that is still running, at once.
 *
 * §6: "The morph cannot reverse: closing during it ends it at once — every close path,
 * the popover's `toggle` to closed included, calls `skipTransition()` on a running morph."
 */
export function skipRunningMorph(): void {
  const current = running;
  running = null;
  current?.skipTransition();
}

/**
 * Opens a panel, morphing where §6 says to and bare where it says not to.
 *
 * `update` is called exactly once on either path — that is the enhancement guarantee.
 */
export function runMorph({
  trigger,
  panel,
  content,
  triggerHeight,
  update,
  host = typeof document === "undefined" ? {} : (document as MorphHost),
}: RunMorphOptions): void {
  const start = host.startViewTransition?.bind(host);

  if (!start) {
    update();
    return;
  }

  // A second open ends the first at its end state rather than queueing behind it.
  skipRunningMorph();

  // The old snapshot is taken when startViewTransition is called, so the trigger has to
  // own the name before that line and give it up inside the callback.
  trigger.style.setProperty(NAME, MORPH_NAME);
  panel.style.setProperty(R0, `${triggerHeight / 2}px`);

  const clear = () => {
    trigger.style.removeProperty(NAME);
    panel.style.removeProperty(NAME);
    panel.style.removeProperty(R0);
    content?.style.removeProperty(NAME);
  };

  const transition = start(() => {
    trigger.style.removeProperty(NAME);
    panel.style.setProperty(NAME, MORPH_NAME);
    content?.style.setProperty(NAME, MORPH_CONTENT_NAME);
    update();
  });

  running = transition;
  void Promise.resolve(transition.finished).then(
    () => {
      if (running === transition) running = null;
      clear();
    },
    // A skipped or aborted transition rejects; the names still have to come off, or the
    // next open finds two live elements holding one and aborts as well.
    () => {
      if (running === transition) running = null;
      clear();
    },
  );
}
