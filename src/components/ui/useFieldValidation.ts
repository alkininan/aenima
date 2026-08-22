"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** §8: a field never errors under this many characters — blur included. */
export const VALIDATION_MIN_LENGTH = 3;
/** §8: while typing, a flag waits for this much quiet. */
export const VALIDATION_PAUSE_MS = 1500;

export type UseFieldValidationOptions = {
  /** The field's current value. The hook reacts to it; it never owns it. */
  value: string;
  /** Returns the message to show, or null when the value is acceptable. */
  validate: (value: string) => string | null;
  minLength?: number;
  pauseMs?: number;
};

export type FieldValidation = {
  /** The message to hand the field's helper slot, or null. */
  error: string | null;
  /** Wire to the field's `onBlur`. */
  onBlur: () => void;
  /**
   * Submit. Validates regardless of length or pause and returns whether the
   * value passed, so the caller can stop a submit on false.
   */
  validateNow: () => boolean;
  /** Drop any message and any pending flag — a step change, a reset. */
  clear: () => void;
};

/**
 * §8 validation timing, v2.5: **flag slow, clear fast.**
 *
 * The asymmetry is the whole design. Being told you are wrong while still
 * typing the thing is the complaint this replaces, so a flag waits — for three
 * characters before it will speak at all, then for a 1.5s pause in typing. But
 * an error that outlives the mistake is its own annoyance, so clearing does not
 * wait for anything: the instant the value becomes acceptable, the message is
 * gone.
 *
 * The floor is a length, not a "touched" flag, because "leaving an untouched
 * field is not a mistake" — and a field holding `a@` is as untouched, in the
 * sense that matters, as one holding nothing. Blur is immediate above the
 * floor and silent below it.
 *
 * Submit is the one caller that ignores both the floor and the pause: §8 has it
 * validate everything and surface the first error, which is the moment an empty
 * required field does have to speak.
 *
 * The sign-in email field is the first consumer; every form after it is the
 * real customer, which is why the clock lives here and not in that form.
 */
export function useFieldValidation({
  value,
  validate,
  minLength = VALIDATION_MIN_LENGTH,
  pauseMs = VALIDATION_PAUSE_MS,
}: UseFieldValidationOptions): FieldValidation {
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read through a ref so a caller passing an inline arrow — which every caller
  // does, because the message is usually an i18n lookup — does not restart the
  // pause on each render. Taking `validate` as a dependency instead would reset
  // the 1.5s clock on every render the parent happens to do, which is the one
  // thing this hook exists to avoid.
  //
  // Synced in an effect rather than during render, and declared *above* the
  // effect that reads it: effects run in declaration order within a commit, so
  // the timer below always sees the current render's validator.
  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  });

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    cancel();

    const tooShort = value.length < minLength;
    const message = tooShort ? null : validateRef.current(value);

    // Clear fast: below the floor, or once the value is acceptable, the
    // message goes now — no pause, no waiting for blur.
    if (message === null) {
      setError(null);
      return;
    }

    // Flag slow: the message is real, but it waits out the typing.
    timer.current = setTimeout(() => {
      timer.current = null;
      setError(message);
    }, pauseMs);

    return cancel;
  }, [value, minLength, pauseMs, cancel]);

  // A pending flag must not fire into an unmounted field.
  useEffect(() => cancel, [cancel]);

  const onBlur = useCallback(() => {
    cancel();
    // Leaving a field you never really filled is not a mistake.
    setError(value.length < minLength ? null : validateRef.current(value));
  }, [value, minLength, cancel]);

  const validateNow = useCallback(() => {
    cancel();
    const message = validateRef.current(value);
    setError(message);
    return message === null;
  }, [value, cancel]);

  const clear = useCallback(() => {
    cancel();
    setError(null);
  }, [cancel]);

  return { error, onBlur, validateNow, clear };
}
