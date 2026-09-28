/**
 * design-spec.md §11 — "The way back restores the place."
 *
 * "Returning to a list — by Back, by the breadcrumb, by the sidebar — restores its scroll
 * position and, instead of the main region, focuses the row that was opened … a filter or page
 * in the URL restores with it. Panels and sheets never remember: they reopen fresh."
 *
 * A record per list URL, kept in module state for the life of the document: a route change
 * is a client navigation, so the module survives it, and a fresh load — where §11 starts focus
 * on the skip link rather than anywhere it remembers — starts it empty. The key is the whole
 * URL, pathname and search, which is what makes a filtered list its own place.
 */

import { ROW_LINK_ATTRIBUTE } from "./row-link";

export type ReturnRecord = {
  /** The row's key, as its link carries it in `data-row-link`. */
  row: string;
  /** `window.scrollY` at the moment the row was opened. */
  scrollY: number;
};

let records = new Map<string, ReturnRecord>();

/** A list's key: the address bar's pathname and search. */
export function routeKey(pathname: string, search: string): string {
  if (search === "") return pathname;
  return `${pathname}${search.startsWith("?") ? search : `?${search}`}`;
}

/** Remembers where a list was left from. The newest record for a list wins. */
export function rememberReturn(list: string, record: ReturnRecord): void {
  records.set(list, record);
}

/**
 * The record for a list, handed back once: the next arrival at the same list is a fresh one
 * and focuses the main region, as any other page does.
 */
export function takeReturn(list: string): ReturnRecord | null {
  const record = records.get(list) ?? null;
  records.delete(list);
  return record;
}

/** The link of the row `row` names, or null while the list has not rendered it. */
export function findRowLink(root: ParentNode, row: string): HTMLElement | null {
  for (const link of root.querySelectorAll<HTMLElement>(`[${ROW_LINK_ATTRIBUTE}]`)) {
    if (link.getAttribute(ROW_LINK_ATTRIBUTE) === row) return link;
  }
  return null;
}

/** Test-only: the records are module state, so each test starts from none. */
export function resetReturns(): void {
  records = new Map();
}
