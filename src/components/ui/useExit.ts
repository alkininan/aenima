"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * design-spec.md §6 — how a surface leaves.
 *
 * "Every exit runs one step faster than its entrance, on `--ease`: a `--t-slow` entrance
 * leaves over `--t-med`, a `--t-med` entrance over `--t-fast` — the morphed panel
 * excepted, which leaves in one frame. Exits never spring. **A top-layer element leaves
 * the top layer the moment it is hidden, so the code applies the leaving state, waits for
 * `transitionend`, then hides** — the `overlay` property that would hold it there is not
 * in the baseline, and neither is transitioning `display` with `allow-discrete`, which
 * Firefox does not do."
 *
 * That last sentence is why this hook exists rather than a CSS-only exit. React unmounts
 * the moment `open` goes false; there is nothing left to transition. So the surface stays
 * mounted in a `leaving` state until its transition ends, and only then goes.
 *
 * §6 also asks for interruptibility — "a reversal mid-flight starts from where the surface
 * is" — which falls out: reopening clears the leaving state and the same transition runs
 * back from wherever the surface had got to.
 */

/**
 * How long this element's exit actually takes, in ms — the longest of its transitions and
 * animations, delay included, and 0 where there are none.
 *
 * Asking rather than assuming is what keeps the hook honest in the two cases where there
 * is nothing to wait for: `prefers-reduced-motion`, which §6 answers by making every
 * slide "appear in place" (C-15), and a DOM emulator, which has no style engine at all. In
 * both the surface should leave on the frame it was dismissed, and a hook that waited
 * anyway would hold a dismissed toast on the page for half a second for no reason.
 */
function exitDuration(node: HTMLElement): number {
  const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
  if (!style) return 0;

  // A computed duration is in seconds in every engine, but a DOM emulator hands back what
  // was authored, so the unit is read rather than assumed.
  const seconds = (value: string) =>
    value
      .split(",")
      .map((part) => {
        const amount = Number.parseFloat(part) || 0;
        return part.trim().endsWith("ms") ? amount / 1000 : amount;
      })
      .reduce((longest, one) => Math.max(longest, one), 0);

  const transition = seconds(style.transitionDuration) + seconds(style.transitionDelay);
  const animation = seconds(style.animationDuration) + seconds(style.animationDelay);
  return Math.max(transition, animation) * 1000;
}

export type ExitTransitionOptions = {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
};

export type ExitTransitionState = {
  /** Whether to render at all: true while open, and while the exit is running. */
  present: boolean;
  /** Whether the surface is on its way out, for the leaving state's styles. */
  leaving: boolean;
};

export function useExitTransition({ open, ref }: ExitTransitionOptions): ExitTransitionState {
  const [leaving, setLeaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  /**
   * Adjusted during render, not in an effect, and that is load-bearing rather than tidy:
   * an effect answers one render late, so on the render where `open` turns true the
   * surface would not be there yet — and a caller's own mount-time work, the modal's
   * focus trap above all, runs against a container that does not exist and never runs
   * again. React sanctions this shape for exactly this: state derived from a prop that
   * changed, adjusted in the component that owns it, before anything is returned. It is
   * state rather than a ref for the same reason a ref would not do: a ref written during
   * render is invisible to React's own bookkeeping, which is what the lint rule is about.
   */
  if (wasOpen !== open) {
    setWasOpen(open);
    setLeaving(!open);
  }

  const present = open || leaving;

  useLayoutEffect(() => {
    if (!leaving) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(false);
    };

    const node = ref.current;

    // Nothing is running, so there is nothing to wait for. A layout effect, so this lands
    // before the browser paints the frame the surface was supposed to have left on.
    const duration = node ? exitDuration(node) : 0;
    if (!node || duration === 0) {
      finish();
      return;
    }

    // Either event: §6's exits are transitions, but a surface that arrived on a keyframe
    // animation leaves on one too, and neither is worth a second hook.
    node.addEventListener("transitionend", finish);
    node.addEventListener("animationend", finish);
    // The floor under an exit that was declared and then did not fire — an interrupted
    // frame, a surface scrolled out of view: the exit's own measured duration and one
    // frame past it. Measured, never a literal, since §6 keeps script timers out of
    // components (C-05).
    let frame = 0;
    const fallback = setTimeout(() => {
      frame = requestAnimationFrame(finish);
    }, duration);

    return () => {
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
      node.removeEventListener("transitionend", finish);
      node.removeEventListener("animationend", finish);
    };
  }, [leaving, ref]);

  return { present, leaving };
}
