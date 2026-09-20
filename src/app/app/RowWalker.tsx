"use client";

import { useCallback, type KeyboardEvent, type ReactNode } from "react";

import { nextRovingIndex } from "@/lib/roving";

import { ROW_LINK_ATTRIBUTE } from "./row-link";

/**
 * design-spec.md §11: "arrow keys walk … list rows".
 *
 * The list's one client island, and the reason is real interactivity: moving
 * focus needs the browser. It wraps the buckets rather than living in one, so
 * the walk crosses bucket boundaries in visual order — §13's three buckets are
 * one prioritised list, not three, and a cursor that stopped at "Your move"'s
 * last row would say otherwise.
 *
 * Only a row's link is a stop. With focus there, Down and Up step to the next
 * and previous row and wrap at the ends, as the menus do over the same
 * `nextRovingIndex`; Home and End reach the first and last. Focus anywhere else
 * in a row — the overflow menu's trigger — is left alone: the menu owns its own
 * arrow keys, and a trigger that walked away when pressed Down would never open.
 * An event something below has already handled is left alone for the same
 * reason.
 *
 * The rows are read from the DOM at each key rather than counted from props,
 * so the walker needs nothing but children — the same list renders here from
 * real data and on /dev/primitives from a fixture.
 */
export function RowWalker({ children, className }: { children: ReactNode; className?: string }) {
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute(ROW_LINK_ATTRIBUTE)) return;

    const links = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(`[${ROW_LINK_ATTRIBUTE}]`),
    );
    const next = nextRovingIndex({
      key: event.key,
      current: links.indexOf(target),
      count: links.length,
    });
    if (next === null) return;

    // Down and Up would otherwise scroll the page as well as move the cursor.
    event.preventDefault();
    links[next]?.focus();
  }, []);

  return (
    <div className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
