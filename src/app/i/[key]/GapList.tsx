import { Card } from "@/components/ui/Card";
import { Chip, ChipIdLabel } from "@/components/ui/Chip";
import type { Dictionary } from "@/i18n";
import type { Actor } from "@/lib/actor";
import type { GapMoveClaim } from "@/lib/gap-move";
import { gapAnchor } from "@/lib/routes";
import type { RunView } from "@/lib/scoring/run-view";

import { actorWords, GapMoves } from "./GapMoves";

export type GapView = {
  id: string;
  checkId: string;
  tag: "must" | "should";
  /**
   * §5's lifecycle, all four values. `closed` is the only one a machine writes
   * — a time, no name — and the only one that never reaches the page.
   */
  disposition: "open" | "accepted" | "excluded" | "closed";
  /**
   * §8.32: "the check's wording ui-body" — the pack's prose for the check, threaded from
   * the run's checks by check id the way `CheckList` reads `CheckLine.prose`, and null
   * when no run stands behind the item or the loaded pack no longer names the check; the
   * id then stands alone. See `proseByCheck`.
   */
  prose: string | null;
  evidence: string;
  /** Who settled it, already resolved to what can honestly be said. */
  resolvedBy: Actor | null;
  resolutionNote: string | null;
};

/** §5's dispositions, in the order a reader wants them. `closed` never renders. */
const ORDER: Record<GapView["disposition"], number> = {
  open: 0,
  accepted: 1,
  excluded: 2,
  closed: 3,
};

/**
 * What §13 puts on the item page — the narrowing T2.4 applies to this list.
 *
 * §13 names two things a person needs to see here: work that is waiting on a
 * human, and debts somebody put their name to. Everything else about a run
 * lives under the score, where the check that produced it explains it.
 *
 * | gap | here? | why |
 * |---|---|---|
 * | open Must | yes | §13's "Your move" — the only kind that blocks handover |
 * | accepted / excluded | yes, dimmed | §1 law 7: removing one deletes the name |
 * | open Should | no | advisory; its check states it, with its evidence, in the expansion |
 * | closed | no | the check passing is the record |
 *
 * **An open Should is not hidden, it is filed.** Before T2.4 this list was the
 * only place a run's findings appeared, so it had to hold all of them; now the
 * expansion is the canonical view and this is the shortlist. A page that
 * repeated every advisory finding twice would bury the three that block.
 *
 * **A closed gap renders nowhere at all**, and that is the honest treatment
 * rather than a quiet one. `gap_resolution_shape` gives a closed row a time and
 * no name and no note, because nobody decided anything — a re-score found the
 * check passing, or §4's condition stopped holding. There is no person to
 * attribute it to and no debt to carry, and §1 law 7's "visible debts that a
 * named person accepts" is about the two dispositions that have a name. The
 * check passing is the record; the ledger holds the transition.
 *
 * The filter lives here rather than at the call site so that `/i/<key>` and
 * `/dev/item` cannot show two different lists.
 */
function belongsOnThePage(gap: GapView): gap is PageGap {
  return gapHasCard(gap);
}

/**
 * §13's narrowing, over the two fields that decide it — **the one place that
 * answers "does this gap have a card?"**
 *
 * Exported because two other surfaces have to ask the same question and must
 * get the same answer. `CheckList` asks it to decide whether *it* carries the
 * gap's anchor: exactly one element per gap may wear `gap-<id>`, so the
 * expansion takes it only for the open Shoulds this list files away, and the
 * card takes it for everything else. `ReadinessPanel` asks it to decide whether
 * a move named a gap that lives inside the expansion, and therefore whether to
 * open. Three copies of this table would drift, and the drift would show up as
 * a link to nowhere.
 */
export function gapHasCard(gap: {
  tag: GapView["tag"];
  disposition: GapView["disposition"];
}): boolean {
  if (gap.disposition === "closed") return false;
  if (gap.disposition === "open") return gap.tag === "must";
  return true;
}

/**
 * The check's wording for each gap on the page, read off the run the way the check list
 * reads it — `composeRunView` puts the pack's prose on every `CheckLine` — so the card and
 * the line cannot say one check two ways. One function, called by `/i/<key>` and by the
 * `/dev/item` mirror, because a lookup written twice would drift.
 */
export function proseByCheck(run: RunView | null): (checkId: string) => string | null {
  const prose = new Map(run?.checks.map((check) => [check.checkId, check.prose]) ?? []);
  return (checkId) => prose.get(checkId) ?? null;
}

/**
 * A gap that reached the page. A type guard rather than a filter returning
 * `GapView[]`, so that `closed` — which has no chip tone and no label, because
 * it never renders — cannot reach the rendering below even by mistake.
 */
type PageGap = GapView & { disposition: "open" | "accepted" | "excluded" };

/**
 * §8's gap chips carry the tone. An open gap takes its tag's tone — a Must is
 * `--warning-soft`, which is the only warm thing on the page — and a settled one
 * takes its disposition's, which is deliberately quiet.
 */
function toneFor(gap: PageGap): "must" | "should" | "accepted" | "excluded" {
  return gap.disposition === "open" ? gap.tag : gap.disposition;
}

/**
 * What this item owes a person — product-spec.md §13.
 *
 * **This is no longer the picture of a run; the meter's expansion is** (T2.4).
 * What survives here is what §13 asks the item page for: open Musts, and gaps
 * someone accepted or excluded by name. See `belongsOnThePage`.
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
 * **§5's third move is here, and only that one.** "We accept this risk" and its
 * reversal render on every card that has a gap to move, from `GapMoves` — the
 * same component the meter's expansion uses, so one failure cannot show two
 * ways. Moves 1 and 2 — "doesn't apply here" and "already covered" — are Phase
 * 3, and a control for them here would offer something that cannot happen.
 */
