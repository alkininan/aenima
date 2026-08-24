import Link from "next/link";

import { Chip } from "@/components/ui/Chip";
import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/relative-time";
import { itemHref } from "@/lib/routes";
import type { Stage } from "@/lib/stage";

import { ItemRowMenu } from "./ItemRowMenu";

/**
 * Everything a row paints, and nothing else.
 *
 * A plain data shape rather than the query's `ItemListRow` so the row can be
 * rendered from a fixture — which is what lets §8's geometry be measured in a
 * browser on /dev/primitives, since /app itself is behind the proxy and
 * Playwright cannot sign in.
 */
export type ItemRowData = {
  key: string;
  title: string;
  type: keyof Dictionary["itemTypes"];
  stage: Stage;
  bucket: Bucket;
  /** Open gaps, most severe first. The row shows two and counts the rest. */
  gaps: { id: string; checkId: string; tag: "must" | "should" }[];
  /** Epoch ms. */
  lastActivityAt: number;
  /**
   * §8: "Idle: opacity .60 + trailing Soft chip 'Park?'".
   *
   * Idle is §3's "items dim relative to their stage baseline", which is the same
   * baseline table the at-risk rule reads — so this arrives decided rather than
   * computed here, and the row stays presentational.
   */
  idle: boolean;
};

/** §8: "gap chips (max 2 + overflow)". */
const VISIBLE_GAPS = 2;

/**
 * §8 item row: 56h · name ui-headline + type → gap chips (max 2 + overflow) →
 * freshness dot + mono-readout timestamp → overflow menu.
 *
 * A Server Component: the only interactive part is the overflow menu, which is
 * its own client island. The whole row is a link to the item, so the key is
 * what someone copies out of the address bar.
 *
 * **The row draws no surface, no radius and no accent of its own** (§8, v2.15).
 * Rows are a continuous ledger rather than detached cards, so the fill, the
 * corners and the bucket accent all belong to the group — see `BucketSection`.
 * A row that painted its own would be a card again the moment someone rendered
 * one on its own.
 *
 * **No meters** (§8/§10, v2.15). Nothing is scored until Phase 2, and a hollow
 * track on a row is an unlabelled stub repeated once per row: §10's line that
 * explains it only fits on the item page. The meters come back with the scores.
 */
export function ItemRow({
  item,
  t,
  now,
  className,
}: {
  item: ItemRowData;
  t: Dictionary;
  /** Epoch ms, passed in so a row renders identically on the server and in a test. */
  now: number;
  className?: string;
}) {
  const shown = item.gaps.slice(0, VISIBLE_GAPS);
  const overflow = item.gaps.length - shown.length;
  const relative = relativeTime(item.lastActivityAt, now);
  const freshness =
    relative.unit === "justNow"
      ? t.relativeTime.justNow
      : t.relativeTime[relative.unit](relative.value);

  return (
    <div
      data-testid="item-row"
      data-bucket={item.bucket}
      className={cx(
        // §4 density: list rows 56. The height is fixed rather than minimum —
        // a row that grew with its content would break the rhythm the whole
        // list is read by.
        //
        // §8 (v2.15): no fill, no radius, no accent. The group owns all three;
        // a hairline above every row but the first is what divides them, and
        // `--bg-base` showing through the gap is the divider rather than a
        // border drawn on top of a surface.
        "group relative flex h-[56px] items-center gap-[12px]",
        "px-[12px] transition-colors duration-[var(--t-fast)] ease-brand",
        "hover:bg-surface-3",
        // §8: idle items dim to .60. §1's sixth law — idle work dims, it never
        // turns red.
        item.idle && "opacity-60",
        className,
      )}
    >
      {/* The whole row is the target. Stretched over the row rather than
          wrapping it, so the overflow menu and the chips stay clickable in
          their own right rather than being swallowed by an outer anchor. */}
      <Link
        href={itemHref(item.key)}
        className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']"
      >
        <span className="flex min-w-0 items-center gap-[8px]">
          {/* §3: mono-readout for IDs. The key is the name people say. */}
          <span className="type-mono-readout shrink-0 text-n-secondary">{item.key}</span>
          <span className="type-ui-headline truncate text-n-primary">{item.title}</span>
        </span>
      </Link>

      {/* §8 (v2.15): the type, without a container. A bordered chip in a row
          means a gap; type is taxonomy, and outlining it makes a permanent
          label compete with the one urgent thing on the row. mono-micro is §3's
          eyebrow, which is what a taxonomy label is.

          Below sm it gives its width to the title, which is the part worth
          reading on a phone. */}
      <span className="type-mono-micro hidden shrink-0 text-n-secondary sm:inline">
        {t.itemTypes[item.type]}
      </span>

      {/* §8: gap chips, max 2 + overflow. Musts first — a Should behind a Must
          is the less urgent of the two, and only two fit. */}
      {item.gaps.length > 0 ? (
        <span className="hidden shrink-0 items-center gap-[4px] lg:flex">
          {shown.map((gap) => (
            <Chip key={gap.id} variant="gap" tone={gap.tag}>
              {gap.checkId}
            </Chip>
          ))}
          {overflow > 0 ? <Chip variant="gap">{t.list.moreGaps(overflow)}</Chip> : null}
        </span>
      ) : null}

      {/* §8: idle rows carry a Soft "Park?" chip.

          It does nothing. Park is a later ticket — §13 wants it one-tap and
          reversible with an undo toast, which is a mutation and an activity row,
          and neither exists yet. Rendering it inert is deliberate: the row's
          geometry is what this ticket is for, and a chip that appears later
          would change every idle row's layout after the fact. */}
      {item.idle ? (
        <span className="hidden shrink-0 sm:inline-flex">
          <Chip variant="soft">{t.list.park}</Chip>
        </span>
      ) : null}

      {/* §8: freshness dot + mono-readout timestamp. Every system dot is 8. */}
      <span className="flex shrink-0 items-center gap-[6px]">
        <span aria-hidden="true" className="size-[8px] shrink-0 rounded-pill bg-prime" />
        <span className="type-mono-readout hidden text-n-secondary sm:inline">
          {t.list.freshness(freshness)}
        </span>
      </span>

      {/* The label is formatted here and passed as a string: the menu is a
          client component, and the dictionary that formats it cannot cross the
          boundary. */}
      <ItemRowMenu itemKey={item.key} label={t.list.itemMenu(item.title)} />
    </div>
  );
}
