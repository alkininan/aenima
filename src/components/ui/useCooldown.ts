"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** §8 (v2.10): a resend disables itself for this long after each use. */
export const RESEND_COOLDOWN_MS = 60_000;

/** The label counts in seconds, so the clock is read once a second. */
const TICK_MS = 1000;

/**
 * The m:ss clock §8 puts inside the label — "Send a new code (0:47)".
 *
 * Rounds up, so the first second reads 1:00 rather than 0:59 and the last one
 * reads 0:01 rather than 0:00. A control still disabled while showing 0:00 is
 * the one frame that would make the countdown look stuck.
 */
export function formatCountdown(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type Cooldown = {
  /** Milliseconds left; 0 once the control is free again. */
  remainingMs: number;
  /** Whether the control is still cooling down. */
  active: boolean;
  /** Start, or restart, the cooldown. */
  start: () => void;
};

/**
 * §8 (v2.10) resend cooldown: a control that cannot succeed yet is disabled,
 * never merely apologised for.
 *
 * The clock is a deadline plus a tick, not a counter the tick decrements. A
 * counter is wrong by however long the tab spent in the background — browsers
 * throttle intervals in hidden tabs, so sixty ticks are not sixty seconds — and
 * matching the provider's real window is the entire job here. Reading the clock
 * on every tick instead makes a late tick harmless: the label is derived from
 * the deadline, never accumulated towards it.
 *
 * The hook owns the clock and nothing else. What the control says while it runs
 * is the caller's, because the string is an i18n lookup and §12 reserves +30%
 * width for TR/NL — the parenthetical does not sit in the same place in every
 * language, so it cannot be assembled here.
 */
export function useCooldown(durationMs: number = RESEND_COOLDOWN_MS): Cooldown {
  const [remainingMs, setRemainingMs] = useState(0);
  const deadline = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    // Restarting replaces the old deadline rather than stacking a second
    // interval on top of it.
    stop();
    deadline.current = Date.now() + durationMs;
    setRemainingMs(durationMs);
    timer.current = setInterval(() => {
      const left = Math.max(0, deadline.current - Date.now());
      setRemainingMs(left);
      // Nothing left to count: stop before the next tick rather than idling an
      // interval for the rest of the step.
      if (left === 0) stop();
    }, TICK_MS);
  }, [durationMs, stop]);

  // A tick must never fire into an unmounted control.
  useEffect(() => stop, [stop]);

  return { remainingMs, active: remainingMs > 0, start };
}
