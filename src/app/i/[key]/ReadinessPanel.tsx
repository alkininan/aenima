import { DisclosureChevron } from "@/components/ui/Disclosure";
import { Meter } from "@/components/ui/Meter";
import { DISCLOSURE_SUMMARY_CLASSES } from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";
import { cx } from "@/lib/cx";
import type { GapMoveClaim } from "@/lib/gap-move";
import type { RunView } from "@/lib/scoring/run-view";

import { CheckList, type NoLongerApplicable } from "./CheckList";
import { gapHasCard } from "./GapList";
import type { MoveableGap } from "./GapMoves";

/**
 * The score, and what it expands into — design-spec.md §8's readiness meter.
 *
 * "Item-page meter 8h + mono-readout percentage; click expands per-check list."
 * The meter is the summary and the run is the body, so the number and the
 * evidence behind it are one element: §1 law 3 makes a score that cannot be
 * interrogated something that does not ship, and putting the expansion anywhere
 * else would make interrogating it a navigation.
 *
 * **A native `<details>`, and no client component.** The disclosure needs
 * open/closed state and nothing else — no callback, no effect, no measurement —
 * and the element that has that state already is `<summary>`. It comes with the
 * keyboard path §11 asks for (Tab to it, Enter or Space to toggle) for free, and
 * `:focus-visible` is the right selector here for the reason §6 gives: browsers
 * match it on a *clicked* text input but not on a clicked button or summary, so
 * on this element it means what the spec means by keyboard focus. What is not
 * free is §7's interaction states, which govern "any interactive element" — the
 * summary wears `.control` for those, so the ring arrives with the aero glow §6
 * and §7 pair it with, and the press physics arrive at all. The alternative was
 * a `"use client"` island, which would have put the first RSC boundary on this
 * page for a triangle — and the dictionary this component is handed holds
 * formatter functions, which is precisely what cannot cross one.
 *
 * **With no run there is no `<details>` at all.** §10: an unscored meter is a
 * hollow track plus "connect AI to activate scoring" — "never zeros, never
 * red" — and this is the surface where that line fits beside it. A disclosure
 * that opens onto nothing is worse than no disclosure, and a 0% bar would claim
 * a score that was never computed.
 *
 * Opening a disclosure changes nothing: no row is written and no score moves.
 * What it opens *onto* is a control — §13's narrowing files open Shoulds under
 * the score, so the expansion is the only place §5's third move exists for one.
 * That is why this element opens itself when a move names such a gap: a message
 * inside a collapsed disclosure is not a message, and the redirect that carries
 * it has nowhere else to land.
 */
