import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESEND_COOLDOWN_MS, formatCountdown, useCooldown } from "@/components/ui/useCooldown";

/** Drives the hook the way the resend control does: press, then let time pass. */
function cooling(durationMs?: number) {
  const view = renderHook(({ ms }) => useCooldown(ms), {
    initialProps: { ms: durationMs ?? RESEND_COOLDOWN_MS },
  });
  return {
    ...view,
    press: () => act(() => view.result.current.start()),
    wait: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
    active: () => view.result.current.active,
    clock: () => formatCountdown(view.result.current.remainingMs),
  };
}

/**
 * §8 (v2.10) resend cooldown, on the clock it is made of.
 *
 * Fake timers, for the same reason §8's validation pause uses them: the real
 * wait is a minute, and "still disabled at 59s" only means something if the
 * test decides where 59s is. Every wait below is exact — a cooldown that lifts
 * at 55s and one that lifts at 60s both pass a `waitFor`, and the difference is
 * the provider's rate limit.
 */
describe("useCooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts free, so a control is live until it is used", () => {
    const cooldown = cooling();

    expect(cooldown.active()).toBe(false);
  });

  it("disables the control at the tap, not at the reply", () => {
    const cooldown = cooling();

    cooldown.press();

    // No time advanced: the control is already cold. The gap between the press
    // and the server's answer is exactly where a second tap would land.
    expect(cooldown.active()).toBe(true);
    expect(cooldown.clock()).toBe("1:00");
  });

  it("counts down in its label", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(1000);
    expect(cooldown.clock()).toBe("0:59");

    // §8's own example: thirteen seconds in.
    cooldown.wait(12_000);
    expect(cooldown.clock()).toBe("0:47");
    expect(cooldown.active()).toBe(true);
  });

  it("stays disabled for the whole window, to the last second", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(RESEND_COOLDOWN_MS - 1000);

    expect(cooldown.active()).toBe(true);
    expect(cooldown.clock()).toBe("0:01");
  });

  it("re-enables at zero and returns the control to its normal label", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(RESEND_COOLDOWN_MS);

    expect(cooldown.active()).toBe(false);
    expect(cooldown.result.current.remainingMs).toBe(0);
  });

  it("stops ticking once it is spent", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(RESEND_COOLDOWN_MS);

    // The interval is cleared at zero rather than left running for the rest of
    // the step, doing nothing once a second.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts from the top on a second use, without stacking a second clock", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(RESEND_COOLDOWN_MS);
    cooldown.press();
    cooldown.wait(1000);

    expect(cooldown.clock()).toBe("0:59");
    // Two presses, one interval — a stacked second one would tick this down
    // twice as fast.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("clears its timer on unmount, so no tick fires into a dead control", () => {
    const cooldown = cooling();

    cooldown.press();
    cooldown.wait(1000);
    expect(vi.getTimerCount()).toBe(1);

    cooldown.unmount();

    expect(vi.getTimerCount()).toBe(0);
    // And nothing schedules itself afterwards.
    act(() => void vi.advanceTimersByTime(RESEND_COOLDOWN_MS));
    expect(vi.getTimerCount()).toBe(0);
  });

  /**
   * The clock rounds up. Down would show 0:00 on a control that is still
   * disabled, which reads as stuck rather than as counting.
   */
  it("never shows a zero clock while the control is still cold", () => {
    expect(formatCountdown(RESEND_COOLDOWN_MS)).toBe("1:00");
    expect(formatCountdown(59_001)).toBe("1:00");
    expect(formatCountdown(59_000)).toBe("0:59");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
