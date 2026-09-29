import { ItemTopbarSkeleton } from "@/app/i/[key]/ItemSkeleton";
import { CHAT_COLUMN_CLASSES, ITEM_GRID_CLASSES } from "@/app/i/[key]/item-grid";
import { ItemListSkeleton } from "@/app/app/ItemRowSkeleton";
import { PaintMark } from "@/components/frame/PaintMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { MAIN_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";
import { PAINT_MARKS } from "@/lib/layout";

/**
 * The opportunity segment's Suspense boundary: the page topbar as chrome with its title
 * slot skeletoned — an opportunity has no freshness, so one slot (§4, C-40) — over the
 * content column's own skeleton (§10): the back link and the section heading are the
 * same on every load, the product line and the rows are blocks.
 */
export default function OpportunityLoading() {
  const t = getDictionary();

  return (
    <main className={MAIN_CLASSES}>
      <ItemTopbarSkeleton freshness={false} />
      <div className={ITEM_GRID_CLASSES}>
        <div aria-busy="true" className="flex min-w-0 flex-col gap-[32px]">
          <PaintMark name={PAINT_MARKS.skeleton} />
          <span className="type-ui-body w-fit text-n-secondary">{t.opportunity.backToList}</span>
          <Skeleton shape="text" className="h-[14px] w-[96px]" />
          <section className="flex flex-col gap-[12px]">
            <h2 className="type-mono-micro text-n-secondary">{t.opportunity.items}</h2>
            <ItemListSkeleton />
          </section>
        </div>
        <aside aria-hidden="true" className={CHAT_COLUMN_CLASSES} />
      </div>
    </main>
  );
}
