"use client";

import type { ReactNode } from "react";

import { POINTER_QUERY, READ_ONLY_QUERY } from "@/lib/layout";

import { useMediaQuery } from "./media";

/**
 * design-spec §4's read-only line, around a control that writes.
 *
 * "A control that writes carries `data-writes`, and below the read-only line no component
 * renders one outside the auth path" — 768 on touch, 600 on pointer, "every mutation absent
 * from the page, not disabled". C-25 asserts on the attribute, and its grep half
 * (`src/app/writes.test.ts`) holds that every server action's call site sits inside one of
 * these, so the next write meets the rule by construction.
 *
 * **It renders on the server and empties on the client.** The gap move is a plain form that
 * posts with JavaScript off, and a Server Component cannot see a viewport, so the gate keeps
 * both: the wrapper is in the server's HTML with the form inside it, hidden by CSS under the
 * two read-only queries before hydration (`pointer:max-[600px]:hidden`, `touch:max-md:hidden`),
 * and once hydrated it renders nothing at all below the line — gone from the DOM, never
 * `display: none`. Above it the wrapper is `display: contents` and changes no layout.
 */
export function WriteGate({ children }: { children: ReactNode }) {
  const pointer = useMediaQuery(POINTER_QUERY, true);
  const narrowForPointer = useMediaQuery(READ_ONLY_QUERY.pointer, false);
  const narrowForTouch = useMediaQuery(READ_ONLY_QUERY.touch, false);
  const readOnly = pointer ? narrowForPointer : narrowForTouch;

  if (readOnly) return null;

  return (
    <div data-writes="" className="contents pointer:max-[600px]:hidden touch:max-md:hidden">
      {children}
    </div>
  );
}
