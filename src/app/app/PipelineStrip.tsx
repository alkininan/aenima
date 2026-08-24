import Link from "next/link";
import type { CSSProperties } from "react";

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
 * §8 pipeline strip: "Glass bar; segment per stage: mono-micro stage label +
 * display-num count; segments filter; active `--prime-soft`."
 *
 * **No `"use client"`.** Each segment is a link that writes `?stage=` — so the
 * server re-renders the filtered list, the active segment is known server-side,
 * the URL is shareable and the back button works. The ticket anticipated a
 * client component here; a link needs no JavaScript to do any of that, and
 * keeping the list a Server Component is worth more than the symmetry.
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
        "control control-edge-none flex min-w-0 flex-1 flex-col items-start gap-[2px]",
        // §5's nested rule: a surface flush inside a rounded container takes the
        // container's radius minus its padding. The strip is --r-md with 4 of
        // padding, so a segment is r16 — written as the subtraction so it
        // follows the bar rather than needing to be remembered. --r-sm happens
        // to equal it today; using that token would be a coincidence that
        // survives until --r-md moves.
        "rounded-[calc(var(--r-md)-var(--strip-pad))] px-[12px] py-[8px] text-left",
        // §8: active --prime-soft. §7's hover overlay comes from `.control`,
        // and it paints on every segment, so every segment carries the radius —
        // not only the one with a background right now.
        isActive ? "bg-prime-soft" : "bg-transparent",
      )}
    >
      {/* §3: mono-micro is the eyebrow — uppercased and tracked by the class. */}
      <span
        className={cx("type-mono-micro truncate", isActive ? "text-prime" : "text-n-secondary")}
      >
        {label}
      </span>
      <span className={cx("type-display-num", isActive ? "text-prime" : "text-n-primary")}>
        {count}
      </span>
    </Link>
  );

  return (
    <nav
      aria-label={t.list.title}
      // §5's glass recipe, via the shared class: fill + blur + border + the
      // mandatory specular edge.
      // The padding is a custom property because each segment's radius is
      // derived from it (§5's nested rule, above). One number, one place.
      style={{ "--strip-pad": "4px" } as CSSProperties}
      className="glass flex items-stretch gap-[4px] rounded-md p-[var(--strip-pad)]"
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
    </nav>
  );
}
