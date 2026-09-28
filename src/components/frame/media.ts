"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as React state — design-spec §4's modes and §7's pointer gate, read the one
 * way script may read them: `matchMedia`, subscribed, never a width measured by hand.
 *
 * The server has no viewport, so it answers with `serverSnapshot`. Hydration renders that
 * answer, and React re-renders with the engine's the moment it differs — which is the
 * mechanism the frame's gates depend on: the server renders every mode's chrome and every
 * write, CSS hides what the viewport refuses before hydration, and after it the refused
 * branch is gone from the DOM rather than hidden (§4: "absent, never disabled").
 *
 * An engine with no `matchMedia` — the DOM emulator the component tests run in — has no
 * viewport either, and answers as the server does. That is the honest reading: the query
 * cannot be observed there, so nothing is decided by it; every gate renders its content,
 * and what the queries decide is measured in a browser (§17: *browser*, never *dom*).
 */
export function useMediaQuery(query: string, serverSnapshot: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverSnapshot,
    () => serverSnapshot,
  );
}
