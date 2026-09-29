"use client";

import { useCallback, type KeyboardEvent, type ReactNode } from "react";

import { LIST_CONTAINER_CLASSES } from "@/components/ui/variants";
import { cx } from "@/lib/cx";
import { nextRovingIndex } from "@/lib/roving";

import { ROW_CONTROL_ATTRIBUTE, ROW_LINK_ATTRIBUTE } from "./row-link";

const ROW_SELECTOR = '[role="row"]';
/** A row's controls in DOM order — the one-line row's visual order at both heights. */
const CONTROL_SELECTOR = `[${ROW_LINK_ATTRIBUTE}], [${ROW_CONTROL_ATTRIBUTE}]`;

/**
 * design-spec.md §11: "A list is one Tab stop and a grid inside: Up and Down move between
 * rows; Right and Left walk the focused row's controls in the one-line row's visual order,
 * at both row heights … Enter opens the item from the name; Home and End jump." §13: lists
 * are a `grid` of one Tab stop.
 *
 * The list's one client island, and the reason is real interactivity: moving focus needs
 * the browser. It wraps the buckets rather than living in one, so the walk crosses bucket
 * boundaries in visual order — §13's three buckets are one prioritised list, not three,
 * and a cursor that stopped at "Your move"'s last row would say otherwise. It is also the
 * list's container for the row's line count (§8.27), so its inline size is §4's content
 * box.
 *
 * **One Tab stop.** The current row's name carries `tabindex="0"` — the first row's on
 * arrival, seeded by the server — and every other name and every control `-1`, so Tab
 * enters the list at the current row and the next Tab leaves it. A vertical walk moves the
 * stop with it (roving tabindex), by writing the attribute on the DOM: the rows are Server
 * Components and never re-render for it.
 *
 * **Up and Down** step to the next and previous row from any control in the row and land
 * on that row's name, wrapping at the ends as the menus do over the same
 * `nextRovingIndex`; **Home and End** reach the first and last. **Right and Left** walk the
 * row's controls in DOM order — name, gap chip, on an idle row the Park control, overflow
 * trigger — and stop at the row's ends: a grid's row is not a menu, and wrapping Right from
 * the trigger onto the name would read as a jump. Below the read-only line the gated
 * controls are gone from the DOM, and the walk is shorter by exactly those.
 *
 * **Enter** is the name's own: a link opens natively. The overflow menu keeps its keys:
 * open, its handler prevents default and a handled event is left alone, and focus inside
 * its panel is on nothing the row calls a control, so nothing here fires; closed, its
 * trigger is one of the row's controls like any other. The selection keys — Space,
 * `Shift`+Up/Down, `Cmd/Ctrl+A` — belong to a list that selects, and this one does not.
 *
 * The rows are read from the DOM at each key rather than counted from props, so the walker
 * needs nothing but children — the same list renders here from real data and on the /dev
 * routes from a fixture.
 */
export function RowWalker({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** The grid's accessible name — the page's title, since the list is the page. */
  label: string;
  className?: string;
}) {
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const list = event.currentTarget;
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (!row || !list.contains(row)) return;

    const controls = Array.from(row.querySelectorAll<HTMLElement>(CONTROL_SELECTOR));
    const at = controls.indexOf(target);
    // Focus is inside a row but on nothing the row calls a control — an open menu's
    // items, which own their keys. Left alone.
    if (at < 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Right and Left would otherwise scroll a wide page sideways; and at the row's
      // ends they go nowhere rather than round.
      event.preventDefault();
      const next = controls[at + (event.key === "ArrowRight" ? 1 : -1)];
      next?.focus();
      return;
    }

    const rows = Array.from(list.querySelectorAll<HTMLElement>(ROW_SELECTOR));
    const next = nextRovingIndex({
      key: event.key,
      current: rows.indexOf(row),
      count: rows.length,
    });
    if (next === null) return;

    const name = rows[next]?.querySelector<HTMLElement>(`[${ROW_LINK_ATTRIBUTE}]`);
    if (!name) return;

    // Down and Up would otherwise scroll the page as well as move the cursor.
    event.preventDefault();
    // The one Tab stop follows the current row.
    for (const link of list.querySelectorAll<HTMLElement>(`[${ROW_LINK_ATTRIBUTE}]`)) {
      link.tabIndex = -1;
    }
    name.tabIndex = 0;
    name.focus();
  }, []);

  return (
    <div
      role="grid"
      aria-label={label}
      className={cx(LIST_CONTAINER_CLASSES, className)}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
