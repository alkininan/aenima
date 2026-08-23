"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

import {
  INPUT_CONTROL_CLASSES,
  INPUT_ICON_SLOT_CLASSES,
  INPUT_LABEL_CLASSES,
  INPUT_LEADING_ICON_CLASSES,
  inputCompositeClasses,
  inputFieldClasses,
  inputHelperClasses,
  type InputHelperTone,
} from "./variants";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** §13: always rendered, always bound. Never stands in for a placeholder. */
  label: string;
  /** §8: validation outcome only. Instructions belong in the subtitle slot. */
  helper?: string | undefined;
  /** Tone of the helper line. `invalid` is the shorthand for the error tone. */
  helperTone?: InputHelperTone | undefined;
  /** §8 error: --danger border, helper flips to --danger. */
  invalid?: boolean | undefined;
  /**
   * §8: reserve one helper line under any field that can produce a state.
   * Off only for a field that can never produce one.
   */
  reserveHelper?: boolean | undefined;
  /**
   * §8 exemption — Search and the chat composer are labelled by context, so
   * they keep a resting placeholder and reserve no label zone. The `<label>`
   * still exists and is still bound; it is only visually hidden.
   *
   * This is also the only way to get a visible `placeholder` onto a field:
   * while it is true, the one this component renders is the sentinel.
   */
  floatingLabel?: boolean | undefined;
  leadingIcon?: ReactNode | undefined;
  trailingIcon?: ReactNode | undefined;
  /**
   * Rendered in the pill's own positioning context — Select's panel. It exists
   * so a floating layer can measure its §8 8px stand-off from the field itself
   * rather than from the composite, whose reserved label zone and helper line
   * would otherwise be in the way.
   */
  fieldOverlay?: ReactNode | undefined;
  /** Classes for the outer composite. `fieldClassName` targets the pill itself. */
  fieldClassName?: string | undefined;
  /**
   * Forwarded to the `<input>`. React 19 passes `ref` like any other prop, so
   * it rides along in `...rest` — composites built on this field (Select) need
   * it to put focus back where §11 says it belongs.
   */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Pill field with its floating label and state line (design-spec.md §8, v2.5).
 *
 * 48h field · label zone 24h above it, always reserved · helper line 18h below,
 * reserved by default. Nothing in the composite changes height between states,
 * which is the whole point: focusing a field or failing validation must not
 * move the page.
 *
 * The label is a real `<label>` at every moment, at rest and floated (§13). It
 * is not swapped for a placeholder and it is not re-rendered across the
 * animation — it moves. The at-rest position is `--n-secondary`, never
 * `--n-placeholder`: placeholder tone fails AA by design and may not carry
 * information, and a field's name is information.
 *
 * Which state the label is in is decided in CSS from `:placeholder-shown` and
 * `:focus`, so there is no "has value" prop to keep in sync and a browser
 * autofill floats the label without telling React anything. That is why a
 * floating-label field always carries a placeholder — a single space, which
 * paints nothing and makes "empty" expressible as a selector.
 *
 * §8 (v2.5): a field shows one text, ever — its label. Format hints are
 * abolished, so a caller's `placeholder` is honoured only on the §8-exempt
 * fields, where it is the resting name. On every other field it is replaced by
 * the sentinel: the rule is enforced here rather than trusted to call sites,
 * because one hint slipping through is invisible until someone reads the page.
 *
 * Validation timing is the caller's — §8's flag-slow/clear-fast clock lives in
 * `useFieldValidation`. This component only renders the state it is handed.
 */
export function Input({
  label,
  helper,
  helperTone,
  invalid = false,
  reserveHelper = true,
  floatingLabel = true,
  leadingIcon,
  trailingIcon,
  fieldOverlay,
  className,
  fieldClassName,
  disabled = false,
  id,
  placeholder,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = `${inputId}-helper`;
  const tone: InputHelperTone | undefined = helper ? (helperTone ?? "error") : undefined;

  return (
    <div
      className={inputCompositeClasses({
        floatingLabel,
        leadingIcon: Boolean(leadingIcon),
        className,
      })}
    >
      <div className="relative">
        <div className={inputFieldClasses({ invalid, disabled, className: fieldClassName })}>
          {leadingIcon ? <span className={INPUT_LEADING_ICON_CLASSES}>{leadingIcon}</span> : null}
          <input
            id={inputId}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={helper ? helperId : undefined}
            className={INPUT_CONTROL_CLASSES}
            // A space, not "": `:placeholder-shown` is how the label knows it
            // is at rest, and "" does not match it.
            placeholder={floatingLabel ? " " : placeholder}
            {...rest}
          />
          {trailingIcon ? <span className={INPUT_ICON_SLOT_CLASSES}>{trailingIcon}</span> : null}
        </div>
        {fieldOverlay}
      </div>

      {/* After the pill in the DOM so the pill wins the click, absolutely
          positioned over it. Order here is not reading order — the label is
          bound by `for`, which is what the accessibility tree follows. */}
      <label htmlFor={inputId} className={floatingLabel ? INPUT_LABEL_CLASSES : "sr-only"}>
        {label}
      </label>

      {reserveHelper || helper ? (
        <span id={helperId} className={inputHelperClasses(tone, reserveHelper)}>
          {helper}
        </span>
      ) : null}
    </div>
  );
}
