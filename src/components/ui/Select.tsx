"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cx } from "@/lib/cx";
import { nextRovingIndex } from "@/lib/roving";
import { TYPEAHEAD_RESET_MS, matchTypeahead } from "@/lib/typeahead";

import { Input } from "./Input";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { useEscapeLayer, useOutsideDismiss, usePanelPlacement } from "./useLayer";
import {
  INPUT_LABEL_CLASSES,
  PANEL_MAX_HEIGHT,
  inputHelperClasses,
  panelClasses,
  panelRowClasses,
  type PanelPlacement,
} from "./variants";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  options: readonly SelectOption[];
  /** Null renders the placeholder. */
  value: string | null;
  onValueChange: (value: string) => void;
  label?: ReactNode;
  helper?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Select (design-spec.md §8) — the trigger is the T0.2 pill field with a
 * trailing chevron (20); the panel is `--surface-1` at radius 12 on the
 * dropdown shadow, 36h option rows, `--surface-3` on hover, `--prime-soft` plus
 * a 16px check on the selected row, max-height 320 with inner scroll, opening
 * above when there is less than 320px of room below.
 *
 * Built as an ARIA combobox over a read-only field rather than a native
 * `<select>`: a native select cannot be given §8's panel. Focus therefore stays
 * on the trigger and the active row is named by `aria-activedescendant`, which
 * is what lets §11's arrow keys and type-to-jump work without moving focus into
 * a list the user would then have to Tab back out of.
 */
export function Select({
  options,
  value,
  onValueChange,
  label,
  helper,
  placeholder,
  invalid = false,
  disabled = false,
  className,
}: SelectProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const helperId = `${baseId}-helper`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const buffer = useRef("");
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement>("below");
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const isDisabled = useCallback((index: number) => options[index]?.disabled === true, [options]);

  const measurePlacement = usePanelPlacement(rootRef, PANEL_MAX_HEIGHT);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    buffer.current = "";
  }, []);

  // §11: on close, focus returns to the opener — here, the trigger it never
  // really left.
  const closeAndFocus = useCallback(() => {
    close();
    inputRef.current?.focus();
  }, [close]);

  const openPanel = useCallback(
    (index: number) => {
      setPlacement(measurePlacement(true));
      setOpen(true);
      setActiveIndex(index);
    },
    [measurePlacement],
  );

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onValueChange(option.value);
      closeAndFocus();
    },
    [closeAndFocus, onValueChange, options],
  );

  useEscapeLayer({ open, kind: "popover", onClose: closeAndFocus });
  useOutsideDismiss({ open, refs: [rootRef], onDismiss: close });

  // Keep the keyboard cursor in view inside the 320px scroll box.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = listRef.current?.children[activeIndex];
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  useEffect(() => {
    return () => {
      if (bufferTimer.current !== null) clearTimeout(bufferTimer.current);
    };
  }, []);

  const jump = useCallback(
    (char: string) => {
      buffer.current += char;
      if (bufferTimer.current !== null) clearTimeout(bufferTimer.current);
      bufferTimer.current = setTimeout(() => {
        buffer.current = "";
      }, TYPEAHEAD_RESET_MS);

      const from = activeIndex >= 0 ? activeIndex : selectedIndex;
      const match = matchTypeahead(
        buffer.current,
        options.map((option) => option.label),
        from,
      );
      if (match === null || isDisabled(match)) return;

      if (open) setActiveIndex(match);
      else openPanel(match);
    },
    [activeIndex, isDisabled, open, openPanel, options, selectedIndex],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    // Tab leaves the field, so the panel goes with it — §11 keeps Tab moving in
    // visual order rather than cycling inside a popover.
    if (event.key === "Tab") {
      if (open) close();
      return;
    }

    const walked = nextRovingIndex({
      key: event.key,
      current: activeIndex,
      count: options.length,
      isDisabled,
    });
    if (walked !== null) {
      event.preventDefault();
      if (open) setActiveIndex(walked);
      else openPanel(activeIndex >= 0 ? walked : selectedIndex >= 0 ? selectedIndex : walked);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openPanel(selectedIndex);
      else if (activeIndex >= 0) commit(activeIndex);
      return;
    }

    // §8: type-to-jump. Single printable characters only, so shortcuts survive.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      jump(event.key);
    }
  };

  return (
    <div className={cx("w-full", className)}>
      {label ? (
        <label htmlFor={inputId} className={INPUT_LABEL_CLASSES}>
          {label}
        </label>
      ) : null}

      {/* The positioning context is the field alone, so the panel's 8px
          stand-off is measured from the pill and not from the helper line. */}
      <div ref={rootRef} className="relative">
        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          readOnly
          disabled={disabled}
          invalid={invalid}
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-autocomplete="none"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={helper ? helperId : undefined}
          value={selected?.label ?? ""}
          placeholder={placeholder ?? ""}
          onKeyDown={onKeyDown}
          onClick={() => {
            if (disabled) return;
            if (open) close();
            else openPanel(selectedIndex);
          }}
          trailingIcon={
            // §8 gives the trigger a 20px chevron; the T0.2 icon slot is 24.
            <span className="flex size-[20px] items-center justify-center">
              <ChevronDownIcon />
            </span>
          }
        />

        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={typeof label === "string" ? label : undefined}
            className={panelClasses({ placement, className: "inset-x-0" })}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={option.disabled ?? false}
                className={panelRowClasses({
                  active: index === activeIndex,
                  selected: index === selectedIndex,
                  disabled: option.disabled ?? false,
                })}
                onClick={() => commit(index)}
                onMouseMove={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {index === selectedIndex ? (
                  <CheckIcon className="size-[16px] shrink-0 text-prime" />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {helper ? (
        <span id={helperId} className={inputHelperClasses(invalid)}>
          {helper}
        </span>
      ) : null}
    </div>
  );
}
