import Link from "next/link";
import type { CSSProperties } from "react";

import { ScrollRow } from "@/components/ui/ScrollRow";
import type { Dictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import { listHref } from "@/lib/routes";
import { STAGES, type Stage } from "@/lib/stage";

/**
 * §3's stages, minus the terminal one.
 *
 * `handed_over` archives the item out of active views, so a segment for it could
 * only ever filter to an empty list — a control that cannot work. It is also
 * unreachable while `signedPacket` is `never`. When the packet table lands, this
 * becomes a decision about whether the list shows archived work at all, which is
 * a different question from whether the segment renders.
 */
export const PIPELINE_STAGES = STAGES.filter((stage) => stage !== "handed_over");

export type StageCount = { stage: Stage; count: number };

/**
 * §8.26 pipeline strip: "A `--r-md` bar in the flow of the page, not sticky, so it takes
 * the glass recipe without blur, pad 6; a segment per stage, each a pill of r14 (§5's
 * worked example: 20 − 6) and 48 tall — mono-micro stage label over display-num count, 14
 * + 22 with 6 above and below — pad 12 horizontal, gap 4 between segments; segments filter
 * the list; active `--prime-soft`, hover `--hover-overlay`. Below 768 the strip scrolls
 * horizontally with the active segment in view, the same rule as tabs."
 *
 * **No `"use client"` on the segments.** Each is a link that writes `?stage=` — so the
 * server re-renders the filtered list, the active segment is known server-side, the URL is
 * shareable and the back button works. The bar itself is `ScrollRow`, a client island for
 * one thing: bringing the active segment into view once the strip overflows.
 *
 * Segments are content-sized and never shrink — `shrink-0` — so a strip that does not fit
 * scrolls rather than truncating its labels, at every width; a segment that grew to fill
 * the bar would shrink and truncate on a phone, which is what §8.26 forbids.
 *
 * Selecting the active segment again clears the filter, which is what makes the
 * strip a toggle rather than a one-way trip into a filtered view with no way
 * out but the browser's back button.
 */
export function PipelineStrip({
  counts,
  active,
  product,
  total,
  t,
}: {
  counts: readonly StageCount[];
  active: Stage | null;
  /** Carried through every link so choosing a stage keeps the chosen product. */
  product: string | undefined;
  total: number;
  t: Dictionary;
}) {
  const current = { stage: active ?? undefined, product };

  const segment = (key: string, label: string, count: number, href: string, isActive: boolean) => (
    <Link
      key={key}
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={cx(
        // §8.26: 48 tall — 14 + 22 with 6 above and below — pad 12 horizontal.
        "control control-edge-none flex h-[48px] shrink-0 flex-col items-start justify-center",
        // §5's nested rule: a surface flush inside a rounded container takes the
        // container's radius minus its padding. The strip is --r-md with 6 of
        // padding, so a segment is r14 — written as the subtraction so it
        // follows the bar rather than needing to be remembered.
        "rounded-[calc(var(--r-md)-var(--strip-pad))] px-[12px] py-[6px] text-left",
        // §8: active --prime-soft. §7's hover overlay comes from `.control`,
        // and it paints on every segment, so every segment carries the radius —
        // not only the one with a background right now.
        isActive ? "bg-prime-soft" : "bg-transparent",
      )}
    >
      {/* §3: mono-micro is the eyebrow — uppercased and tracked by the class. */}
      <span
        className={cx(
          "type-mono-micro whitespace-nowrap",
          isActive ? "text-prime" : "text-n-secondary",
        )}
      >
        {label}
      </span>
      <span className={cx("type-display-num", isActive ? "text-prime" : "text-n-primary")}>
        {count}
      </span>
    </Link>
  );

  return (
    <ScrollRow
      label={t.list.title}
      // §5's glass recipe, via the shared class: fill + border + the mandatory
      // specular edge, and no blur — the strip is in-flow glass, with nothing
      // passing beneath it (C-37).
      // The padding is a custom property because each segment's radius is
      // derived from it (§5's nested rule, above). One number, one place.
      style={{ "--strip-pad": "6px" } as CSSProperties}
      className="glass scroll-thin flex items-center gap-[4px] overflow-x-auto rounded-md p-[var(--strip-pad)]"
    >
      {segment("all", t.list.allStages, total, listHref(current, { stage: null }), active === null)}
      {PIPELINE_STAGES.map((stage) => {
        const count = counts.find((entry) => entry.stage === stage)?.count ?? 0;
        const isActive = active === stage;
        return segment(
          stage,
          t.stages[stage],
          count,
          // Choosing the active stage again clears it.
          listHref(current, { stage: isActive ? null : stage }),
          isActive,
        );
      })}
    </ScrollRow>
  );
}
