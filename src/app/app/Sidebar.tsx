import Link from "next/link";

import { AeMark } from "@/components/AeMark";
import type { Dictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import { NAV } from "@/lib/routes";
import { AnalyticsIcon, ListIcon, SettingsIcon, TriageIcon } from "@/components/ui/icons";

import { ProductSwitcher, type SwitcherProduct } from "./ProductSwitcher";

const NAV_ICONS = {
  list: ListIcon,
  triage: TriageIcon,
  analytics: AnalyticsIcon,
  settings: SettingsIcon,
} as const;

/**
 * §4's sidebar: 240 fixed, `--bg-base`, Æ mark 24 + wordmark, nav items 40h,
 * product switcher. **It never collapses** — §4 is explicit that the chat dock
 * is the thing that collapses in v1.
 *
 * A Server Component. The only interactive part is the switcher, which is its
 * own island.
 *
 * **Unbuilt destinations render as disabled, not as links.** Three of the four
 * nav entries have no page behind them yet, and a link that answers 404 is worse
 * than a control that says "not yet" — it costs a navigation, a blank page and a
 * trip back. §7's disabled treatment is what says it: `--n-disabled`, no hover,
 * cursor default. `src/lib/routes.ts` owns which is which, so building a page is
 * one flag rather than an edit here.
 */
export function Sidebar({ t, products }: { t: Dictionary; products: readonly SwitcherProduct[] }) {
  return (
    <aside
      // §4: 240 fixed, never collapses. `shrink-0` is what "fixed" means in a
      // flex row — without it the sidebar would give up width to a long title.
      className="flex w-[240px] shrink-0 flex-col gap-[24px] border-r border-glass-border bg-bg-base p-[16px]"
    >
      {/* §4: lockup top — Æ mark 24 + `aenima` wordmark. §1 gives the wordmark
          DM Sans SemiBold at cap height, one stroke-width to the right. */}
      <Link href="/" className="flex items-center gap-[8px] px-[8px] py-[4px]">
        <AeMark size={24} className="text-n-primary" />
        <span className="type-ui-headline text-n-primary">{t.common.appName}</span>
      </Link>

      <ProductSwitcher products={products} t={t} />

      <nav aria-label={t.nav.list} className="flex flex-col gap-[2px]">
        {NAV.map((entry) => {
          const Icon = NAV_ICONS[entry.label];
          // §4: nav items 40h, icon 20 + ui-body.
          const shared =
            "flex h-[40px] items-center gap-[10px] rounded-pill px-[12px] type-ui-body [&_svg]:size-[20px] [&_svg]:shrink-0";

          if (!entry.built) {
            return (
              <span
                key={entry.href}
                aria-disabled="true"
                // Named for a screen reader, which cannot see that it is dimmed.
                aria-label={`${t.nav[entry.label]} — ${t.nav.notYet}`}
                className={cx(shared, "cursor-default text-n-disabled")}
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
              key={entry.href}
              href={entry.href}
              aria-current="page"
              // §4: active = --prime-soft pill + --n-primary.
              className={cx(shared, "control control-edge-none bg-prime-soft text-n-primary")}
            >
              <Icon />
              {t.nav[entry.label]}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