export function GapList({
  gaps,
  t,
  scored,
  itemKey,
  outcome,
}: {
  gaps: readonly GapView[];
  t: Dictionary;
  /** The key the moves submit, so a redirect knows where to come back to. */
  itemKey: string;
  /** §5's last move and what came of it, straight off the URL. */
  outcome: GapMoveClaim | null;
  /**
   * Whether this item has ever been scored — which is what the empty line has
   * to say something true about.
   *
   * Unscored, "no gaps yet, they appear when scoring runs" is the whole truth.
   * Scored, it is not: there may be several open Shoulds one click away, and a
   * line claiming none would be the page contradicting the meter above it.
   */
  scored: boolean;
}) {
  const shown = gaps.filter(belongsOnThePage);

  if (shown.length === 0) {
    return (
      <p className="type-ui-body text-n-secondary">
        {scored ? t.item.noGapsScored : t.item.noGaps}
      </p>
    );
  }

  const ordered = [...shown].sort((a, b) => {
    const byDisposition = ORDER[a.disposition] - ORDER[b.disposition];
    if (byDisposition !== 0) return byDisposition;
    // Musts before Shoulds inside a disposition: a blocking debt outranks an
    // advisory one, and §5 makes only the Must block handover.
    if (a.tag !== b.tag) return a.tag === "must" ? -1 : 1;
    return a.checkId.localeCompare(b.checkId);
  });

  return (
    <ul data-testid="gap-list" className="flex flex-col gap-[8px]">
      {ordered.map((gap) => {
        const settled = gap.disposition !== "open";
        const accepted = gap.disposition === "accepted";
        // §2 Dimming: a settled card's text steps to --n-secondary; opacity never touches it.
        const text = settled ? "text-n-secondary" : "text-n-primary";

        return (
          // The anchor `gapOutcomeHref` targets, so a move scrolls its own card
          // into view. `tabIndex={-1}` makes it a focus destination without
          // putting it in the tab order — §11 keeps that for controls.
          <li key={gap.id} id={gapAnchor(gap.id)} tabIndex={-1}>
            {/* §8.32: "a plain card, padding per §5 by where it stands" — 20, since it
                stands on the page by itself. §7 disabled is for controls; a settled gap
                is not disabled, it is resolved — so it dims the way §2 dims: its text to
                --n-secondary and its chip's fill to .60, the card itself untouched. */}
            <Card padding={20} className="flex flex-col gap-[8px]">
              {/* §8.32: the check's wording, ui-body — prose, and it never truncates. The
                  id alone when the loaded pack no longer names the check. */}
              {gap.prose === null ? null : <p className={`type-ui-body ${text}`}>{gap.prose}</p>}

              <div className="flex flex-wrap items-center gap-[8px]">
                {/* §3: check IDs are mono-readout. */}
                <span className={`type-mono-readout ${text}`}>{gap.checkId}</span>
                {/* §8.9's chip: open "Must · {check id}", the id in mono-readout — §12's
                    four chip strings admit no "Open" — accepted "Must · {accepter}",
                    excluded as it was. Settled, its fill dims to .60 on a layer beneath
                    text that keeps its tone. */}
                <Chip variant="gap" tone={toneFor(gap)} dimmed={settled} data-testid="gap-chip">
                  {accepted ? (
                    t.item.gapAcceptedBy[gap.tag](actorWords(gap.resolvedBy, t))
                  ) : gap.disposition === "excluded" ? (
                    t.item.gapExcluded
                  ) : (
                    <ChipIdLabel label={t.item.gapChip[gap.tag](gap.checkId)} id={gap.checkId} />
                  )}
                </Chip>
                {/* The tag stays visible once a gap is settled. An open gap's
                    chip already carries it — §8 tones open Must and open Should
                    differently — and so does an accepted one, §8.9's "Must ·
                    {accepter}"; an excluded chip says only how it was settled,
                    and a Must set aside is a larger fact than a Should. */}
                {settled && !accepted ? (
                  <span className="type-mono-micro text-n-secondary">
                    {gap.tag === "must" ? t.item.gapMust : t.item.gapShould}
                  </span>
                ) : null}
              </div>

              {/* §5: the exact quoted gap, never a paraphrase — §8.32: "the quoted
                  evidence on a --surface-1 card in ui-body", bordered, since a card must
                  separate from a card (§5), at the 16 an evidence card under a check
                  keeps. */}
              <Card bordered className={`type-ui-body ${text}`}>
                {gap.evidence}
              </Card>

              {/* The stamp and the move, from the one component that writes
                  them — the expansion's unclear check renders the same thing
                  for the same gap. No time estimate: product-spec has no typical
                  time for a gap move, and the line never renders without a number
                  (§8.32). No Undo: undo lives in the toast, never on the card. */}
              <GapMoves
                gap={{
                  id: gap.id,
                  checkId: gap.checkId,
                  tag: gap.tag,
                  disposition: gap.disposition,
                  resolvedBy: gap.resolvedBy,
                  resolutionNote: gap.resolutionNote,
                }}
                itemKey={itemKey}
                t={t}
                outcome={outcome !== null && outcome.gapId === gap.id ? outcome : null}
              />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
