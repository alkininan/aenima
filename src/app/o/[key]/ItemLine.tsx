import Link from "next/link";

import type { Dictionary } from "@/i18n";
import { itemHref } from "@/lib/routes";
import type { Stage } from "@/lib/stage";

/**
 * Everything a line paints, and nothing else — a plain data shape rather than
 * the query's row, so a line can be rendered from a fixture.
 */
export type ItemLineData = {
  key: string;
  title: string;
  type: keyof Dictionary["itemTypes"];
  /** Derived, never stored. See src/lib/stage.ts. */
  stage: Stage;
};

/**
 * One item belonging to an opportunity.
 *
 * §8's item row at its 56h density and in the same continuous-ledger language
 * (v2.15): no fill, no radius and no accent of its own, because the group owns
 * all three — see the wrapper in `page.tsx`, which is `BucketSection`'s.
 *
 * **It is not `ItemRow`.** That row carries §13's bucket, gap chips and
 * freshness, which are the ranking the *list* surface computes across a whole
 * workspace. This page answers a different question — what is being worked on
 * under this problem — and rendering the list's row here would mean computing a
 * workspace-wide ranking to fill three fields nobody came for. What places an
 * item under an opportunity is its name, its type and how far it has got.
 */
export function ItemLine({ item, t }: { item: ItemLineData; t: Dictionary }) {
  return (
    <div className="relative flex h-[56px] items-center gap-[12px] px-[12px] transition-colors duration-[var(--t-fast)] ease-brand hover:bg-surface-3">
      {/* The whole line is the target, stretched rather than wrapping, so the
          taxonomy on the right stays selectable text. */}
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

      {/* §8 (v2.15): taxonomy bare, no container. Below sm it gives its width to
          the title, which is the part worth reading on a phone. */}
      <span className="type-mono-micro hidden shrink-0 items-center gap-[8px] text-n-secondary sm:flex">
        <span>{t.itemTypes[item.type]}</span>
        <span aria-hidden="true">·</span>
        {/* Named so nobody reads a derived value as a settable field. */}
        <span>
          {t.item.stageLabel}: {t.stages[item.stage]}
        </span>
      </span>
    </div>
  );
}
