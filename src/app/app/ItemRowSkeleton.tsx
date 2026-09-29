import { Skeleton } from "@/components/ui/Skeleton";
import { LIST_CONTAINER_CLASSES } from "@/components/ui/variants";

/**
 * §10: "Full-page loads: skeleton screens mirroring the target layout; never a
 * centered spinner page."
 *
 * Mirroring means the same row — `.item-row`, so it is 56 in a content box of 760 or
 * more and 72 as two lines below it, following the same container query the rows do —
 * with blocks where the real content sits, so the page does not jump when the rows
 * arrive (§8.27). A skeleton with different geometry is a spinner with extra steps.
 *
 * The accent segment is left unpainted: a bucket is not known yet, and guessing one
 * would flash the wrong colour for a moment.
 */
export function ItemRowSkeleton() {
  return (
    <div className="item-row relative bg-surface-1">
      <div className="item-row-name min-w-0">
        <Skeleton shape="text" className="h-[16px] w-full max-w-[280px]" />
      </div>
      <div className="item-row-type">
        <Skeleton shape="text" className="h-[12px] w-[56px]" />
      </div>
      <div className="item-row-chips">
        <Skeleton shape="block" className="h-[24px] w-[112px] rounded-pill" />
      </div>
      <div className="item-row-fresh">
        <Skeleton shape="text" className="h-[12px] w-[72px]" />
      </div>
      <div className="item-row-menu">
        <Skeleton shape="circle" className="size-[28px]" />
      </div>
    </div>
  );
}

/**
 * A page's worth, as one ledger — the group's corners and its hairlines, so the rows
 * replace it in place. Six is roughly a first screen at the default breakpoint. The list
 * declares the container the row's query reads, exactly as the real list does.
 */
export function ItemListSkeleton() {
  return (
    <div aria-hidden="true" className={LIST_CONTAINER_CLASSES}>
      <div className="flex flex-col gap-[1px] overflow-hidden rounded-sm bg-bg-base">
        {Array.from({ length: 6 }, (_, index) => (
          <ItemRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
