"use client";

import { useEffect } from "react";

import type { PaintMarkName } from "@/lib/layout";

/**
 * design-spec §6's responsiveness budget and C-45: "a route change paints its chrome and
 * the content's skeleton within 100ms of the click and its content within 1s … each paint
 * marked with `performance.mark`".
 *
 * Rendered by the surfaces that are the three paints — the frame's chrome and the page
 * topbar (`chrome`), the content column's skeleton (`skeleton`) and its data-bound content
 * (`content`) — it marks after every commit of the element it sits in: an effect runs once
 * the commit has been painted, and it has no dependency list, so a topbar that re-renders
 * for a new route marks again. `e2e/budget.spec.ts` reads the marks against the click.
 */
export function PaintMark({ name }: { name: PaintMarkName }) {
  useEffect(() => {
    performance.mark(name);
  });

  return null;
}
