import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VALIDATION_MIN_LENGTH,
  VALIDATION_PAUSE_MS,
  useFieldValidation,
} from "@/components/ui/useFieldValidation";

const TOO_SHORT = "That doesn't look like an email address yet.";

/** Anything with an `@` and a dot after it passes — enough to have a boundary. */
const validate = (value: string) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : TOO_SHORT);

/** Drives the hook the way a controlled field does: rerender with a new value. */
function typeInto(initial = "") {
  const view = renderHook(({ value }) => useFieldValidation({ value, validate }), {
    initialProps: { value: initial },
  });
  return {
    ...view,
    type: (value: string) => act(() => view.rerender({ value })),
    wait: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
    error: () => view.result.current.error,
  };
}

/**
 * §8 validation timing (v2.5) — flag slow, clear fast.
 *
 * These are clock assertions, so they run on fake timers: the real 1.5s pause
 * would make the suite wait for it, and "does not flag yet" is only meaningful
 * if the test controls where "yet" is. Every wait below is exact — a pause that
 * fires at 1.4s and a pause that fires at 1.6s both pass a `waitFor`, and the
 * difference between them is the whole rule.
 */
describe("useFieldValidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never flags below the three-character floor, however long the pause", () => {
    const field = typeInto();

    field.type("a@");
    field.wait(VALIDATION_PAUSE_MS * 4);

    // Two characters is not a mistake, it is an unfinished thought.
    expect("a@".length).toBeLessThan(VALIDATION_MIN_LENGTH);
    expect(field.error()).toBeNull();
  });

  it("stays quiet in the middle of the pause", () => {
    const field = typeInto();

    field.type("a@b");
    field.wait(VALIDATION_PAUSE_MS - 1);

    expect(field.error()).toBeNull();
  });

  it("flags once the typing stops for the full pause", () => {
    const field = typeInto();

    field.type("a@b");
    field.wait(VALIDATION_PAUSE_MS);

    expect(field.error()).toBe(TOO_SHORT);
  });

  it("restarts the pause on every keystroke, so a slow typist is never flagged", () => {
    const field = typeInto();

    // Each keystroke lands just before the previous pause would have fired.
    for (const value of ["a@b", "a@bc", "a@bcd", "a@bcde"]) {
      field.type(value);
      field.wait(VALIDATION_PAUSE_MS - 1);
      expect(field.error()).toBeNull();
    }
  });

  it("clears the instant the value becomes valid — no pause on the way out", () => {
    const field = typeInto();

    field.type("a@b");
    field.wait(VALIDATION_PAUSE_MS);
    expect(field.error()).toBe(TOO_SHORT);

    // Not one tick of the clock is advanced between the keystroke and the check.
    field.type("a@b.co");
    expect(field.error()).toBeNull();
  });

  it("clears when the value falls back below the floor", () => {
    const field = typeInto();

    field.type("a@b");
    field.wait(VALIDATION_PAUSE_MS);
    expect(field.error()).toBe(TOO_SHORT);

    field.type("a");
    expect(field.error()).toBeNull();
  });

  it("flags immediately on blur, without waiting out the pause", () => {
    const field = typeInto();

    field.type("a@b");
    act(() => field.result.current.onBlur());

    expect(field.error()).toBe(TOO_SHORT);
  });

  it("says nothing on blur when the field is empty or short", () => {
    const field = typeInto();

    act(() => field.result.current.onBlur());
    expect(field.error()).toBeNull();

    field.type("a@");
    act(() => field.result.current.onBlur());
    expect(field.error()).toBeNull();
  });

  it("drops a pending flag when blur finds the value already valid", () => {
    const field = typeInto();

    field.type("a@b.co");
    act(() => field.result.current.onBlur());
    field.wait(VALIDATION_PAUSE_MS * 2);

    expect(field.error()).toBeNull();
  });

  // Submit is the exception to the floor: an empty required field does have to
  // speak the moment someone tries to send the form.
  it("validates an empty field on submit and reports failure to the caller", () => {
    const field = typeInto();

    let passed = true;
    act(() => {
      passed = field.result.current.validateNow();
    });

    expect(passed).toBe(false);
    expect(field.error()).toBe(TOO_SHORT);
  });

  it("passes submit through on a valid value", () => {
    const field = typeInto("a@b.co");

    let passed = false;
    act(() => {
      passed = field.result.current.validateNow();
    });

    expect(passed).toBe(true);
    expect(field.error()).toBeNull();
  });

  it("clears message and pending flag together", () => {
    const field = typeInto();

    field.type("a@b");
    act(() => field.result.current.clear());
    field.wait(VALIDATION_PAUSE_MS * 2);

    expect(field.error()).toBeNull();
  });

  // A pause that outlives the field would flag into nothing, or warn.
  it("cancels a pending flag on unmount", () => {
    const field = typeInto();

    field.type("a@b");
    field.unmount();

    expect(() => vi.advanceTimersByTime(VALIDATION_PAUSE_MS * 2)).not.toThrow();
  });
});
