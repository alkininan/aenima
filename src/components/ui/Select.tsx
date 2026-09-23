"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cx } from "@/lib/cx";
import { nextRovingIndex } from "@/lib/roving";
import { tabStopAround } from "@/lib/tab-stop";
import { TYPEAHEAD_RESET_MS, matchTypeahead } from "@/lib/typeahead";

import { Input } from "./Input";
import { Panel } from "./Panel";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { panelRowClasses } from "./variants";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  options: readonly SelectOption[];
  /** Null leaves the trigger empty, with its label at rest inside it. */
  value: string | null;
  onValueChange: (value: string) => void;
  /** §8.5: the trigger inherits the field's floating label, so this is a string. */
  label: string;
  /** §8.5: validation outcome only — instructions live in the subtitle slot. */
  helper?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Select (design-spec.md §8.5) — the trigger is the pill field with a trailing chevron
 * (20); the panel is the glass recipe at `--r-panel` on `--shadow-float` with 6 padding,
 * option rows 36 on pointer and 44 on touch, `--hover-overlay` on hover, `--prime-soft`
 * plus a 16px check on the selected row, max-height 320 with inner scroll.
 *
 * Since v2.21 the panel **morphs from the field** (§6): "top-aligned with the field's top
 * and the field's width … with the field hidden beneath it for the panel's lifetime". So
 * the panel is a `Panel` — a popover in the top layer — and it is measured against the
 * pill rather than the composite, which is why `Input` hands back a `fieldRef`.
 *
 * Built as an ARIA combobox over a read-only field rather than a native `<select>`: a
 * native select cannot be given §8.5's panel. **Focus moves into the panel**, which is the
 * one thing v2.21 changed here and it is not cosmetic: §6 places focus "inside the update
 * callback, straight after `showPopover()` … on the panel's first item, which in a select
 * is the selected option", because the trigger is hidden from that moment and a keystroke
 * in the gap would go nowhere. `aria-activedescendant` on the combobox stays, so the
 * relationship a screen reader reads is unchanged; what moved is where the keystrokes go.
 *
 * The keyboard contract is §8.5's, which is the native `<select>`'s so nobody relearns it:
 * arrows move the active option, Enter selects, Esc closes without change, Tab selects the
 * active option and closes, carrying focus onward (§11, C-17).
 */
export function Select({
  options,
  value,
  onValueChange,
  label,
  helper,
  invalid = false,
  disabled = false,
  className,
}: SelectProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const buffer = useRef("");
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const isDisabled = useCallback((index: number) => options[index]?.disabled === true, [options]);

  const optionAt = useCallback(
    (index: number): HTMLElement | null =>
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index] ?? null,
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    buffer.current = "";
  }, []);

  // §11: on close, focus returns to the opener — but not on this line. §6 hides the
  // field for the panel's lifetime, so at the moment the state is set it cannot take
  // focus; `Panel` restores it in its own layout effect, and a child's layout effects
  // run before its parent's.
  const returnFocus = useRef(false);
  const closeAndFocus = useCallback(() => {
    close();
    returnFocus.current = true;
  }, [close]);

  useLayoutEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    inputRef.current?.focus();
  }, [open]);

  /**
   * Opens with the cursor on `index`, or on the first option where there is no selection
   * to open on — `selectedIndex` is -1 then, and a cursor at -1 would leave the option
   * that takes focus (§6 places it on the panel's first item) painted as though it did
   * not have it, with nothing for Enter or Tab to commit.
   */
  const openPanel = useCallback((index: number) => {
    setOpen(true);
    setActiveIndex(index >= 0 ? index : 0);
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onValueChange(option.value);
      closeAndFocus();
    },
    [closeAndFocus, onValueChange, options],
  );

  /** Where the cursor goes when the panel opens: the selected option (§6, C-17). */
  const focusOnOpen = useCallback((): HTMLElement | null => {
    const index = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : 0;
    const row = optionAt(index);
    // §8.5: the selected row is "scrolled into view on open".
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    return row;
  }, [activeIndex, selectedIndex, optionAt]);

  /** Keep the keyboard cursor in view, and on the row that has it. */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = optionAt(activeIndex);
    if (!row) return;
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
    if (document.activeElement !== row && listRef.current?.contains(document.activeElement)) {
      row.focus();
    }
  }, [open, activeIndex, optionAt]);

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

  /**
   * One handler for both states. While the panel is open the keystrokes arrive at the
   * option that has focus and bubble to the listbox; while it is closed they arrive at
   * the field. The contract is the same either way, which is what §8.5 means by "the
   * native `<select>` contract".
   */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;

    if (event.key === "Tab") {
      if (!open) return;
      // §8.5 and C-17: Tab "selects the active option and closes, carrying focus
      // onward". The panel is in the top layer and the field is hidden beneath it, so
      // where Tab would have gone is a question only the document can answer.
      event.preventDefault();
      const onward = tabStopAround(rootRef.current ?? event.currentTarget, event.shiftKey);
      if (activeIndex >= 0) {
        const option = options[activeIndex];
        if (option && !option.disabled) onValueChange(option.value);
      }
      close();
      onward?.focus();
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

    // §8.5: type-to-jump. Single printable characters only, so shortcuts survive.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      jump(event.key);
    }
  };

  return (
    <div ref={rootRef} className={cx("w-full", className)}>
      <Input
        id={inputId}
        ref={inputRef}
        fieldRef={fieldRef}
        role="combobox"
        readOnly
        label={label}
        helper={helper}
        disabled={disabled}
        invalid={invalid}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-autocomplete="none"
        value={selected?.label ?? ""}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (disabled) return;
          if (open) closeAndFocus();
          else openPanel(selectedIndex);
        }}
        trailingIcon={
          // §8.5 gives the trigger a 20px chevron; the icon slot is 24.
          <span className="flex size-[20px] items-center justify-center">
            <ChevronDownIcon />
          </span>
        }
      />

      <Panel
        open={open}
        onClose={closeAndFocus}
        triggerRef={fieldRef}
        width="trigger"
        focusOnOpen={focusOnOpen}
      >
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} onKeyDown={onKeyDown}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
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
      </Panel>
    </div>
  );
}
