"use client";

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { SIDEBAR_QUERY } from "@/lib/layout";

import { useMediaQuery } from "./media";

/**
 * Which of §4's two chromes stands: the sidebar from 1024 up, the top bar below it.
 *
 * The frame is a Server Component and cannot see the viewport, so it renders both and this
 * gate decides. Before hydration the decision is CSS — `max-lg:hidden` on the sidebar's
 * gate, `lg:hidden` on the top bar's — so the first paint is already right; after it the
 * refused chrome is not in the DOM at all, which is what C-24 asserts at 1023 and 1024.
 *
 * **Each gate's server snapshot says "I match"**, so both chromes are in the streamed HTML
 * and both hydrate as rendered; the engine's answer then removes one. A single answer for
 * both would leave one chrome out of the HTML altogether — the hand top bar, until
 * hydration — which is exactly the gap C-40 forbids. `display: contents` keeps the wrapper
 * out of the frame's flex row.
 */
export function ChromeGate({ when, children }: { when: "sidebar" | "hand"; children: ReactNode }) {
  const sidebar = useMediaQuery(SIDEBAR_QUERY, when === "sidebar");
  const shown = when === "sidebar" ? sidebar : !sidebar;
  if (!shown) return null;

  return (
    <div
      data-chrome={when}
      className={cx("contents", when === "sidebar" ? "max-lg:hidden" : "lg:hidden")}
    >
      {children}
    </div>
  );
}
