"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { CheckboxTickIcon } from "./icons";
import {
  CHECK_LABEL_CLASSES,
  CHECK_ROW_CLASSES,
  VISUALLY_HIDDEN_INPUT_CLASSES,
  checkBoxClasses,
} from "./variants";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
};

/**
 * Checkbox (design-spec.md §8) — 20×20, radius 6, `--prime` fill with a
 * `#0E0F11` tick when checked, press physics, whole row clickable.
 *
 * The native input stays in the DOM and keeps every browser behaviour that
 * comes with it (labelling, form participation, space to toggle); the visible
 * box is a sibling that reads the input's state through `:has()`, so the
 * control works uncontrolled as readily as controlled.
 */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(CHECK_ROW_CLASSES, className)}>
      <input type="checkbox" className={VISUALLY_HIDDEN_INPUT_CLASSES} {...rest} />
      <span className={checkBoxClasses("checkbox")} aria-hidden="true">
        <CheckboxTickIcon className="size-full opacity-0 group-has-[:checked]:opacity-100" />
      </span>
      <span className={CHECK_LABEL_CLASSES}>{label}</span>
    </label>
  );
}
