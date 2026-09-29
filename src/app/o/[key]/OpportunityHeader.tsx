import { PageTopbar } from "@/components/frame/PageTopbar";

export type OpportunityHeaderData = {
  key: string;
  title: string;
  /** §2 gives an opportunity a summary and does not require one. */
  summary: string | null;
  productName: string;
};

/**
 * §4's page topbar, for an opportunity — `ItemHeader`'s shape, one object up
 * the §2 tree.
 *
 * The key leads the title in mono-readout, because §3 puts IDs in mono and the
 * key is the name people say out loud: it is the first thing on the page rather
 * than a detail beside the title.
 *
 * The summary sits in §4's subtitle slot, directly under the title, because it
 * is the sentence that says what the problem *is* — and it takes the slot's rule
 * whole: "ui-body, `--n-secondary`, 8 below the title … One line; it truncates
 * rather than wraps on narrow widths." `ItemHeader`'s opportunity line reads it
 * the same way, which is the point of a slot.
 *
 * Absent when there is none. §2 makes `summary` nullable, so an opportunity
 * carrying only a title is a legal one and there is nothing to report.
 *
 * The product is the page's eyebrow line in the content, as the item's taxonomy
 * is: the topbar's 56 row holds a key, a title and a readout, and an opportunity
 * has no freshness to put there.
 *
 * It takes no dictionary: every string it renders is the opportunity's own. A
 * `t` passed in and unused would be a promise that some of this is copy.
 */
export function OpportunityHeader({ opportunity }: { opportunity: OpportunityHeaderData }) {
  return (
    <PageTopbar
      eyebrow={opportunity.key}
      title={opportunity.title}
      subtitle={opportunity.summary ?? undefined}
    />
  );
}
