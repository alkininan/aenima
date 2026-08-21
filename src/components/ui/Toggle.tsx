"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

import {
  CHECK_LABEL_CLASSES,
  CHECK_ROW_CLASSES,
  TOGGLE_THUMB_CLASSES,
  VISUALLY_HIDDEN_INPUT_CLASSES,
  toggleTrackClasses,
} from "./variants";

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Optional: a toggle in a settings row is often labelled by its heading. */
  label?: ReactNode;
};

/**
 * Toggle (design-spec.md §8) — 56×28 track, 2px inset, 24px thumb, `--t-fast`
 * on both track and thumb.
 *
 * `role="switch"` rather than a plain checkbox: the control reports on/off, not
 * checked/unchecked. The row grammar (10px gap, whole row clickable) is the
 * checkbox's — §8 states it there and the toggle sits in the same rows.
 */
export function Toggle({ label, className, ...rest }: ToggleProps) {
  return (
    <label className={cx(CHECK_ROW_CLASSES, className)}>
      <input type="checkbox" role="switch" className={VISUALLY_HIDDEN_INPUT_CLASSES} {...rest} />
      <span className={toggleTrackClasses()} aria-hidden="true">
        <span className={TOGGLE_THUMB_CLASSES} />
      </span>
      {label ? <span className={CHECK_LABEL_CLASSES}>{label}</span> : null}
    </label>
  );
}
