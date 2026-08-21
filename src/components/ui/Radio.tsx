"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

import {
  CHECK_LABEL_CLASSES,
  CHECK_ROW_CLASSES,
  RADIO_DOT_CLASSES,
  VISUALLY_HIDDEN_INPUT_CLASSES,
  checkBoxClasses,
} from "./variants";

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

/**
 * Radio (design-spec.md §8) — the checkbox grammar as a circle, with an 8px
 * `#0E0F11` dot when checked.
 *
 * Arrow-key movement inside a group is the browser's: native radios sharing a
 * `name` already walk with the arrow keys §11 asks for, and re-implementing it
 * would only take that behaviour away.
 */
export function Radio({ label, className, ...rest }: RadioProps) {
  return (
    <label className={cx(CHECK_ROW_CLASSES, className)}>
      <input type="radio" className={VISUALLY_HIDDEN_INPUT_CLASSES} {...rest} />
      <span className={checkBoxClasses("radio")} aria-hidden="true">
        <span className={RADIO_DOT_CLASSES} />
      </span>
      <span className={CHECK_LABEL_CLASSES}>{label}</span>
    </label>
  );
}
