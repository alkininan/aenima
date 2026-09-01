import { Meter } from "@/components/ui/Meter";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import type { Dictionary } from "@/i18n";
import type { GapMoveClaim } from "@/lib/gap-move";
import { relativeTime } from "@/lib/relative-time";
import type { RunView } from "@/lib/scoring/run-view";

import { CheckList } from "./CheckList";
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
  now,
  itemKey,
  gapsByCheck,
  outcome,
}: {
  run: RunView | null;
  t: Dictionary;
  now: number;
  /**
   * The three below are the expansion's, not the meter's — this component only
   * carries them across. §5's moves belong to the checks inside `CheckList`,
   * and threading them keeps `composeRunView` a function of the stored run
   * alone: a gap's disposition is current state and does not belong in a run.
   */
  itemKey: string;
  gapsByCheck: ReadonlyMap<string, MoveableGap>;
  outcome: GapMoveClaim | null;
}) {
  if (run === null) {
    return (
      // The same 400 and the same 8 inset the summary carries, so the track sits
      // in one place whether or not there is a run behind it.
      <div data-testid="readiness" className="flex max-w-[400px] flex-col gap-[8px] p-[8px]">
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

  return (
    <details
      data-testid="readiness"
      open={opensOntoTheMovedGap || undefined}
      className="group flex flex-col"
    >
      {/* §7's interaction states on the whole hit area, from `.control` — hover
          overlay, press physics, and the focus ring *with* the aero glow §6 and
          §7 pair it with. Hand-rolling `hover:bg-hover-overlay` got the first
          and neither of the others; a disclosure is an interactive element and
          §7 governs "any interactive element". `control-edge-none` opts out of
          the specular edge, which §8 states for Primary alone — the same pairing
          an interactive chip uses.

          The marker is removed in both spellings — `list-none` for the standards
          one, the pseudo-element for WebKit's — because §8's affordance is the
          chevron, and a browser triangle beside it would be two. */}
      <summary className="control control-edge-none type-mono-readout flex max-w-[400px] list-none flex-col gap-[8px] rounded-sm p-[8px] text-n-secondary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-[12px]">
          <span className="min-w-0 flex-1">
            <Meter
              score={run.score}
              size={8}
              label={t.item.readiness}
              emptyLabel={t.list.noScoring}
            />
          </span>

          {/* §8: the percentage sits beside the track, in mono-readout. It is
              the same rounded number the fill is drawn at and the same one a
              screen reader announces — §13 pairs colour with *the* value. The
              sign comes from the dictionary because §12 renders numbers per
              locale and Turkish puts it first. */}
          <span className="shrink-0 text-n-primary">{t.item.scorePercent(run.score)}</span>

          {/* Swapped rather than rotated: §6 names no duration for a disclosure
              and v1 makes step changes instant, so nothing is invented here. */}
          <ChevronRightIcon className="size-[16px] shrink-0 group-open:hidden" />
          <ChevronDownIcon className="hidden size-[16px] shrink-0 group-open:block" />
        </span>

        <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px]">
          {/* §4's renormalized denominator. The not-asked lines below are why
              it is 99 and not 100, but only once it is on screen to be asked
              about. */}
          <span>{t.item.pointsOf(run.earned, run.denominator)}</span>
          <span aria-hidden="true">·</span>
          {freshness(run, t, now)}
        </span>
      </summary>

      <div className="flex flex-col gap-[16px] p-[8px] pt-[16px]">
        <CheckList
          checks={run.checks}
          t={t}
          itemKey={itemKey}
          gapsByCheck={gapsByCheck}
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

/**
 * When this was scored, and whether §5's queue is holding a retry.
 *
 * §10: "Provider outage / retry: freshness shows `--warning` dot + mono-readout
 * 'scored 6 h ago — retrying'; no banners." The dot and the sentence are the
 * whole of what a person is told — §12 keeps the voice calm and §0 law 1 keeps
 * Danger off anything that is not destructive. A queued retry is the system
 * working, not an error, and it never reddens.
 *
 * Every system dot in the product is 8 (§8).
 */
function freshness(run: RunView, t: Dictionary, now: number) {
  const elapsed = relativeTime(Date.parse(run.provenance.scoredAt), now);
  const relative =
    elapsed.unit === "justNow"
      ? t.relativeTime.justNow
      : t.relativeTime[elapsed.unit](elapsed.value);

  const retrying = run.provenance.nextScoringAttemptAt !== null;

  return (
    <span className="flex items-center gap-[6px]">
      <span
        aria-hidden="true"
        className={`size-[8px] shrink-0 rounded-pill ${retrying ? "bg-warning" : "bg-prime"}`}
      />
      <span>{retrying ? t.item.scoredRetrying(relative) : t.item.scoredAt(relative)}</span>
    </span>
  );
}
