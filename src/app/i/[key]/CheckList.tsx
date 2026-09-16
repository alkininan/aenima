import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CheckIcon } from "@/components/ui/icons";
import type { Dictionary } from "@/i18n";
import type { GapMoveClaim } from "@/lib/gap-move";
import { gapAnchor } from "@/lib/routes";
import type { CheckLine } from "@/lib/scoring/run-view";

import { gapHasCard } from "./GapList";
import { GapMoves, type MoveableGap } from "./GapMoves";

/**
 * The gaps §4's engine closed because their checks left the denominator, keyed
 * by the check id each was raised against — `reconcileGaps`'s
 * `no-longer-applicable`, read back out of the ledger by
 * `listGapsClosedAsNoLongerApplicable`.
 *
 * The value is the gap's evidence: §5's exact quoted gap as it stood when the
 * closure happened, which is the whole of what the notice shows. The gap's own
 * id is not here because nothing on the page can act on it — a closed gap has
 * no card to anchor and no move to make until §5's first negotiation move
 * ships. The map is keyed by check because that is what a line knows about
 * itself.
 *
 * **Passed closures are not in it.** A gap closed because its check came to
 * pass still renders nowhere: the check passing is the record (T2.4). The read
 * filters on the reason, so this map can only hold the other kind.
 */
export type NoLongerApplicable = ReadonlyMap<string, string>;

/**
 * One run, every check — product-spec.md §1 law 3 rendered literally.
 *
 * "Every score, flag, and suggestion expands into the exact quoted gap. A
 * number that cannot be interrogated does not ship." This is where a human goes
 * to interrogate a number: the whole rubric, in pack order, with what happened
 * to each check and the exact text behind every failure.
 *
 * **Passes are here too.** A list of only the failures would be a list of
 * complaints; the canonical view of a run is what it asked and what it found,
 * and a check that passed is the evidence that it was asked at all.
 *
 * **A container means a gap.** Only an unclear check carries a chip. v2.15
 * removed the type badge's outline from the item row for this reason — "a
 * bordered chip in a row must mean something, and what it means there is a
 * gap" — and the same rule holds one level down. A pass and a not-asked check
 * carry text labels without one.
 *
 * **No danger anywhere.** §0 law 1: "Meters and gaps never render in Danger
 * red." §12: "this section was unclear," never "failed". An unclear Must is
 * `--warning`, an unclear Should is neutral, and nothing on this list is red.
 *
 * **The check's own wording comes from the pack, not from `src/i18n`.** A
 * check's prose is content the rubric owns and versions; the chrome around it
 * is what the product says. See `src/packs/types.ts`.
 *
 * **§5's third move lives on these lines too, and for some gaps only here.**
 * §13's narrowing keeps an open Should off the gap card, so the expansion is
 * the only route to accepting one — which is why the anchor a move redirects to
 * is carried here for exactly those gaps, and why `ReadinessPanel` opens itself
 * when a move names one. See `gapHasCard`. Moves 1 and 2 are Phase 3.
 *
 * **And a not-asked check says what its closure cost.** §4's engine closing a
 * gap because a condition stopped holding is the one closure a person might
 * disagree with (build log open question 14), so the line that already explains
 * the renormalization carries the gap it took with it, quoted, and asks.
 */
