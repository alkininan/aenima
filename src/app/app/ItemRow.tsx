import Link from "next/link";

import { WriteGate } from "@/components/frame/WriteGate";
import { Button } from "@/components/ui/Button";
import { Chip, ChipIdLabel } from "@/components/ui/Chip";
import { READ_ONLY_SHOWN_CLASSES } from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";
import type { Bucket } from "@/lib/buckets";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/relative-time";
import { checkHref, itemHref } from "@/lib/routes";
import type { Stage } from "@/lib/stage";

import { ItemRowMenu } from "./ItemRowMenu";
import { ROW_CONTROL_ATTRIBUTE, ROW_LINK_ATTRIBUTE } from "./row-link";

/**
 * Everything a row paints, and nothing else.
 *
 * A plain data shape rather than the query's `ItemListRow` so the row can be
 * rendered from a fixture — which is what lets §8's geometry be measured in a
 * browser on /dev/list, since /app itself is behind the proxy and Playwright
 * cannot sign in.
 */
export type ItemRowData = {
  key: string;
  title: string;
  type: keyof Dictionary["itemTypes"];
  stage: Stage;
  bucket: Bucket;
  /** Open gaps, most severe first. The row shows one chip and counts the rest (§8.27). */
  gaps: { id: string; checkId: string; tag: "must" | "should" }[];
  /** Epoch ms. */
  lastActivityAt: number;
  /**
   * §10's clock — when the newest run scored this item, epoch ms. Null while
   * nothing has, and the row then keeps last activity: the same instant Flowing
   * is sorted by, and an honest one for work nobody has measured yet.
   */
  scoredAt: number | null;
  /** §10: §5's queue holds a retry for the artifact that run scored. */
  retrying: boolean;
  /**
   * §8.27: "Idle: the name and readouts step to `--n-secondary` and the non-text
   * parts — accent, meters, dots, chip fills — go to opacity .60 (§2 Dimming), and
   * the freshness readout gives way to a Soft sm 'Park?' in its place."
   *
   * Idle is §3's "items dim relative to their stage baseline", which is the same
   * baseline table the at-risk rule reads — so this arrives decided rather than
   * computed here, and the row stays presentational.
   */
  idle: boolean;
};

/**
 * §8.27: "2px bucket accent (`--prime` your-move / `--warning` at-risk / none flowing)",
 * drawn by the row as a segment inside its inline padding (globals.css `.item-row::before`)
 * so the group's edge reads unbroken and an idle row's span can dim alone. Flowing's stays
 * transparent rather than absent, so every row is inset by the same 16.
 */
const ROW_ACCENT: Record<Bucket, string> = {
  your_move: "before:bg-prime",
  at_risk: "before:bg-warning",
  flowing: "before:bg-transparent",
};

/** The row's own controls stand above the name's stretched hit area (§4's content rung). */
const ABOVE_HIT_AREA = "relative z-[calc(var(--z-content)+1)]";

/**
 * §8.27's item row: the name (ui-headline, the link) → the type, bare mono-micro → the
 * micro-meters, which render nothing until the scores do (§10) → one gap chip and an
 * overflow count → the freshness dot and §12's readout, or on an idle row the Park
 * control → the overflow trigger. One line of 56, or two lines of 72 in a content box
 * under 760, decided by the list's container query in globals.css (`.item-row`).
 *
 * A Server Component: the overflow menu is its own client island, and the list's walker
 * is the other. **No key on the row** — §8.27 lists none and its addends budget none; the
 * key stands on the item page, in the URL and in the menu's Copy key.
 *
 * **The name's hit area is the row's empty surface** — a `::after` on the link covering the
 * row, beneath the row's own controls — so a modifier click stays the browser's and the
 * row remains a grid of controls (§11): the name is the row's one Tab stop, and the chip,
 * Park and the trigger are reached with Right and Left, never Tab (`RowWalker`).
 *
 * **The row draws no surface and no radius of its own** (v2.15): rows are a continuous
 * ledger, and the fill and the corners belong to the group — see `BucketSection`. It does
 * draw its own segment of the accent, so that an idle row's span dims at .60 while the
 * edge still reads as one line.
 *
 * **No meters** (§10): "Row micro-meters do not render at all without a key; the space
 * goes to the content, and the meters appear when the scores do."
 */
