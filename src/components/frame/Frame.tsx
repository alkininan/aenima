import type { ReactNode } from "react";

import { CONTENT_COLUMN_CLASSES, FRAME_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";
import { PAINT_MARKS } from "@/lib/layout";
import { ROUTES } from "@/lib/routes";

import { ChromeGate } from "./ChromeGate";
import { PaintMark } from "./PaintMark";
import type { SwitcherProduct } from "./ProductSwitcher";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/**
 * The frame — design-spec §4: the sidebar in wide, standard and desk, the top bar in hand,
 * then the content column. One component every signed-in segment layout and the `/dev`
 * fixtures render, so C-40's "on every route" is one thing rather than a convention.
 *
 * **The mode is CSS.** The frame carries `--layout-mode` — hand, desk, standard, wide —
 * under the three px breakpoints, and never on `:root` (C-05); a test reads it, and the dock
 * will. Which chrome stands is CSS before hydration and the DOM after it (`ChromeGate`).
 *
 * **Chrome before data.** The products for the switcher arrive as a promise the layout
 * started and did not await, so the frame streams at once and the switcher's rows fill when
 * the read resolves (C-40); the address is the session's, a cookie check the layout does
 * await, since it is also the 307 an anonymous visitor gets. A layout that awaited the
 * workspace read, as `/app`'s once did, held every route's chrome for it.
 *
 * `dashboardHref` is where the lockup and the Dashboard row go: `/app`, or the fixture
 * list under `/dev`, whose frame is the same component over fixture reads.
 */
export function Frame({
  products,
  address,
  dashboardHref = ROUTES.app,
  children,
}: {
  products: Promise<readonly SwitcherProduct[]>;
  address: string;
  dashboardHref?: string;
  children: ReactNode;
}) {
  const t = getDictionary();

  return (
    <div data-testid="frame" className={FRAME_CLASSES}>
      <PaintMark name={PAINT_MARKS.chrome} />
      <ChromeGate when="sidebar">
        <Sidebar t={t} dashboardHref={dashboardHref} products={products} address={address} />
      </ChromeGate>
      <ChromeGate when="hand">
        <TopBar t={t} dashboardHref={dashboardHref} products={products} address={address} />
      </ChromeGate>
      <div className={CONTENT_COLUMN_CLASSES}>{children}</div>
    </div>
  );
}
