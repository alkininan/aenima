import { Button } from "@/components/ui/Button";
import {
  INPUT_CONTROL_CLASSES,
  INPUT_LABEL_CLASSES,
  inputCompositeClasses,
  inputFieldClasses,
  inputHelperClasses,
} from "@/components/ui/variants";
import type { Dictionary } from "@/i18n";
import type { Actor } from "@/lib/actor";
import type { GapMoveOutcome } from "@/lib/gap-move";

import { settleGap } from "./actions";

/**
 * One gap's settled stamp and the move available on it — product-spec.md §5's
 * third negotiation move, in the one place it is implemented.
 *
 * **This component is rendered twice and written once**, by `GapList`'s card and
 * by `CheckList`'s unclear check line. A gap genuinely appears in both places
 * and neither is dispensable: §13's narrowing keeps open Shoulds off the card,
 * so the expansion is the only route to accepting one, while the card is where
 * §13 puts what an item owes a person. Two implementations of a move would
 * drift, which is the same reason `belongsOnThePage` lives inside `GapList`
 * rather than at its call sites.
 *
 * **The stamp is here too, not just the control.** §1 law 7: "gaps, exclusions,
 * and flags are visible debts that a named person accepts. Freedom is total;
 * deniability is zero." A reader interrogating the score has to see the name
 * wherever they are reading, so an unclear check whose gap someone owns says so
 * in the expansion as well as on the card.
 *
 * **No client island.** The form is a plain `<form action={settleGap}>` inside a
 * `<details>`, and the outcome comes back in the URL rather than through
 * `useActionState`. `Input.tsx` is `"use client"`, so the field is assembled
 * from the same server-safe class builders that component uses — the recipe is
 * shared even though the assembly is not. §8's floating label is pure CSS
 * (`:placeholder-shown`), so it behaves identically here.
 *
 * **Never add `encType` to the form.** See `actions.ts`: a urlencoded action
 * POST is silently dropped by Next with JavaScript off.
 *
 * **No Danger anywhere.** §0 law 1 keeps meters and gaps out of Danger red, and
 * §0 law 2 reserves it for destructive actions — accepting is not destructive
 * and reopening is not either, and both have standing reversals. The one
 * exception is the field's own validation line, which §8 tones `--danger` and
 * §0 law 2 names explicitly as a validation error.
 */

/** A gap as a move needs it. Narrower than `GapView`: no evidence, no note. */
export type MoveableGap = {
  id: string;
  checkId: string;
  tag: "must" | "should";
  disposition: "open" | "accepted" | "excluded";
  resolvedBy: Actor | null;
  resolutionNote: string | null;
};

/** What the URL says came of the last move on *this* gap, if it was this one. */
export type GapMoveState = GapMoveOutcome | null;

function actorWords(actor: Actor | null, t: Dictionary): string {
  if (!actor) return t.item.actorOther;
  if (actor.kind === "agent") return actor.name;
  return actor.kind === "self" ? t.item.actorSelf : t.item.actorOther;
}

/**
 * Whether the URL's claim is still true of the row in front of us.
 *
 * A search param is a statement about a request that finished; the row is the
 * truth now. Between the redirect and this render, a re-score can close the gap
 * or someone else can move it, and a bookmarked or shared link carries the
 * param indefinitely. So each token renders only where the current state agrees
 * with it — the same epistemics as `writeRun`'s "where nothing changes, no
 * ledger row is written".
 */
function stillTrue(outcome: GapMoveOutcome, gap: MoveableGap): boolean {
  if (outcome === "accepted") {
    // "You accepted this" is checkable rather than inherited: `describeActor`
    // only says `self` when the row's resolver is the person reading it.
    return gap.disposition === "accepted" && gap.resolvedBy?.kind === "self";
  }
  if (outcome === "reopened") return gap.disposition === "open";
  if (outcome === "not-open") return gap.disposition !== "open";
  if (outcome === "not-accepted") return gap.disposition !== "accepted";
  // The rest are about the request, not about the row, so the row cannot
  // contradict them.
  return true;
}

export function GapMoves({
  gap,
  itemKey,
  t,
  outcome,
}: {
  gap: MoveableGap;
  itemKey: string;
  t: Dictionary;
  /** Non-null only on the one gap the URL names. */
  outcome: GapMoveState;
}) {
  const shown = outcome !== null && stillTrue(outcome, gap) ? outcome : null;

  // §5's first move is Phase 3's ticket, so an excluded gap carries its stamp
  // and no control. Saying nothing is not the same as offering nothing.
  if (gap.disposition === "excluded") {
    return <SettledStamp gap={gap} t={t} label={t.item.excludedBy} />;
  }

  if (gap.disposition === "accepted") {
    return (
      <div className="flex flex-col gap-[8px]">
        <SettledStamp gap={gap} t={t} label={t.item.settledBy} />
        {shown === null ? null : <MoveMessage outcome={shown} t={t} />}
        <form action={settleGap}>
          <input type="hidden" name="key" value={itemKey} />
          <input type="hidden" name="gapId" value={gap.id} />
          <input type="hidden" name="intent" value="reopen" />
          {/* Secondary rather than Ghost: the accepted card is already at
              opacity .60, and §8 warns a text-only control "vanishes precisely
              when it has the most to say". §0 law 7 dims it, never disables it. */}
          <Button type="submit" size="sm" variant="secondary">
            {t.item.gapReopen}
          </Button>
        </form>
      </div>
    );
  }

  return <AcceptForm gap={gap} itemKey={itemKey} t={t} outcome={shown} />;
}

