import Link from "next/link";

import { PageTopbar } from "@/components/frame/PageTopbar";
import type { Dictionary } from "@/i18n";
import { opportunityHref } from "@/lib/routes";
import type { RunView } from "@/lib/scoring/run-view";
import type { Stage } from "@/lib/stage";

import { Freshness } from "./freshness";

export type ItemHeaderData = {
  key: string;
  title: string;
  type: keyof Dictionary["itemTypes"];
  stage: Stage;
  productName: string;
  /**
   * §2 lineage. Null when the item is unlinked, which is legal and common.
   *
   * One nullable object rather than a nullable title beside a nullable key:
   * `opportunity.key` is NOT NULL (drizzle/0016), so a linked opportunity always
   * has both, and two fields could be made to say otherwise.
   */
  opportunity: { key: string; title: string } | null;
};

/**
 * §4's page topbar, for an item — "the title is the item's name and the freshness its
 * last-scored readout", the two data slots in chrome.
 *
 * The key leads the title row in mono-readout — §3 puts IDs in mono, and the key is the
 * name people say out loud, so it is the first thing on the page rather than a detail
 * beside the title. The §2 lineage takes §4's subtitle slot: ui-body, `--n-secondary`, one
 * line, truncating rather than wrapping, a link to `/o/<key>` since T1.4 gave opportunities
 * a key. Absent when the item is unlinked: §2 makes that legal — "an item may be unlinked
 * from any opportunity … never a block" — so there is nothing to report and nothing is
 * said.
 *
 * The freshness is §10's readout, `--warning`-dotted while a retry is queued; with no run
 * there is nothing to say and the slot is empty. The taxonomy — type, product, derived
 * stage — is `ItemTaxonomy` below, the content's first line: the 56 row holds a key, a
 * title and a readout, and §4 gives it nothing else.
 *
 * **The meter is not here.** It left with T2.4, because §8 makes the meter the
 * summary of a disclosure and the run it opens onto is a list, not a header.
 */
export function ItemHeader({
  item,
  run,
  now,
  t,
}: {
  item: ItemHeaderData;
  run: RunView | null;
  /** Epoch ms — the read's own instant, which the freshness is judged against. */
  now: number;
  t: Dictionary;
}) {
  return (
    <PageTopbar
      eyebrow={item.key}
      title={item.title}
      subtitle={
        item.opportunity === null ? undefined : (
          <>
            <span className="type-mono-micro text-n-secondary">{t.item.opportunity}</span>{" "}
            <Link
              href={opportunityHref(item.opportunity.key)}
              className="text-n-secondary hover:text-n-primary"
            >
              {item.opportunity.title}
            </Link>
          </>
        )
      }
      readout={run === null ? undefined : <Freshness run={run} t={t} now={now} />}
    />
  );
}

/**
 * Taxonomy, product and derived stage — the three things that place an item
 * without describing it. mono-micro is §3's eyebrow. The type renders bare, per
 * §8 (v2.15): no container. A bordered thing on a surface that also carries gap
 * chips means a gap, and type is taxonomy.
 */
export function ItemTaxonomy({ item, t }: { item: ItemHeaderData; t: Dictionary }) {
  return (
    <p className="type-mono-micro flex flex-wrap items-center gap-[8px] text-n-secondary">
      <span>{t.itemTypes[item.type]}</span>
      <span aria-hidden="true">·</span>
      <span>{item.productName}</span>
      <span aria-hidden="true">·</span>
      {/* Named so nobody reads a derived value as a settable field. */}
      <span>
        {t.item.stageLabel}: {t.stages[item.stage]}
      </span>
    </p>
  );
}
