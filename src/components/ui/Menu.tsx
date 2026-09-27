"use client";

import {
  cloneElement,
  useCallback,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cx } from "@/lib/cx";
import { nextRovingIndex } from "@/lib/roving";

import { Panel } from "./Panel";
import {
  MENU_SECTION_CLASSES,
  MENU_SEPARATOR_CLASSES,
  menuPanelClasses,
  panelRowClasses,
} from "./variants";

/**
 * Which cursor position each entry occupies, or -1 for the sections and
 * separators the arrow keys pass over. Computed outside the component so the
 * running count never becomes render-scope state.
 */
function rowPositions(entries: readonly MenuEntry[]): number[] {
  let count = 0;
  return entries.map((entry) => (entry.kind === "item" ? count++ : -1));
}

export type MenuEntry =
  | {
      kind: "item";
      label: ReactNode;
      onSelect: () => void;
      /** §8: destructive rows carry --danger text. */
      destructive?: boolean;
      disabled?: boolean;
    }
  | { kind: "section"; label: string }
  | { kind: "separator" };

type TriggerProps = {
  "aria-expanded"?: boolean | undefined;
  "aria-haspopup"?: "menu" | undefined;
};

type MenuProps = {
  /** The control that opens the menu — usually a T0.2 IconButton. */
  trigger: ReactElement<TriggerProps>;
  entries: readonly MenuEntry[];
  /** Names the menu for assistive tech. */
  label: string;
  className?: string;
};

/**
 * Context / overflow menu (design-spec.md §8.18) — the glass recipe at
 * `--r-panel` on `--shadow-float` with 6px padding, rows 36 on pointer and 44
 * on touch, `--danger` on destructive rows, mono-micro `--n-secondary` section
 * titles, 1px `--glass-border` separators, min-width 200 and max-width 280.
 *
 * Since v2.21 the panel **morphs from its trigger** (§6): it is a `Panel`, which
 * is a popover in the top layer, placed by §6's rule and grown out of the
 * trigger's box. Which corner it grows from is no longer the caller's to pass —
 * §6 decides it from the room around the trigger — so the old `align` prop is
 * gone rather than left as a second opinion.
 *
 * Unlike the select, a menu moves real focus onto its rows: there is no field
 * holding the user's place, and §11 wants the arrow keys to walk something that
 * can be seen to have focus. Escape hands focus back to the trigger. Tab hands it back
 * too, synchronously and without preventing the key, so the browser's own Tab carries
 * on from the trigger to the stop after it, or before it on Shift+Tab (C-17).
 */
export function Menu({ trigger, entries, label, className }: MenuProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Only rows take the cursor; sections and separators are passed over.
  const rows = useMemo(() => entries.filter((entry) => entry.kind === "item"), [entries]);
  const positions = useMemo(() => rowPositions(entries), [entries]);
  const isDisabled = useCallback((index: number) => rows[index]?.disabled === true, [rows]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // §11: on close, focus returns to the opener — but not on this line. §6 hides the
  // trigger for the panel's lifetime, so at the moment the state is set it is still
  // hidden and cannot take focus; `Panel` restores it in its own layout effect, and a
  // child's layout effects run before its parent's.
  const returnFocus = useRef(false);
  const closeAndFocus = useCallback(() => {
    close();
    returnFocus.current = true;
  }, [close]);

  useLayoutEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    triggerRef.current?.querySelector("button")?.focus();
  }, [open]);

  const focusRow = useCallback((index: number) => {
    setActiveIndex(index);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus();
  }, []);

  // §6: focus is placed inside the morph's update callback, on the panel's
  // first item. `Panel` calls this straight after `showPopover()` — never at
  // `finished`, because the trigger is hidden by then and a keystroke in the
  // gap would go nowhere (C-17). The cursor state is set here too, so the row
  // that has focus is the row that is painted active.
  const firstRow = useCallback((): HTMLElement | null => {
    const index =
      nextRovingIndex({ key: "Home", current: -1, count: rows.length, isDisabled }) ?? 0;
    setActiveIndex(index);
    return listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index] ?? null;
  }, [rows.length, isDisabled]);

  const toggle = useCallback(() => {
    if (open) {
      closeAndFocus();
      return;
    }
    setOpen(true);
  }, [open, closeAndFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      closeAndFocus();
      return;
    }

    const walked = nextRovingIndex({
      key: event.key,
      current: activeIndex,
      count: rows.length,
      isDisabled,
    });
    if (walked === null) return;

    event.preventDefault();
    focusRow(walked);
  };

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      {/* The handler sits on the wrapper rather than being cloned onto the
          trigger: cloneElement is a call made during render, and handing a
          call a closure that reads refs is exactly what React's render-purity
          rules forbid. The click bubbles here from the button either way, and
          the trigger still gets the aria state it owes assistive tech. */}
      <span ref={triggerRef} className="inline-flex" onClick={toggle}>
        {cloneElement(trigger, { "aria-expanded": open, "aria-haspopup": "menu" })}
      </span>

      <Panel
        open={open}
        onClose={closeAndFocus}
        triggerRef={triggerRef}
        focusOnOpen={firstRow}
        className={menuPanelClasses()}
      >
        <div ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown}>
          {entries.map((entry, index) => {
            if (entry.kind === "separator") {
              return (
                <div
                  key={`${baseId}-sep-${index}`}
                  role="separator"
                  className={MENU_SEPARATOR_CLASSES}
                />
              );
            }
            if (entry.kind === "section") {
              return (
                <div key={`${baseId}-section-${index}`} className={MENU_SECTION_CLASSES}>
                  {entry.label}
                </div>
              );
            }

            const position = positions[index] ?? -1;
            return (
              <button
                key={`${baseId}-item-${index}`}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={entry.disabled ?? false}
                className={panelRowClasses({
                  active: position === activeIndex,
                  destructive: entry.destructive ?? false,
                  disabled: entry.disabled ?? false,
                })}
                onClick={() => {
                  entry.onSelect();
                  closeAndFocus();
                }}
                onMouseMove={() => setActiveIndex(position)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
