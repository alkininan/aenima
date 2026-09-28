import { PageTopbar } from "@/components/frame/PageTopbar";
import { PaintMark } from "@/components/frame/PaintMark";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import type { Dictionary } from "@/i18n";
import { PAINT_MARKS } from "@/lib/layout";

import { ItemSection } from "./ItemSection";

/**
 * §4's page topbar while its data is on its way — "the two data slots inside chrome — the
 * page topbar's title where it is an item's name, and its freshness readout — carry a
 * skeleton of their own size until their data arrives … nothing else in chrome ever
 * skeletons" (C-40). The title's is the line box of the token it stands in for: display-lg
 * in hand chrome, display-xl from 1024; the readout's is mono-readout's 16.
 *
 * The opportunity page has a title and no freshness, so it asks for the one slot.
 */
export function ItemTopbarSkeleton({ freshness = true }: { freshness?: boolean }) {
  return (
    <PageTopbar
      title={<Skeleton shape="text" className="h-[28px] w-[240px] max-w-full lg:h-[38px]" />}
      readout={freshness ? <Skeleton shape="text" className="h-[16px] w-[96px]" /> : undefined}
    />
  );
}

/**
 * §10: the content column's skeleton, mirroring the item page and nothing else — the
 * back link and the section headings are the same on every load, so they are real text;
 * the taxonomy line, the meter's track with its readout, and each section's body are
 * blocks where the content will stand. Shared by `/i/<key>` and the `/dev/item` fixture.
 */
export function ItemSkeleton({ t }: { t: Dictionary }) {
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-[32px]">
      <PaintMark name={PAINT_MARKS.skeleton} />

      <span className="type-ui-body w-fit text-n-secondary">{t.item.backToList}</span>

      <div className="flex flex-col gap-[16px]">
        {/* The taxonomy line: mono-micro's 14. */}
        <Skeleton shape="text" className="h-[14px] w-[240px] max-w-full" />
        {/* The meter's summary at its own 400 and 8 inset: the 8h track, then the points. */}
        <div className="flex max-w-[400px] flex-col gap-[8px] p-[8px]">
          <Skeleton shape="text" className="h-[8px] w-full" />
          <Skeleton shape="text" className="h-[16px] w-[160px]" />
        </div>
      </div>

      {[t.item.artifacts, t.item.gaps, t.item.decisions, t.item.activity].map((title) => (
        <ItemSection key={title} title={title}>
          <SkeletonText lines={2} />
        </ItemSection>
      ))}
    </div>
  );
}