export function ItemRow({
  item,
  t,
  now,
  href = itemHref(item.key),
  tabStop = false,
  className,
}: {
  item: ItemRowData;
  t: Dictionary;
  /** Epoch ms, passed in so a row renders identically on the server and in a test. */
  now: number;
  /**
   * Where the row goes — `/i/<key>`, always, but for the `/dev/list` fixture, whose rows
   * lead to the `/dev/item` fixture so the frame's route changes can be driven where no
   * session exists (C-45). The gap chip's link is composed off it.
   */
  href?: string;
  /**
   * §11: the list is one Tab stop, and this row's name is it — the first row's, until a
   * walk moves it. Every other name and every control carries `tabindex="-1"`.
   */
  tabStop?: boolean;
  className?: string;
}) {
  // §8.27: one chip — Musts first, since the query sorts them so — and a count of the rest.
  const shown = item.gaps[0];
  const overflow = item.gaps.length - (shown === undefined ? 0 : 1);

  // §10: the newest run's clock once the item has been scored, last activity before that.
  // §12's ladder string alone — "6 h ago", at most 8 characters — with no "updated" or
  // "scored" in front of it and no "— retrying" after it: a row shows the `--warning` dot
  // alone, its readout unchanged. A queued retry is the system working, not an error, and
  // it never reddens (§1's first law).
  const relative = relativeTime(item.scoredAt ?? item.lastActivityAt, now);
  const readout =
    relative.unit === "justNow"
      ? t.relativeTime.justNow
      : t.relativeTime[relative.unit](relative.value);
  const retrying = item.scoredAt !== null && item.retrying;

  const control = { [ROW_CONTROL_ATTRIBUTE]: "", tabIndex: -1 };

  return (
    <div
      role="row"
      data-testid="item-row"
      data-bucket={item.bucket}
      className={cx(
        // The geometry — both heights — is `.item-row` in globals.css. §6: rows never
        // animate into a new order; only the hover fill transitions, at §6's `--t-fast`.
        "item-row group relative transition-colors duration-[var(--t-fast)] ease-brand",
        "hover:bg-surface-3",
        ROW_ACCENT[item.bucket],
        // §2 Dimming: the accent at .60 across an idle row's span, and only there.
        item.idle && "before:opacity-60",
        className,
      )}
    >
      <div role="gridcell" className="item-row-name min-w-0">
        {/* The whole row is the target: stretched over it rather than wrapping it, so the
            chip, Park and the trigger stay clickable in their own right rather than being
            swallowed by an outer anchor. §11: the link is the row's stop for the arrow keys
            and its one Tab stop — see `RowWalker`. */}
        <Link
          href={href}
          tabIndex={tabStop ? 0 : -1}
          {...{ [ROW_LINK_ATTRIBUTE]: "" }}
          className={cx(
            "type-ui-headline block truncate after:absolute after:inset-0 after:content-['']",
            // §2: an idle row's name steps to --n-secondary; opacity never touches text.
            item.idle ? "text-n-secondary" : "text-n-primary",
          )}
        >
          {item.title}
        </Link>
      </div>

      {/* §8.27: the type, without a container — plain mono-micro in --n-secondary, at most
          80 wide, rendered at every width. A bordered chip in a row means a gap; type is
          taxonomy, and outlining it makes a permanent label compete with the one urgent
          thing on the row. */}
      <div
        role="gridcell"
        className="item-row-type type-mono-micro max-w-[80px] truncate text-n-secondary"
      >
        {t.itemTypes[item.type]}
      </div>

      {/* §8.27: one gap chip at most 112, gap 4, and an overflow count chip of 44 — the
          chip column. The chip is a link to the check's line on the item page (§8.27), and
          the count is a chip, never a badge (§8.9): --surface-2, "+{n}" in mono-readout. */}
      <div role="gridcell" className="item-row-chips flex min-w-0 items-center gap-[4px]">
        {shown === undefined ? null : (
          <Chip
            variant="gap"
            tone={shown.tag}
            dimmed={item.idle}
            href={checkHref(href, shown.checkId)}
            {...control}
            className={cx(ABOVE_HIT_AREA, "max-w-[112px]")}
          >
            <ChipIdLabel label={t.item.gapChip[shown.tag](shown.checkId)} id={shown.checkId} />
          </Chip>
        )}
        {overflow > 0 ? (
          <Chip dimmed={item.idle} className="max-w-[44px]">
            <span className="type-mono-readout">{t.list.moreGaps(overflow)}</span>
          </Chip>
        ) : null}
      </div>

      {/* §8.27: the freshness column — dot 8, gap 4, at most 8 characters of mono-readout;
          on an idle row the readout gives way to a Soft sm "Park?" in the same 72. Every
          system dot is 8. */}
      <div role="gridcell" className="item-row-fresh flex min-w-0 items-center gap-[4px]">
        <span
          aria-hidden="true"
          data-testid="freshness-dot"
          className={cx(
            "size-[8px] shrink-0 rounded-pill",
            retrying ? "bg-warning" : "bg-prime",
            // §2: the dot is a non-text part; it dims at .60 on an idle row.
            item.idle && "opacity-60",
          )}
        />
        {item.idle ? (
          <>
            {/* Park is a mutation and sits inside the gate (§4). It does nothing yet: the
                tap, the mutation and its undo toast are T1.6's; the control stands so the
                idle row's geometry is what it will be. 28 tall — which is why a line is 28. */}
            <WriteGate>
              <Button variant="soft" size="sm" {...control} className={ABOVE_HIT_AREA}>
                {t.list.park}
              </Button>
            </WriteGate>
            {/* Below the read-only line Park is absent with every other mutation and the
                readout takes its place back — in CSS, under the same two queries the gate
                hides under. */}
            <span
              className={cx("type-mono-readout truncate text-n-secondary", READ_ONLY_SHOWN_CLASSES)}
            >
              {readout}
            </span>
          </>
        ) : (
          <span className="type-mono-readout truncate text-n-secondary">{readout}</span>
        )}
      </div>

      {/* §8.27: the overflow trigger, a sm IconButton 28 — an overflow menu is a write
          (§4), so it stands inside the gate and is absent below the read-only line. The
          label is formatted here and passed as a string: the menu is a client component,
          and the dictionary that formats it cannot cross the boundary. */}
      <div role="gridcell" className="item-row-menu flex">
        <WriteGate>
          <ItemRowMenu itemKey={item.key} label={t.list.itemMenu(item.title)} />
        </WriteGate>
      </div>
    </div>
  );
}
