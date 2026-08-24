import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { Dictionary } from "@/i18n";
import type { Actor } from "@/lib/actor";
import { cx } from "@/lib/cx";

export type GapView = {
  id: string;
  checkId: string;
  tag: "must" | "should";
  disposition: "open" | "accepted" | "excluded";
  evidence: string;
  /** Who settled it, already resolved to what can honestly be said. */
  resolvedBy: Actor | null;
  resolutionNote: string | null;
};

/** §5's three dispositions, in the order a reader wants them. */
const ORDER: Record<GapView["disposition"], number> = { open: 0, accepted: 1, excluded: 2 };

/**
 * §8's gap chips carry the tone. An open gap takes its tag's tone — a Must is
 * `--warning-soft`, which is the only warm thing on the page — and a settled one
 * takes its disposition's, which is deliberately quiet.
 */
function toneFor(gap: GapView): "must" | "should" | "accepted" | "excluded" {
  return gap.disposition === "open" ? gap.tag : gap.disposition;
}

function actorWords(actor: Actor | null, t: Dictionary): string {
  if (!actor) return t.item.actorOther;
  if (actor.kind === "agent") return actor.name;
  return actor.kind === "self" ? t.item.actorSelf : t.item.actorOther;
}

/**
 * The item's gaps, in every disposition — product-spec.md §5.
 *
 * **Settled gaps render settled, not hidden.** §1 law 7: "Gaps, exclusions, and
 * flags are visible debts that a named person accepts. Freedom is total;
 * deniability is zero." Hiding an accepted gap would delete the name, which is
 * the only part of accepting one that costs anything.
 *
 * **Evidence is quoted, always.** §5: "a failure quotes the exact gap"; §1 law
 * 3: "a number that cannot be interrogated does not ship." So the evidence is
 * the body of each card rather than a detail behind a disclosure.
 *
 * Read-only. §5's three moves — "doesn't apply here", "already covered", "we
 * accept this risk" — are Phase 2, and each is a mutation with a scoring run
 * behind it. Nothing here is a control.
 */
export function GapList({ gaps, t }: { gaps: readonly GapView[]; t: Dictionary }) {
  if (gaps.length === 0) {
    return <p className="type-ui-body text-n-secondary">{t.item.noGaps}</p>;
  }

  const ordered = [...gaps].sort((a, b) => {
    const byDisposition = ORDER[a.disposition] - ORDER[b.disposition];
    if (byDisposition !== 0) return byDisposition;
    // Musts before Shoulds inside a disposition: a blocking debt outranks an
    // advisory one, and §5 makes only the Must block handover.
    if (a.tag !== b.tag) return a.tag === "must" ? -1 : 1;
    return a.checkId.localeCompare(b.checkId);
  });

  return (
    <ul className="flex flex-col gap-[8px]">
      {ordered.map((gap) => {
        const settled = gap.disposition !== "open";
        const label =
          gap.disposition === "accepted"
            ? t.item.gapAccepted
            : gap.disposition === "excluded"
              ? t.item.gapExcluded
              : t.item.gapOpen;

        return (
          <li key={gap.id}>
            {/* §7 disabled is for controls; a settled gap is not disabled, it is
                resolved — so it dims the way §0 law 7 dims idle work rather than
                taking a disabled treatment. */}
            <Card className={cx("flex flex-col gap-[8px]", settled && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-[8px]">
                {/* §3: check IDs are mono-readout. */}
                <span className="type-mono-readout text-n-secondary">{gap.checkId}</span>
                <Chip variant="gap" tone={toneFor(gap)}>
                  {label}
                </Chip>
                {/* The tag stays visible once a gap is settled. An open gap's
                    chip already carries it — §8 tones open Must and open Should
                    differently — but a settled chip says only how it was
                    settled, and a Must that someone accepted is a larger fact
                    than a Should, not a smaller one. */}
                {settled ? (
                  <span className="type-mono-micro text-n-secondary">
                    {gap.tag === "must" ? t.item.gapMust : t.item.gapShould}
                  </span>
                ) : null}
              </div>

              {/* §5: the exact quoted gap, never a paraphrase. */}
              <p className="type-ui-body text-n-primary">{gap.evidence}</p>

              {settled ? (
                <p className="type-ui-footnote text-n-secondary">
                  {gap.disposition === "accepted"
                    ? t.item.settledBy(actorWords(gap.resolvedBy, t))
                    : t.item.excludedBy(actorWords(gap.resolvedBy, t))}
                  {gap.resolutionNote ? ` — ${gap.resolutionNote}` : ""}
                </p>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
