import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";

import { ItemRow, type ItemRowData } from "./ItemRow";

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

      <div className="flex flex-col gap-[4px]">
        {items.map((item) => (
          <ItemRow key={item.key} item={item} t={t} now={now} />
        ))}
      </div>
    </section>
  );
}
