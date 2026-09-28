import Link from "next/link";

import { AeMark } from "@/components/AeMark";
import {
  SCRIM_TOP_CLASSES,
  TOP_BAR_CLASSES,
  TOP_BAR_SURFACE_CLASSES,
} from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";

import { ProductSwitcher, type SwitcherProduct } from "./ProductSwitcher";
import { TopBarMenu } from "./TopBarMenu";

/**
 * §4's top bar (hand, below 1024) — "56h plus `env(safe-area-inset-top)`, sticky, glass
 * recipe with `--scrim-top`: the Æ mark 24 at the left, one link to the dashboard as in the
 * sidebar's lockup, the product switcher beside it (avatar 32, name display-md, truncating),
 * and at the right … a **menu IconButton** (`menu`) … morphing (§6) into the nav menu".
 *
 * The scrim is its own non-interactive layer directly behind the bar, ten-sevenths of the
 * bar's height so it runs three-sevenths past the content edge (§4). The `chat-bubble`
 * IconButton §4 puts beside the menu is the dock's. The same two data slots as the sidebar
 * — the switcher's rows and the account's address — take the reads as promises and fill in
 * when they resolve, interactive from the first paint (`usePromise`).
 */
export function TopBar({
  t,
  dashboardHref,
  products,
  address,
}: {
  t: Dictionary;
  dashboardHref: string;
  products: Promise<readonly SwitcherProduct[]>;
  address: Promise<string>;
}) {
  return (
    <header data-testid="top-bar" className={TOP_BAR_CLASSES}>
      <div aria-hidden="true" className={SCRIM_TOP_CLASSES} />
      <div className={TOP_BAR_SURFACE_CLASSES}>
        <Link
          href={dashboardHref}
          data-testid="frame-lockup"
          aria-label={t.common.appName}
          className="flex shrink-0 items-center"
        >
          <AeMark size={24} className="text-n-primary" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center">
          <ProductSwitcher products={products} variant="topbar" />
        </div>

        <TopBarMenu address={address} dashboardHref={dashboardHref} />
      </div>
    </header>
  );
}
