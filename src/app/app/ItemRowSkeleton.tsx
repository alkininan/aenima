import { Skeleton } from "@/components/ui/Skeleton";

/**
 * §10: "Full-page loads: skeleton screens mirroring the target layout; never a
 * centered spinner page."
 *
 * Mirroring means the same 56h row, the same left accent gutter and blocks
 * where the real content sits — so the page does not jump when it arrives. A
 * skeleton with different geometry is a spinner with extra steps.
 *
 * The accent is transparent rather than absent: a bucket is not known yet, and
 * guessing one would flash the wrong colour for a moment.
 */
export function ItemRowSkeleton() {
  return (
    <div className="flex h-[56px] items-center gap-[12px] rounded-sm border-l-[2px] border-l-transparent bg-surface-1 pr-[12px] pl-[14px]">
      <Skeleton shape="text" className="w-[56px]" />
      <Skeleton shape="text" className="min-w-0 flex-1 max-w-[280px]" />
      <Skeleton shape="block" className="hidden h-[24px] w-[72px] rounded-pill sm:block" />
      <Skeleton shape="block" className="hidden h-[4px] w-[96px] rounded-pill md:block" />
      <Skeleton shape="text" className="hidden w-[96px] sm:block" />
      <Skeleton shape="circle" className="size-[28px]" />
    </div>
  );
}

/** A page's worth. Six is roughly a first screen at the default breakpoint. */
export function ItemListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-[4px]">
      {Array.from({ length: 6 }, (_, index) => (
        <ItemRowSkeleton key={index} />
      ))}
    </div>
  );
}
