"use client";

import { useEffect, useState } from "react";

/**
 * A value a Server Component started reading, in a client island that must not wait for it.
 *
 * design-spec §4 ("Chrome renders before data") and C-40: the switcher's rows "arrive when
 * their reads resolve, without a skeleton", and the chrome around them is interactive from
 * the first paint. A `<Suspense>` slot cannot give that:
 * React leaves a still-pending boundary's fallback un-hydrated, so a switcher rendered as
 * one is inert for exactly as long as its read takes. So the layout hands the island the
 * promise itself — React streams a promise from a Server Component to a client one — and
 * the island renders `initial` at once, hydrates as itself, and takes the value in an
 * effect when it lands.
 *
 * A read that fails is thrown into the render, where the route's error boundary has it;
 * the chrome never swallows what the page will report anyway.
 */
export function usePromise<T>(promise: Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let live = true;
    promise.then(
      (resolved) => {
        if (live) setValue(() => resolved);
      },
      (error: unknown) => {
        if (live)
          setValue(() => {
            throw error;
          });
      },
    );
    return () => {
      live = false;
    };
  }, [promise]);

  return value;
}
