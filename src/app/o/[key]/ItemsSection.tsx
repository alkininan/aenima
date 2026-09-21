import type { Dictionary } from "@/i18n";

import { ItemLine, type ItemLineData } from "./ItemLine";

/**
 * The items bet on one opportunity — §2's "unit of work" under the problem that
 * explains it.
 *
 * Its own component rather than markup inside the page so both arms can be
 * rendered from a fixture: the page reads a workspace, a session and a database
 * before it reaches this, and the branch that matters here is the empty one.
 *
 * §3 makes mono-micro the eyebrow — "use it wherever a tiny section label
 * appears" — and the heading is a real `<h2>` bound to its section, as
 * `ItemSection` on the item page is.
 */
export function ItemsSection({ items, t }: { items: readonly ItemLineData[]; t: Dictionary }) {
  return (
    <section aria-labelledby="opportunity-items" className="flex flex-col gap-[12px]">
      <h2 id="opportunity-items" className="type-mono-micro text-n-secondary">
        {t.opportunity.items}
      </h2>

      {/* §12: an opportunity nobody has bet on yet is a normal state, so it gets
          a sentence rather than an empty region. Unlike §13's buckets — which
          are a partition, where an empty one is silence — this section was
          navigated to on purpose, and a heading over a void answers nothing. */}
      {items.length === 0 ? (
        <p className="type-ui-body text-n-secondary">{t.opportunity.noItems}</p>
      ) : (
        /* §8 (v2.15): one continuous surface, hairline-divided. The `gap-[1px]`
           over `--bg-base` is the hairline, and `overflow-hidden` is what makes
           the square-cornered lines inherit the group's rounded ends. No bucket
           accent: buckets are §13's ranking of a whole workspace, and this is
           one problem's items. */
        <div className="flex flex-col gap-[1px] overflow-hidden rounded-sm bg-bg-base">
          {items.map((item) => (
            <div key={item.key} className="bg-surface-1">
              <ItemLine item={item} t={t} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
