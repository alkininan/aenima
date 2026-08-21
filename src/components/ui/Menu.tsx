"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
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

import { useEscapeLayer, useOutsideDismiss, usePanelPlacement } from "./useLayer";
import {
  MENU_SECTION_CLASSES,
  MENU_SEPARATOR_CLASSES,
  PANEL_MAX_HEIGHT,
  menuPanelClasses,
  panelRowClasses,
  type MenuAlign,
  type PanelPlacement,
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
  align?: MenuAlign;
  className?: string;
};

/**
 * Context / overflow menu (design-spec.md §8) — `--surface-1` panel at radius
 * 12 on the dropdown shadow with 6px padding, 36h ui-body rows, `--danger` on
 * destructive rows, mono-micro `--n-secondary` section titles, 1px
 * `--glass-border` separators.
 *
 * Unlike the select, a menu moves real focus onto its rows: there is no field
 * holding the user's place, and §11 wants the arrow keys to walk something that
 * can be seen to have focus. Escape and Tab both hand focus back to the trigger.
 */
export function Menu({ trigger, entries, label, align = "start", className }: MenuProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement>("below");
  const [activeIndex, setActiveIndex] = useState(-1);

  // Only rows take the cursor; sections and separators are passed over.
  const rows = useMemo(() => entries.filter((entry) => entry.kind === "item"), [entries]);
  const positions = useMemo(() => rowPositions(entries), [entries]);
  const isDisabled = useCallback((index: number) => rows[index]?.disabled === true, [rows]);

  const measurePlacement = usePanelPlacement(rootRef, PANEL_MAX_HEIGHT);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // §11: on close, focus returns to the opener.
  const closeAndFocus = useCallback(() => {
    close();
    triggerRef.current?.querySelector("button")?.focus();
  }, [close]);

  const focusRow = useCallback((index: number) => {
    setActiveIndex(index);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus();
  }, []);

  useEscapeLayer({ open, kind: "popover", onClose: closeAndFocus });
  useOutsideDismiss({ open, refs: [rootRef], onDismiss: close });

  // A menu moves real focus onto its first row when it opens — once per
  // opening, so a later re-render never drags the cursor back to the top.
  const autoFocused = useRef(false);
  useEffect(() => {
    if (!open) {
      autoFocused.current = false;
      return;
    }
    if (autoFocused.current) return;
    autoFocused.current = true;
    focusRow(nextRovingIndex({ key: "Home", current: -1, count: rows.length, isDisabled }) ?? 0);
  }, [open, rows.length, isDisabled, focusRow]);

  const toggle = useCallback(() => {
    if (open) {
      closeAndFocus();
      return;
    }
    setPlacement(measurePlacement(true));
    setOpen(true);
  }, [open, closeAndFocus, measurePlacement]);

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

      {open ? (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          className={menuPanelClasses({ placement, align })}
          onKeyDown={onKeyDown}
        >
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
      ) : null}
    </div>
  );
}