/** §1 law 7's name, in the one place it is written. */
function SettledStamp({
  gap,
  t,
  label,
}: {
  gap: MoveableGap;
  t: Dictionary;
  label: (actor: string) => string;
}) {
  return (
    <p className="type-ui-footnote text-n-secondary">
      {label(actorWords(gap.resolvedBy, t))}
      {gap.resolutionNote ? ` — ${gap.resolutionNote}` : ""}
    </p>
  );
}

/**
 * What came of the last move, when the row still agrees with it.
 *
 * `--n-secondary`, not a tone: none of §5's outcomes is destructive and none is
 * a validation error about a field. The one that *is* — an empty reason — is
 * rendered on the field's own helper line instead, where §8 puts it.
 */
function MoveMessage({ outcome, t }: { outcome: GapMoveOutcome; t: Dictionary }) {
  return (
    <p role="status" className="type-ui-footnote text-n-secondary">
      {t.item.gapMove[outcome]}
    </p>
  );
}

/** The reason a person gives, and the confirm — §8's field grammar, server-side. */
function AcceptForm({
  gap,
  itemKey,
  t,
  outcome,
}: {
  gap: MoveableGap;
  itemKey: string;
  t: Dictionary;
  outcome: GapMoveState;
}) {
  const fieldId = `gap-reason-${gap.id}`;
  const helperId = `gap-reason-helper-${gap.id}`;

  // §8 tones a helper line's error state `--danger`, and §0 law 2 names
  // validation errors as one of Danger's three sanctioned uses. Everything else
  // §5 can answer is about the request rather than the field, so it renders
  // below the form in the neutral tone.
  const fieldProblem = outcome === "reason-required" || outcome === "reason-too-long";
  const requestProblem = outcome !== null && !fieldProblem ? outcome : null;

  return (
    <details
      // Reopened by the URL only on a failure, so the reason is one keystroke
      // from being fixed. A move that succeeded closes it: the work is done.
      open={outcome !== null && outcome !== "accepted" && outcome !== "reopened"}
      className="group flex flex-col"
    >
      <summary className="control control-edge-none type-ui-footnote flex w-fit list-none items-center gap-[4px] rounded-sm px-[8px] py-[4px] text-n-secondary [&::-webkit-details-marker]:hidden">
        {t.item.gapAccept}
      </summary>

      {/* No `encType`, and no hand-written `method`/`action`. Next drops a
          `application/x-www-form-urlencoded` action POST and lets it fall
          through to a plain page render, so with JavaScript off that shape is a
          silent no-op. React's server renderer picks `multipart/form-data` for
          an action form and overrides an `encType` prop that disagrees — it
          warns about the mismatch rather than shipping the wrong body — so the
          real way to break this is to write the `<form>` by hand and post
          somewhere else. The e2e submits this one with JavaScript disabled. */}
      <form action={settleGap} className="flex flex-col gap-[8px] px-[8px] pt-[8px]">
        <input type="hidden" name="key" value={itemKey} />
        <input type="hidden" name="gapId" value={gap.id} />
        <input type="hidden" name="intent" value="accept" />

        <div className={inputCompositeClasses()}>
          <label htmlFor={fieldId} className={INPUT_LABEL_CLASSES}>
            {t.item.gapAcceptReason}
          </label>
          <div className={inputFieldClasses({ invalid: fieldProblem })}>
            <input
              id={fieldId}
              name="reason"
              type="text"
              // Progressive enhancement only. `accept_gap` returns
              // `reason-required` and `gap_resolution_shape` refuses the row —
              // the browser is the convenience, the database is the rule.
              required
              maxLength={2000}
              // §8 (v2.5): the sentinel space is what makes "empty" expressible
              // to `:placeholder-shown`, and it never paints in any state.
              placeholder=" "
              aria-invalid={fieldProblem || undefined}
              aria-describedby={fieldProblem ? helperId : undefined}
              className={INPUT_CONTROL_CLASSES}
            />
          </div>
          <span id={helperId} className={inputHelperClasses(fieldProblem ? "error" : undefined)}>
            {fieldProblem ? t.item.gapMove[outcome] : ""}
          </span>
        </div>

        <Button type="submit" size="md" variant="primary" className="w-fit">
          {t.item.gapAcceptSubmit}
        </Button>
      </form>

      {requestProblem === null ? null : (
        <div className="px-[8px] pt-[8px]">
          <MoveMessage outcome={requestProblem} t={t} />
        </div>
      )}
    </details>
  );
}
