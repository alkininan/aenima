"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

import { cx } from "@/lib/cx";

import {
  INPUT_CONTROL_CLASSES,
  INPUT_ICON_SLOT_CLASSES,
  INPUT_LABEL_CLASSES,
  inputFieldClasses,
  inputHelperClasses,
} from "./variants";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: string;
  helper?: string;
  /** §8 error: --danger border, helper flips to --danger. */
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Classes for the outer composite. `fieldClassName` targets the pill itself. */
  fieldClassName?: string;
  /**
   * Forwarded to the `<input>`. React 19 passes `ref` like any other prop, so
   * it rides along in `...rest` — composites built on this field (Select) need
   * it to put focus back where §11 says it belongs.
   */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Pill input with its label/helper composite (design-spec.md §8).
 * 52h field, label → 8 → field → 8 → helper.
 *
 * Validation timing is the caller's: §8 asks for validate-on-blur, then
 * re-validate on change once a field has errored — never on first keystroke.
 * This component only renders the state it is handed.
 */
export function Input({
  label,
  helper,
  invalid = false,
  leadingIcon,
  trailingIcon,
  className,
  fieldClassName,
  disabled = false,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = `${inputId}-helper`;

  return (
    <div className={cx("w-full", className)}>
      {label ? (
        <label htmlFor={inputId} className={INPUT_LABEL_CLASSES}>
          {label}
        </label>
      ) : null}

      <div className={inputFieldClasses({ invalid, disabled, className: fieldClassName })}>
        {leadingIcon ? <span className={INPUT_ICON_SLOT_CLASSES}>{leadingIcon}</span> : null}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={helper ? helperId : undefined}
          className={INPUT_CONTROL_CLASSES}
          {...rest}
        />
        {trailingIcon ? <span className={INPUT_ICON_SLOT_CLASSES}>{trailingIcon}</span> : null}
      </div>

      {helper ? (
        <span id={helperId} className={inputHelperClasses(invalid)}>
          {helper}
        </span>
      ) : null}
    </div>
  );
}
