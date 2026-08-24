import { Meter } from "@/components/ui/Meter";
import type { Dictionary } from "@/i18n";
import type { Stage } from "@/lib/stage";

export type ItemHeaderData = {
  key: string;
  title: string;
  type: keyof Dictionary["itemTypes"];
  stage: Stage;
  productName: string;
  /** §2 lineage. Null when the item is unlinked, which is legal and common. */
  opportunityTitle: string | null;
};

/**
 * §4's page topbar, for an item.
 *
 * display-xl title with the key above it in mono-readout — §3 puts IDs in mono,
 * and the key is the name people say out loud, so it is the first thing on the
 * page rather than a detail beside the title.
 *
 * The type renders bare, per §8 (v2.15): no container. A bordered thing on a
 * surface that also carries gap chips means a gap, and type is taxonomy.
 *
 * **The meter is hollow, and here that is right.** §10 renders an unscored
 * meter as a track plus "connect AI to activate scoring", and this is the
 * surface where the line fits beside it — which is exactly why v2.15 removed
 * the meter from the list row, where it did not.
 */
export function ItemHeader({ item, t }: { item: ItemHeaderData; t: Dictionary }) {
  return (
    <header className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <span className="type-mono-readout text-n-secondary">{item.key}</span>
        <h1 className="type-display-xl text-n-primary">{item.title}</h1>

        {/* §2 lineage, in §4's subtitle slot: ui-body, --n-secondary, one line,
            truncating rather than wrapping. The opportunity is the thing that
            explains why this item exists, so it sits directly under the title
            rather than among the taxonomy below it.

            Plain text, not a link. `/o/<key>` is reserved but unbuildable —
            opportunities have no key column, and routing one by uuid would
            defeat the reason routes.ts keeps segments short (build log, open
            question 9).

            Absent when the item is unlinked. §2 makes that legal — "an item may
            be unlinked from any opportunity … never a block" — so there is
            nothing to report and nothing is said. */}
        {item.opportunityTitle === null ? null : (
          <p className="flex items-baseline gap-[8px]">
            <span className="type-mono-micro shrink-0 text-n-secondary">{t.item.opportunity}</span>
            <span className="type-ui-body truncate text-n-secondary">{item.opportunityTitle}</span>
          </p>
        )}

        {/* Taxonomy, product and derived stage — the three things that place an
            item without describing it. mono-micro is §3's eyebrow. */}
        <p className="type-mono-micro flex flex-wrap items-center gap-[8px] text-n-secondary">
          <span>{t.itemTypes[item.type]}</span>
          <span aria-hidden="true">·</span>
          <span>{item.productName}</span>
          <span aria-hidden="true">·</span>
          {/* Named so nobody reads a derived value as a settable field. */}
          <span>
            {t.item.stageLabel}: {t.stages[item.stage]}
          </span>
        </p>
      </div>

      {/* §8: the item-page meter is 8h with its readout beside it. */}
      <div className="flex max-w-[420px] flex-col gap-[8px]">
        <Meter score={null} size={8} label={t.item.readiness} emptyLabel={t.list.noScoring} />
        <span className="type-ui-footnote text-n-secondary">{t.list.noScoring}</span>
      </div>
    </header>
  );
}
