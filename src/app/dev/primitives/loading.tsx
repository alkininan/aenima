import { PageTopbar } from "@/components/frame/PageTopbar";
import { PaintMark } from "@/components/frame/PaintMark";
import { SkeletonText } from "@/components/ui/Skeleton";
import { GUTTER_CLASSES, MAIN_CLASSES } from "@/components/ui/variants";
import { cx } from "@/lib/cx";
import { PAINT_MARKS } from "@/lib/layout";

/**
 * DELETE BEFORE LAUNCH, with everything else under /dev.
 *
 * The sink's boundary, so a held `/dev/primitives?delay=` shows the frame and the
 * page topbar as chrome over a content skeleton (C-40), and a route change onto it
 * marks its skeleton paint (C-45).
 */
export default function PrimitivesLoading() {
  return (
    <main className={MAIN_CLASSES}>
      <PageTopbar title="Primitives" />
      <div aria-busy="true" className={cx(GUTTER_CLASSES, "flex flex-col gap-[48px] py-[48px]")}>
        <PaintMark name={PAINT_MARKS.skeleton} />
        <SkeletonText lines={3} />
        <SkeletonText lines={3} />
      </div>
    </main>
  );
}