export function ReadinessPanel({
  run,
  t,
  itemKey,
  gapsByCheck,
  noLongerApplicable,
  outcome,
  openOnCheck = null,
}: {
  run: RunView | null;
  t: Dictionary;
  /**
   * §8.27: a row's gap chip lands here "with the check list expanded and that check
   * scrolled into view". The check's id, read off the URL's `check` param — the fragment
   * alone reveals nothing on the app router's client navigation (`CHECK_PARAM`). Opens the
   * panel only when the run draws that check; an id the run does not carry opens nothing,
   * as a move naming a gap the page does not hold does not.
   */
  openOnCheck?: string | null;
  /**
   * The four below are the expansion's, not the meter's — this component only
   * carries them across. §5's moves belong to the checks inside `CheckList`,
   * and threading them keeps `composeRunView` a function of the stored run
   * alone: a gap's disposition is current state and does not belong in a run.
   * The same holds for what §4's engine closed, which is a ledger fact rather
   * than anything the run said.
   */
  itemKey: string;
  gapsByCheck: ReadonlyMap<string, MoveableGap>;
  noLongerApplicable: NoLongerApplicable;
  outcome: GapMoveClaim | null;
}) {
  if (run === null) {
    return (
      // The same 400 and the same inset the summary carries — §8.25's 8 by 4 — so the
      // track sits in one place whether or not there is a run behind it.
      <div
        data-testid="readiness"
        className="flex max-w-[400px] flex-col gap-[8px] px-[4px] py-[8px]"
      >
        <Meter score={null} size={8} label={t.item.readiness} emptyLabel={t.list.noScoring} />
        <span className="type-ui-footnote text-n-secondary">{t.list.noScoring}</span>
      </div>
    );
  }

  /**
   * Whether the URL's move landed on a gap that lives *in here*.
   *
   * Open only then. A gap with a card is reported on the card, above and
   * already visible, and opening the whole rubric to repeat it would be a
   * page-sized reaction to a one-line message. The check's state is part of the
   * question because a line renders the move only when it is unclear — opening
   * onto a gap the list does not draw would be a disclosure that opens onto
   * nothing, which §10 already refuses elsewhere on this component.
   */
  const opensOntoTheMovedGap = run.checks.some((check) => {
    if (check.state !== "unclear" || outcome === null || outcome.gapId === null) return false;
    const gap = gapsByCheck.get(check.checkId);
    return gap !== undefined && gap.id === outcome.gapId && !gapHasCard(gap);
  });

  const opensOntoTheLinkedCheck =
    openOnCheck !== null && run.checks.some((check) => check.checkId === openOnCheck);

  return (
    <details
      data-testid="readiness"
      open={opensOntoTheMovedGap || opensOntoTheLinkedCheck || undefined}
      className="group flex flex-col"
    >
      {/* §8.25's one recipe for a summary (`DISCLOSURE_SUMMARY_CLASSES`): §7's interaction
          states on the whole hit area from `.control` — hover overlay, press physics, and
          the focus ring *with* the aero glow §6 and §7 pair it with — with the specular
          edge off, since that edge is Primary's alone; radius `--r-sm`; pad 8 vertical by 4
          horizontal; the marker removed in both spellings, because the affordance is the
          chevron and a browser triangle beside it would be two. §8.24 bounds the meter
          block at 400: the summary is a column of two lines, the meter row and the points. */}
      <summary
        className={cx(
          DISCLOSURE_SUMMARY_CLASSES,
          "type-mono-readout max-w-[400px] flex-col items-stretch gap-[8px] text-n-secondary",
        )}
      >
        <span className="flex items-center gap-[12px]">
          <span className="min-w-0 flex-1">
            <Meter
              score={run.score}
              size={8}
              label={t.item.readiness}
              emptyLabel={t.list.noScoring}
            />
          </span>

          {/* §8: the percentage sits beside the track, in mono-readout. It is the same
              rounded number the fill is drawn at and the same one a screen reader
              announces — §13 pairs colour with *the* value. The sign comes from the
              dictionary because §12 renders numbers per locale and Turkish puts it
              first. §8.25's chevron stands 4 from it, 16, swapped rather than rotated. */}
          <span className="flex shrink-0 items-center gap-[4px]">
            <span className="text-n-primary">{t.item.scorePercent(run.score)}</span>
            <DisclosureChevron />
          </span>
        </span>

        {/* §4's renormalized denominator. The not-asked lines below are why
            it is 99 and not 100, but only once it is on screen to be asked
            about. The run's freshness stood beside it until T0.48 moved it to
            the page topbar's readout slot, where §4 puts it. */}
        <span>{t.item.pointsOf(run.earned, run.denominator)}</span>
      </summary>

      <div className="flex flex-col gap-[16px] p-[8px] pt-[16px]">
        <CheckList
          checks={run.checks}
          t={t}
          itemKey={itemKey}
          gapsByCheck={gapsByCheck}
          noLongerApplicable={noLongerApplicable}
          outcome={outcome}
        />

        {/* A run written before `scoring_check_not_asked` existed lists its
            verdicts and stops short of the rubric, and nothing above accounts
            for the difference — §1 law 3's "a number that cannot be
            interrogated". So the list says it is short rather than reading as
            complete, and the missing lines are *not* reconstructed from the
            pack that ships today, which is the defect drizzle/0011 removed.

            Under the list, where a footnote about a list belongs, and in the
            same quiet ui-footnote the not-asked reasons use. §0 law 1 keeps
            Warning and Danger off it: an old run is not a fault. Temporary —
            see `RunView.notAskedUnrecorded`. */}
        {run.notAskedUnrecorded ? (
          <p className="type-ui-footnote text-n-secondary">{t.item.checksNotAskedUnrecorded}</p>
        ) : null}

        {/* §5 stamps pack, version and model on every run, and §8 puts data in
            mono. Quiet, and always there: a number nobody can trace is a number
            nobody can argue with. */}
        <p className="type-mono-readout text-n-secondary">
          {t.item.provenance(
            run.provenance.packId,
            run.provenance.packVersion,
            run.provenance.model,
          )}
        </p>
      </div>
    </details>
  );
}
