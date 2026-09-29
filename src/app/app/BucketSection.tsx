import { COUNT_BADGE_CLASSES } from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";

import { ItemRow, type ItemRowData } from "./ItemRow";

/**
 * One of §13's three buckets, with its mono-micro header.
 *
 * §3 makes mono-micro the eyebrow — "the terminal label is the retro signature,
 * use it wherever a tiny section label appears" — and §8 names bucket headers as
 * one of its uses. Beside it §8.9's count badge: "display-num in a `--surface-2`
 * pill, 30h, pad 10 — a badge stands only where a count is a headline beside a
 * title", and this is that place.
 *
 * **The group is the ledger** (§8.27, v2.15): the rows sit flush on one `--surface-1`
 * surface divided by 1px `--bg-base` hairlines, with `--r-sm` on the group — the rows
 * are square and let the group's corners clip them. The 2px bucket accent runs
 * unbroken down its left edge; since T0.49 each row draws its own segment of it inside
 * its padding, one pixel taller than the row so no hairline breaks it, which is what lets
 * an idle row's span dim at .60 alone (§2). A bucket is homogeneous by construction —
 * `assignBucket` returns exactly one bucket per item — so the segments are one colour.
 *
 * §13: the list is a `grid` of one Tab stop (`RowWalker`); each bucket's rows are a
 * `rowgroup` named by its header.
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
  linkTo,
  tabStopKey,
}: {
  bucket: Bucket;
  items: readonly ItemRowData[];
  t: Dictionary;
  now: number;
  /** A row's destination by key — see `ItemRow`'s `href`. Absent, a row goes to `/i/<key>`. */
  linkTo?: (key: string) => string;
  /** §11: the row whose name is the list's one Tab stop — the list's first, until a walk moves it. */
  tabStopKey?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-[8px]">
      <h2
        id={`bucket-${bucket}`}
        data-testid="bucket-header"
        className="type-mono-micro flex items-center gap-[8px] text-n-secondary"
      >
        {t.buckets[bucket]}
        <span className={COUNT_BADGE_CLASSES}>{items.length}</span>
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
        role="rowgroup"
        aria-labelledby={`bucket-${bucket}`}
        className="flex flex-col gap-[1px] overflow-hidden rounded-sm bg-bg-base"
      >
        {items.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            t={t}
            now={now}
            tabStop={item.key === tabStopKey}
            className="bg-surface-1"
            {...(linkTo ? { href: linkTo(item.key) } : {})}
          />
        ))}
      </div>
    </section>
  );
}