export function CheckList({
  checks,
  t,
  itemKey,
  gapsByCheck,
  noLongerApplicable,
  outcome,
}: {
  checks: readonly CheckLine[];
  t: Dictionary;
  itemKey: string;
  /**
   * The gap each check currently carries, by check id — **passed alongside the
   * run, never folded into it.**
   *
   * A run is immutable history and a disposition changes underneath it, so
   * merging the two would make `composeRunView`'s output a function of two
   * clocks. `CheckLine` stays what the run said; this says what is true now.
   *
   * At most one gap per check is open at a time (`reconcileGaps`), and a check
   * can be unclear while its gap is already settled — the reconciler leaves an
   * accepted gap alone — so this is keyed by check rather than filtered to open.
   */
  gapsByCheck: ReadonlyMap<string, MoveableGap>;
  /**
   * What a check took with it when it left the denominator — see
   * `NoLongerApplicable`.
   *
   * A second map rather than a field on `gapsByCheck`, because the two answer
   * opposite questions: that one is what a check currently *owes* and every gap
   * in it can be moved, and a closed gap can be neither. Folding them together
   * would widen `MoveableGap` to a disposition with no move.
   */
  noLongerApplicable: NoLongerApplicable;
  outcome: GapMoveClaim | null;
}) {
  return (
    <ul data-testid="check-list" aria-label={t.item.checks} className="flex flex-col gap-[8px]">
      {checks.map((check) => {
        // The gap this line can act on, and whether this line is the one that
        // has to be reachable by name. A gap with a card is anchored there;
        // §13's filed-away open Shoulds have nowhere else, so they anchor here.
        // Exactly one element per gap wears the id — two would make the
        // fragment mean whichever the browser reached first.
        const gap = check.state === "unclear" ? gapsByCheck.get(check.checkId) : undefined;
        const anchored = gap !== undefined && !gapHasCard(gap);

        return (
          // `tabIndex={-1}` makes it a focus destination without putting it in
          // the tab order — §11 keeps that for controls. Same treatment the gap
          // card gives its own anchor.
          <li
            key={check.checkId}
            id={anchored ? gapAnchor(gap.id) : undefined}
            tabIndex={anchored ? -1 : undefined}
            className="flex flex-col gap-[8px]"
          >
            <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[4px]">
              {/* §3: check IDs are mono-readout. */}
              <span className="type-mono-readout shrink-0 text-n-secondary">{check.checkId}</span>

              {/* Null when the loaded pack no longer names this check — the id is
                still true, so the line stands on it rather than disappearing.
                See `CheckLine.prose`. */}
              {check.prose === null ? null : (
                <span className="type-ui-body min-w-0 text-n-primary">{check.prose}</span>
              )}

              <span className="ml-auto shrink-0">{stateLabel(check, t)}</span>
            </div>

            {/* §8: "evidence quotes ui-body on --surface-1 cards". §5's own
              sentence shape, rendered by the one function that renders it, so
              this and the gap list cannot show one failure two ways. */}
            {check.state === "unclear" ? (
              <Card className="type-ui-body text-n-primary">{check.evidence}</Card>
            ) : null}

            {/* §4's renormalization, said out loud. The condition is written
              affirmatively in the pack and it is here because it did **not**
              hold, so the negation is in the string, never in the pack. */}
            {check.state === "not-asked" ? (
              <p className="type-ui-footnote text-n-secondary">
                {t.item.checkNotAskedReason(check.condition)}
              </p>
            ) : null}

            {/* What the renormalization closed, and the question it raises —
              build log open question 14.

              **Only on a not-asked check.** The map is keyed by check id and a
              check whose condition came back is asked again, which raises a new
              gap or passes; pointing at the old closed one there would be a
              sentence about a state that has already passed. Reading it off the
              line's own state is what keeps the notice in the present tense.

              §5's exact quoted gap, in the same card an unclear check puts its
              evidence in, dimmed the way §0 law 7 dims work that is no longer
              live — the gap is resolved, not disabled, which is the treatment
              the gap list gives a settled one. The question follows it so that
              "this gap" has already been read. §0 law 1: no Warning and no
              Danger; nothing here went wrong. */}
            {check.state === "not-asked" ? (
              <ClosedGapNotice evidence={noLongerApplicable.get(check.checkId)} t={t} />
            ) : null}

            {/* §5's move, on the gap this check raised. The same component the
              gap card renders — §13's narrowing keeps open Shoulds off that
              card, so for those this is the only place the move exists, and a
              second implementation here would drift from that one.

              Only on an unclear check: a passing check has no gap, and a
              not-asked one left the denominator. */}
            {check.state === "unclear" ? (
              <CheckGapMoves gap={gap} itemKey={itemKey} t={t} outcome={outcome} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The gap a not-asked check closed, when it closed one.
 *
 * Nothing renders otherwise, which is the ordinary case: a check whose
 * condition stopped holding usually had nothing open at the time, and a line
 * speaking about a closure there would be the page inventing one.
 */
function ClosedGapNotice({ evidence, t }: { evidence: string | undefined; t: Dictionary }) {
  if (evidence === undefined) return null;

  return (
    <>
      <Card className="type-ui-body text-n-primary opacity-60">{evidence}</Card>
      <p className="type-ui-footnote text-n-secondary">{t.item.checkNotAskedClosedGap}</p>
    </>
  );
}

/**
 * The move on an unclear check's gap, when it has one.
 *
 * A failing check usually does — `reconcileGaps` raises one — but not always:
 * the run is a snapshot and the gap is current state, so a gap closed by a later
 * re-score leaves an unclear line from an older run with nothing to act on.
 * Nothing renders then, which is honest: there is no debt to settle.
 */
function CheckGapMoves({
  gap,
  itemKey,
  t,
  outcome,
}: {
  gap: MoveableGap | undefined;
  itemKey: string;
  t: Dictionary;
  outcome: GapMoveClaim | null;
}) {
  if (!gap) return null;

  return (
    <GapMoves
      gap={gap}
      itemKey={itemKey}
      t={t}
      outcome={outcome !== null && outcome.gapId === gap.id ? outcome : null}
    />
  );
}

/**
 * What happened to this check, in words — never in colour alone.
 *
 * §13: "Meters always pair color with the numeric value; gap states carry text
 * labels, not color alone." So every state says what it is, and the tone is the
 * second signal rather than the only one.
 */
function stateLabel(check: CheckLine, t: Dictionary) {
  if (check.state === "passed") {
    // §2's usage map gives passed checks `--success`. No container: a pass is
    // not a gap, and the tick is the quiet half of a pair with the word.
    return (
      <span className="type-mono-micro inline-flex items-center gap-[4px] text-success">
        <CheckIcon className="size-[12px]" />
        {t.item.checkPassed}
      </span>
    );
  }

  if (check.state === "unclear") {
    // §8's gap-chip tones, unchanged: an open Must is `--warning-soft`, an open
    // Should is `--surface-2`. Only a Must is warm, because only a Must blocks.
    return (
      <Chip variant="gap" tone={check.tag}>
        {t.item.checkUnclear}
      </Chip>
    );
  }

  return <span className="type-mono-micro text-n-secondary">{t.item.checkNotAsked}</span>;
}
