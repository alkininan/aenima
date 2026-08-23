import Link from "next/link";

import { Chip } from "@/components/ui/Chip";
import { Meter } from "@/components/ui/Meter";
import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/relative-time";
import { itemHref } from "@/lib/routes";
import { STAGES, type Stage } from "@/lib/stage";

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

/** §8: 2px bucket accent — prime your-move, warning at-risk, none flowing. */
const BUCKET_ACCENT: Record<Bucket, string> = {
  your_move: "border-l-prime",
  at_risk: "border-l-warning",
  // §8 gives Flowing no accent. The 2px border still exists so every row is the
  // same width and the titles line up — it is simply transparent.
  flowing: "border-l-transparent",
};

/** §8: "gap chips (max 2 + overflow)". */
const VISIBLE_GAPS = 2;

/**
 * §8's "micro-meters per active stage".
 *
 * Active is read as every stage the item has reached, Discover through its
 * current one — so a Define item shows two tracks and a Design item three. §8
 * does not define the word; this is the reading that makes the row show
 * progress rather than a single bar that means nothing on its own.
 *
 * `handed_over` is excluded: §3 archives it out of active views, so it is never
 * a stage an item is showing progress *through*.
 */
function activeStages(stage: Stage): Stage[] {
  const reached = STAGES.indexOf(stage);
  return STAGES.filter(
    (candidate, index) => index <= reached && candidate !== "handed_over",
  ) as Stage[];
}

/**
 * §8 item row: 56h · 2px bucket accent → name ui-headline + type badge →
 * micro-meters → gap chips (max 2 + overflow) → freshness dot + mono-readout
 * timestamp → overflow menu.
 *
 * A Server Component: the only interactive part is the overflow menu, which is
 * its own client island. The whole row is a link to the item, so the key is
 * what someone copies out of the address bar.
 *
 * **Every meter is hollow.** Nothing is scored until Phase 2, and §10 forbids
 * rendering that as zero — see `Meter`.
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
        "group relative flex h-[56px] items-center gap-[12px] rounded-sm border-l-[2px]",
        "bg-surface-1 pr-[12px] pl-[14px] transition-colors duration-[var(--t-fast)] ease-brand",
        "hover:bg-surface-3",
        BUCKET_ACCENT[item.bucket],
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

      {/* §8: types are informative, never colourful — the outline badge.

          The responsive display lives on this wrapper rather than on the chip:
          `cx` concatenates classes and does not resolve Tailwind conflicts, so a
          `hidden` on the chip would fight the `inline-flex` in its own base and
          be settled by CSS source order instead of by intent. Below sm the badge
          gives its width to the title, which is the part worth reading on a
          phone. */}
      <span className="hidden shrink-0 sm:inline-flex">
        <Chip variant="type-badge">{t.itemTypes[item.type]}</Chip>
      </span>

      {/* §8: one 4h micro-meter per active stage. Hollow, all of them. */}
      <span className="hidden w-[96px] shrink-0 items-center gap-[4px] md:flex">
        {activeStages(item.stage).map((stage) => (
          <Meter
            key={stage}
            score={null}
            size={4}
            label={t.stages[stage]}
            emptyLabel={t.list.noScoring}
          />
        ))}
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

      <ItemRowMenu itemKey={item.key} label={t.list.itemMenu(item.title)} t={t} />
    </div>
  );
}
