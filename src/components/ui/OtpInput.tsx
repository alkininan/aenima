"use client";

import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cx } from "@/lib/cx";

import {
  OTP_BOX_COUNT,
  OTP_GROUP_CLASSES,
  otpBoxClasses,
  inputHelperClasses,
  INPUT_LABEL_CLASSES,
} from "./variants";

type OtpInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Fired once the last box is filled, so the form can submit itself. */
  onComplete?: (value: string) => void;
  label: string;
  helper?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
};

const DIGITS = /^\d+$/;

/**
 * Six-box one-time code (design-spec.md §8) — 52×52 boxes, radius 27, gap 16,
 * special-otp centred, and a `--prime` border once a box is filled.
 *
 * One `<input>` per box rather than one field styled to look like six: it is
 * what `autocomplete="one-time-code"` expects, so iOS and Android offer the
 * code from the message, and it is what a password manager can fill.
 *
 * The keyboard behaviour is the part people notice — typing advances, Backspace
 * on an empty box steps back and clears the previous one, arrows walk (§11),
 * and pasting a whole code from a mail client fills every box at once instead
 * of dropping five characters.
 */
export function OtpInput({
  value,
  onValueChange,
  onComplete,
  label,
  helper,
  invalid = false,
  disabled = false,
  autoFocus = false,
  className,
}: OtpInputProps) {
  const groupId = useId();
  const helperId = `${groupId}-helper`;
  const boxesRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = value.padEnd(OTP_BOX_COUNT, " ").slice(0, OTP_BOX_COUNT).split("");

  const focusBox = (index: number) => {
    const clamped = Math.max(0, Math.min(OTP_BOX_COUNT - 1, index));
    boxesRef.current[clamped]?.focus();
    boxesRef.current[clamped]?.select();
  };

  const commit = (next: string) => {
    const trimmed = next.slice(0, OTP_BOX_COUNT);
    onValueChange(trimmed);
    if (trimmed.length === OTP_BOX_COUNT) onComplete?.(trimmed);
  };

  const setDigit = (index: number, digit: string) => {
    const chars = value.padEnd(OTP_BOX_COUNT, " ").split("");
    chars[index] = digit;
    commit(chars.join("").trimEnd());
  };

  const onChange = (index: number, raw: string) => {
    // A soft keyboard can deliver several characters to one box at once.
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;

    if (incoming.length > 1) {
      const chars = value.padEnd(OTP_BOX_COUNT, " ").split("");
      for (let i = 0; i < incoming.length && index + i < OTP_BOX_COUNT; i += 1) {
        chars[index + i] = incoming[i] ?? " ";
      }
      commit(chars.join("").trimEnd());
      focusBox(index + incoming.length);
      return;
    }

    setDigit(index, incoming);
    focusBox(index + 1);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]?.trim()) {
        setDigit(index, " ");
        return;
      }
      // Empty box: step back and clear the one behind it, which is what people
      // expect from a row of boxes and what a single field would do naturally.
      setDigit(index - 1, " ");
      focusBox(index - 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusBox(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusBox(OTP_BOX_COUNT - 1);
    }
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted || !DIGITS.test(pasted)) return;

    event.preventDefault();
    const chars = value.padEnd(OTP_BOX_COUNT, " ").split("");
    for (let i = 0; i < pasted.length && index + i < OTP_BOX_COUNT; i += 1) {
      chars[index + i] = pasted[i] ?? " ";
    }
    commit(chars.join("").trimEnd());
    focusBox(index + pasted.length);
  };

  return (
    <div className={cx("w-full", className)}>
      <span id={groupId} className={INPUT_LABEL_CLASSES}>
        {label}
      </span>

      <div className={OTP_GROUP_CLASSES} role="group" aria-labelledby={groupId}>
        {Array.from({ length: OTP_BOX_COUNT }, (_, index) => {
          const digit = digits[index]?.trim() ?? "";
          return (
            <input
              key={index}
              ref={(node) => {
                boxesRef.current[index] = node;
              }}
              type="text"
              inputMode="numeric"
              // Only the first box carries it, or browsers fill all six with
              // the same digit.
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={OTP_BOX_COUNT}
              value={digit}
              disabled={disabled}
              autoFocus={autoFocus && index === 0}
              aria-label={`${label} ${index + 1}`}
              aria-invalid={invalid || undefined}
              aria-describedby={helper ? helperId : undefined}
              className={otpBoxClasses({ filled: digit.length > 0, invalid })}
              onChange={(event) => onChange(index, event.target.value)}
              onKeyDown={(event) => onKeyDown(index, event)}
              onPaste={(event) => onPaste(index, event)}
              onFocus={(event) => event.target.select()}
            />
          );
        })}
      </div>

      {helper ? (
        <span id={helperId} className={inputHelperClasses(invalid)}>
          {helper}
        </span>
      ) : null}
    </div>
  );
}
