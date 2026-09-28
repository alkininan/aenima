"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { findRowLink, rememberReturn, routeKey, takeReturn } from "@/lib/return-focus";
import { ROW_LINK_ATTRIBUTE } from "@/lib/row-link";

/**
 * design-spec.md §11 — where focus goes after a route change, and the way back.
 *
 * "After a route change the code focuses the main region (`tabindex="-1"`), so the next Tab
 * lands on the page's first control and a screen reader announces the page by its title …
 * Returning to a list — by Back, by the breadcrumb, by the sidebar — restores its scroll
 * position and, instead of the main region, focuses the row that was opened."
 *
 * The router itself places no focus: Next 16 runs its new scroll handler, which "no longer
 * focuses the first host descendant", so a navigation leaves focus on a link that is no
 * longer in the document. This island watches the pathname from the root layout — the one
 * place that survives every navigation — and does the two things §11 asks.
 *
 * **A fresh load is left alone.** §11 starts a fresh load at the skip link, the first Tab
 * stop, and the browser already does that; only a change of pathname is a route change. A
 * change of search alone — a filter, a page — is not one: the page and its title stay, and a
 * keyboard user who just chose a filter keeps their place in the strip.
 *
 * **The record is taken from the row's link.** Every row's link carries its key in
 * `data-row-link` (§8.27: the name is the link, and its hit area is the row's surface), so a
 * click or an Enter on it is what records the place; a modifier click opens elsewhere and
 * records nothing. On the way back the row may not be in the document yet — `/app` shows its
 * skeleton while the list read is in flight — so the main region takes focus meanwhile and
 * the row takes it from there the moment it renders.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest(`[${ROW_LINK_ATTRIBUTE}]`)?.getAttribute(ROW_LINK_ATTRIBUTE);
      if (!row) return;
      rememberReturn(routeKey(window.location.pathname, window.location.search), {
        row,
        scrollY: window.scrollY,
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;

    const record = takeReturn(routeKey(pathname, window.location.search));
    const main = document.querySelector<HTMLElement>("main");

    // The main region, unless the page has already placed focus inside it.
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    if (record === null) return;

    const restore = (link: HTMLElement) => {
      link.focus({ preventScroll: true });
      // Instant, as §6 has every programmatic scroll.
      window.scrollTo(0, record.scrollY);
    };

    const found = findRowLink(document, record.row);
    if (found) {
      restore(found);
      return;
    }

    const observer = new MutationObserver(() => {
      const link = findRowLink(document, record.row);
      if (!link) return;
      observer.disconnect();
      restore(link);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
