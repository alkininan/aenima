import { cx } from "@/lib/cx";

import { skeletonClasses, type SkeletonShape } from "./variants";

type SkeletonProps = {
  shape?: SkeletonShape;
  /** Size comes from the layout the skeleton is standing in for. */
  className?: string;
};

/**
 * Skeleton (design-spec.md §6) — `--surface-2` base under a moving
 * rgba(255,255,255,.04) highlight on a 1.2s linear loop, and v2.1's sweep
 * geometry: a 200%-wide gradient (transparent → highlight → transparent)
 * traversing the element left to right, one pass per loop.
 *
 * All of that lives in `.shimmer`; this only picks the radius and is decorative
 * — the container standing in for real content carries `aria-busy`.
 */
export function Skeleton({ shape = "block", className }: SkeletonProps) {
  return <span aria-hidden="true" className={skeletonClasses(shape, className)} />;
}

type SkeletonTextProps = {
  lines?: number;
  className?: string;
};

/** A stack of ui-body lines, the last one short, as a paragraph reads. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cx("flex flex-col gap-[8px]", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          shape="text"
          // §3: ui-body is 15/22, so a stand-in line occupies a 22px line box.
          className={cx("h-[22px]", index === lines - 1 ? "w-[60%]" : "w-full")}
        />
      ))}
    </span>
  );
}
