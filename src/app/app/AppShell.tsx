import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";

import type { SwitcherProduct } from "./ProductSwitcher";
import { Sidebar } from "./Sidebar";

/** The main region's id — the skip link's target. */
export const MAIN_ID = "content";

/**
 * The signed-in shell — §4's grid with the sidebar, and §11's two fixed points of focus.
 *
 * **The skip link is the first Tab stop.** §11: "On a fresh load the first Tab stop is a
 * 'Skip to content' link — a Neutral sm pill (not Soft: in hand chrome it stands over the top
 * bar's glass, the toast's case, §8.20), visible only while focused, at the top-left of the
 * viewport inset 16 on both axes, rung 600 — ahead of the sidebar's seven stops." First in
 * the document, so first in the order; the `skip-link` class in globals.css is what hides it
 * until focus and pins it where §11 says. A plain anchor to the main region's id: the
 * platform moves focus to a focusable fragment target, and no script is needed.
 *
 * **The main region is the layout's, not the page's.** It carries `tabindex="-1"` so
 * `RouteFocus` can focus it after a route change (§11), and it has to be the same element
 * before and after the page's data arrives — `/app` shows `loading.tsx` while the list read
 * is in flight, and a `<main>` owned by the page would be replaced when the content came,
 * dropping the focus just placed on it. The page renders its content column inside.
 *
 * `/dev/list` renders this same shell over a fixture, which is how §11's keyboard paths are
 * driven in a browser without a session.
 */
export function AppShell({
  t,
  products,
  email,
  children,
}: {
  t: Dictionary;
  products: readonly SwitcherProduct[];
  email: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_ID}`}
        className={buttonClasses({ variant: "neutral", size: "sm", className: "skip-link" })}
      >
        {t.common.skipToContent}
      </a>
      <Sidebar t={t} products={products} email={email} />
      <main id={MAIN_ID} tabIndex={-1} className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
