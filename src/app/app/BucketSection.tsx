import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";
import { cx } from "@/lib/cx";

import { ItemRow, type ItemRowData } from "./ItemRow";

/**
 * §8: 2px bucket accent — `--prime` your-move, `--warning` at-risk, none
 * flowing.
 *
 * It belongs to the group rather than the row (v2.15), and it can: a bucket is
 * homogeneous by construction, since `assignBucket` returns exactly one bucket
 * per item and this section renders only the items in it. One unbroken edge
 * down eight rows is a list; eight two-pixel marks is eight objects.
 *
 * Flowing's stays transparent rather than absent, so every group is inset by
 * the same 2 and the titles line up across buckets.
 */
const BUCKET_ACCENT: Record<Bucket, string> = {
  your_move: "border-l-prime",
  at_risk: "border-l-warning",
  flowing: "border-l-transparent",
};

/**
 * One of §13's three buckets, with its mono-micro header.
 *
 * §3 makes mono-micro the eyebrow — "the terminal label is the retro signature,
 * use it wherever a tiny section label appears" — and §8 names bucket headers as
 * one of its uses.
 *
 * An empty bucket renders nothing at all rather than a header over a void. §13's
 * buckets are a partition, so an empty one is a normal state and not a thing to
 * report: "Your move — 0" would be a small daily disappointment, and §1's sixth
 * law is that this product is welcoming rather than alarming.
 */
export function BucketSection({
  bucket,
  items,
  t,
  now,
}: {
  bucket: Bucket;
  items: readonly ItemRowData[];
  t: Dictionary;
  now: number;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={`bucket-${bucket}`} className="flex flex-col gap-[8px]">
      <h2
        id={`bucket-${bucket}`}
        data-testid="bucket-header"
        className="type-mono-micro flex items-center gap-[8px] text-n-secondary"
      >
        {t.buckets[bucket]}
        {/* §8's count badge: display-num in a --surface-2 pill. */}
        <span className="type-mono-readout rounded-pill bg-surface-2 px-[8px] py-[2px] text-n-secondary">
          {items.length}
        </span>
      </h2>

      {/* §8 (v2.15): one continuous surface, hairline-divided.
          
          `gap-[1px]` on a `--bg-base` background is the hairline — the page
          showing through a one-pixel gap rather than a border painted on top of
          the fill. That way a row's hover can cover its whole height without
          eating the divider, and the first and last rows need no special case
          beyond the group's own corners.
          
          `overflow-hidden` is what makes the square-cornered rows inherit the
          group's rounded ends: the corners are clipped rather than drawn. */}
      <div
        className={cx(
          "flex flex-col gap-[1px] overflow-hidden rounded-sm border-l-[2px] bg-bg-base",
          BUCKET_ACCENT[bucket],
        )}
      >
        {items.map((item) => (
          <ItemRow key={item.key} item={item} t={t} now={now} className="bg-surface-1" />
        ))}
      </div>
    </section>
  );
}
