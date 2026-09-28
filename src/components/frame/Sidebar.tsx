import Link from "next/link";

import { AeMark } from "@/components/AeMark";
import { NAV_ROW_CLASSES, SIDEBAR_CLASSES, SIDEBAR_ROW_CLASSES } from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import { NAV } from "@/lib/routes";

import { AccountMenu } from "./AccountMenu";
import { NAV_ICONS } from "./nav-icons";
import { ProductSwitcher, type SwitcherProduct } from "./ProductSwitcher";

/**
 * §4's sidebar (wide, standard, desk) — `--bg-base`, 240 fixed, "a column of three zones —
 * lockup, nav, account", padded 16 inline. **It never collapses**: below 1024 the top bar
 * replaces it, "which is a breakpoint rather than a control (§16)".
 *
 * **Geometry, as §4 states it:** the lockup and the switcher are 56 rows, the bar height;
 * the nav begins 16 below the switcher, its rows flush with 12 inline padding and 8 from
 * icon to label, 40 on pointer and 44 on touch — "flush rows cannot extend a hit area, so
 * on touch they grow for real"; the account slot is a 56 row pinned to the bottom.
 *
 * **Chrome before data** (§4, C-40): the static rows render from the route alone. The two
 * that carry data — the switcher's rows and the account's address — are handed the reads
 * the layout started as promises and fill in when they resolve, never a skeleton and never
 * a Suspense slot, whose pending fallback React leaves inert: the switcher opens and the
 * nav navigates before the first request resolves.
 *
 * **Unbuilt destinations render as disabled, not as links.** A link that answers 404 is
 * worse than a control that says "not yet"; §7's disabled treatment says it. `NAV` in
 * `src/lib/routes.ts` owns which is which, and Graveyard carries no route at all until its
 * ticket.
 */
export function Sidebar({
  t,
  dashboardHref,
  products,
  address,
}: {
  t: Dictionary;
  /** Where the lockup and the Dashboard row go — `/app`, or the fixture list under `/dev`. */
  dashboardHref: string;
  products: Promise<readonly SwitcherProduct[]>;
  /** §4's account slot: the signed-in address, truncating. */
  address: Promise<string>;
}) {
  return (
    <aside data-testid="sidebar" className={SIDEBAR_CLASSES}>
      <div className="flex flex-col">
        {/* §4: lockup top — Æ mark 24 + `aenima` wordmark, one link to the dashboard. §1
            gives the wordmark DM Sans SemiBold at cap height, one stroke-width to the
            right. */}
        <Link
          href={dashboardHref}
          data-testid="frame-lockup"
          className={cx(SIDEBAR_ROW_CLASSES, "gap-[8px] px-[8px]")}
        >
          <AeMark size={24} className="text-n-primary" />
          <span className="type-ui-headline text-n-primary">{t.common.appName}</span>
        </Link>

        {/* No dictionary: it holds formatter functions, which cannot be
            serialized across the boundary. The switcher reads its own. */}
        <ProductSwitcher products={products} variant="sidebar" />

        {/* §4: "the nav begins 16 below the switcher", its rows flush. */}
        <nav aria-label={t.chrome.nav} className="mt-[16px] flex flex-col">
          {NAV.map((entry) => {
            const Icon = NAV_ICONS[entry.label];

            if (!entry.built || entry.href === null) {
              return (
                <span
                  key={entry.label}
                  data-testid="nav-row"
                  aria-disabled="true"
                  // Named for a screen reader, which cannot see that it is dimmed.
                  aria-label={`${t.nav[entry.label]} — ${t.nav.notYet}`}
                  className={cx(NAV_ROW_CLASSES, "cursor-default text-n-disabled")}
                >
                  <Icon />
                  {t.nav[entry.label]}
                </span>
              );
            }

            // Only one entry is built, so it is always the active one. When a
            // second lands, this becomes a pathname comparison.
            return (
              <Link
                key={entry.label}
                href={entry.label === "dashboard" ? dashboardHref : entry.href}
                data-testid="nav-row"
                aria-current="page"
                // §4: active = --prime-soft pill + --n-primary.
                className={cx(
                  NAV_ROW_CLASSES,
                  "control control-edge-none bg-prime-soft text-n-primary",
                )}
              >
                <Icon />
                {t.nav[entry.label]}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* §4: the account slot, pinned to the bottom — the sidebar's `justify-between`
          with the first two zones wrapped together is what pins it at any height. */}
      <AccountMenu address={address} />
    </aside>
  );
}
