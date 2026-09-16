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
 * display-xl title with the key above it in mono-readout, because §3 puts IDs
 * in mono and the key is the name people say out loud: it is the first thing on
 * the page rather than a detail beside the title. The product is §3's eyebrow,
 * in the same mono-micro line the item header gives its taxonomy.
 *
 * The summary sits in §4's subtitle slot, directly under the title, because it
 * is the sentence that says what the problem *is*. Unlike the item header's
 * opportunity line it wraps rather than truncates — a summary is prose, and a
 * problem statement cut off mid-clause says something other than what was
 * written.
 *
 * Absent when there is none. §2 makes `summary` nullable, so an opportunity
 * carrying only a title is a legal one and there is nothing to report.
 *
 * It takes no dictionary: every string it renders is the opportunity's own. A
 * `t` passed in and unused would be a promise that some of this is copy.
 */
export function OpportunityHeader({ opportunity }: { opportunity: OpportunityHeaderData }) {
  return (
    <header className="flex flex-col gap-[8px]">
      <span className="type-mono-readout text-n-secondary">{opportunity.key}</span>
      <h1 className="type-display-xl text-n-primary">{opportunity.title}</h1>

      {opportunity.summary === null ? null : (
        <p className="type-ui-body text-n-secondary">{opportunity.summary}</p>
      )}

      <p className="type-mono-micro flex flex-wrap items-center gap-[8px] text-n-secondary">
        <span>{opportunity.productName}</span>
      </p>
    </header>
  );
}
