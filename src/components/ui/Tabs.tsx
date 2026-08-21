"use client";

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/lib/cx";
import { nextRovingIndex } from "@/lib/roving";

import { TAB_LIST_CLASSES, TAB_UNDERLINE_CLASSES, tabClasses } from "./variants";

/** The strip runs across, so Left/Right are the walking keys §11 asks for. */
const HORIZONTAL_KEYS: Record<string, string> = {
  ArrowRight: "ArrowDown",
  ArrowLeft: "ArrowUp",
};

export type TabItem = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type TabsProps = {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Names the tab list for assistive tech. */
  label: string;
  className?: string;
};

/**
 * Tabs (design-spec.md §8) — ui-subhead, inactive `--n-secondary`, active
 * `--n-primary` with a 2px `--prime` underline at radius 2, hover overlay on a
 * 36h hit area.
 *
 * No press physics: §6 lists them for buttons, chips, toggle and checkbox, and
 * a tab is a destination rather than a control that pushes back.
 *
 * Roving tabindex: the tab strip is one Tab stop and the arrow keys walk inside
 * it, which is both the ARIA tab pattern and §11's "arrow keys walk" rule.
 */
export function Tabs({ items, value, onValueChange, label, className }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const current = items.findIndex((item) => item.value === value);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = nextRovingIndex({
        key: HORIZONTAL_KEYS[event.key] ?? event.key,
        current,
        count: items.length,
        isDisabled: (index) => items[index]?.disabled === true,
      });
      if (next === null) return;

      event.preventDefault();
      const item = items[next];
      if (!item) return;

      onValueChange(item.value);
      // Selection follows focus, so the newly active tab has to take it.
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    },
    [current, items, onValueChange],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx(TAB_LIST_CLASSES, className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            id={`${baseId}-${index}`}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled ?? false}
            tabIndex={active ? 0 : -1}
            className={tabClasses(active, item.disabled ?? false)}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
            {active ? <span className={TAB_UNDERLINE_CLASSES} /> : null}
          </button>
        );
      })}
    </div>
  );
}
