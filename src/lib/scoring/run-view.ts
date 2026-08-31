import { denominatorFor, percentageOf } from "@/packs/scoring";
import type { CheckTag, SkillPack } from "@/packs/types";
import { allChecks } from "@/packs/validate";

import { renderEvidence } from "./evidence";

/**
 * A stored run, as a person reads it — product-spec.md §1 law 3.
 *
 * "Every score, flag, and suggestion expands into the exact quoted gap. A number
 * that cannot be interrogated does not ship." This is the composition that makes
 * that literal: a run's rows become one ordered list in which every check says
 * what happened to it.
 *
 * Pure. No database, no clock, no provider — the run comes in as data and the
 * view comes out, so every rule below is testable without any of the three.
 *
 * **Nothing about the run is invented here, and that includes what it did not
 * ask.** The denominator was renormalized when the run was written (§4), the
 * score is `percentageOf` and nothing else (§5's one place a score is divided),
 * and tag, points, verdicts and the not-asked checks with their conditions are
 * all read off stored rows — T2.3 copied the first two there and T2.4's review
 * added the rest (drizzle/0011), so a run stays readable against the rubric that
 * produced it rather than the one that ships today.
 *
 * **The pack is consulted for exactly two things: prose and order**, and it is
 * optional for that reason. Both degrade to something honest when the run's pack
 * no longer ships — the ids stand on their own and the list falls back to a
 * stable order — because a stored run must not become unreadable just because a
 * rubric was retired. Everything that decides *what a check's line says* comes
 * from the run.
 */

/** What one check's line says. Exactly three things can have happened to a check. */
export type CheckLine = {
  checkId: string;
  /**
   * The rubric's own wording — §7.2 transcribed, and content the pack owns
   * rather than a string the product says (see `src/packs/types.ts`).
   *
   * **Null when the loaded pack has no check with this id**, or when no pack
   * ships for the run at all. `getPack` returns the *current* pack and a run is
   * stamped with the pack version that produced it, so a rubric that has since
   * dropped or renamed a check — or been retired entirely — leaves a real,
   * scored verdict with no sentence to show. The id is still true, so the line
   * renders on its own rather than disappearing — a verdict that counted toward
   * the score must not vanish from the list that explains it. See the open
   * question in docs/build-log.md: prose is not versioned with the run the way
   * tag, points and the not-asked conditions are.
   */
  prose: string | null;
  tag: CheckTag;
  points: number;
} & (
  | { state: "passed" }
  /**
   * §12's voice: "this section was unclear", never "failed". The evidence is
   * §5's own sentence shape, rendered by the one function that renders it.
   */
  | { state: "unclear"; evidence: string }
  /**
   * §4: the check left the denominator. `condition` is the sentence that did
   * **not** hold, in the words of the pack that ran — it is written
   * affirmatively there, so a surface that prints it bare states the opposite of
   * the reason. Negating it is the surface's job
   * (`t.item.checkNotAskedReason`).
   */
  | { state: "not-asked"; condition: string }
);

export type RunProvenance = {
  packId: string;
  packVersion: string;
  model: string;
  /** ISO-8601, UTC. The surface renders it relative, against its own read clock. */
  scoredAt: string;
  /** §5's queue. Non-null means a retry is pending on this run's artifact. */
  nextScoringAttemptAt: string | null;
};

export type RunView = {
  /**
   * §5's 0–100, **rounded exactly once, here.**
   *
   * The fill width, the readout beside it and the value a screen reader
   * announces all read this one number, because §13 pairs colour with "the
   * numeric value" and a bar drawn at 66.67 beside a label reading 67 has two
   * numeric values, one of which nobody can see.
   */
  score: number;
  earned: number;
  /** §4's renormalized total. 99 for Ghost mode, and the not-asked lines say why. */
  denominator: number;
  checks: CheckLine[];
  /**
   * **True when this run cannot say what it did not ask.**
   *
   * A run written before `scoring_check_not_asked` existed (drizzle/0011) has
   * verdicts and no not-asked rows, so its list stops short of the rubric and
   * nothing on the page accounts for the difference. That is the shape §1 law 3
   * forbids — "a number that cannot be interrogated" — so the surface says so in
   * one line rather than letting the list read as complete.
   *
   * **The absence is detected, never filled.** Deriving the missing lines from
   * the pack that ships today is exactly the defect 0011 removed: it would be
   * sound only for as long as the rubric happens not to have moved, which is the
   * assumption that fails silently later.
   *
   * The arithmetic is the run's own rows against the rubric's total, and §5's
   * zero-sum budget is what makes that comparison stable: `validatePack` holds
   * the base checks to exactly `RUBRIC_TOTAL`, so "a new check takes its points
   * from an existing one" and a rubric edit cannot move the total underneath a
   * stored run. Only a layer arriving or leaving can, and a layer that did not
   * enter writes not-asked rows — which is the case this flag excludes.
   *
   * False when no pack is loaded: with nothing to compare against, the honest
   * answer is to say nothing rather than to guess.
   *
   * **Delete this, its string and its line once no such run remains** — see
   * docs/build-log.md open question 19.
   */
  notAskedUnrecorded: boolean;
  provenance: RunProvenance;
};

/** What a stored run holds, narrowed to what this needs. Keeps the module DB-free. */
export type StoredRunInput = {
  packId: string;
  packVersion: string;
  model: string;
  scoredAt: string;
  nextScoringAttemptAt: string | null;
  earned: number;
  denominator: number;
  results: readonly {
    checkId: string;
    tag: CheckTag;
    points: number;
    passed: boolean;
    requirementId: string | null;
    quote: string | null;
    note: string | null;
  }[];
  /**
   * §4's renormalization, as the run recorded it.
   *
   * `conditionsMet` is deliberately **not** in this type. It was here to
   * recompute the excluded set against whatever pack was loaded, which made a
   * stored denominator explainable by a rubric that had moved on; the rows are
   * now written with the run (drizzle/0011) and the condition list is the write
   * path's business alone.
   */
  notAsked: readonly {
    checkId: string;
    tag: CheckTag;
    points: number;
    /** The condition that did **not** hold, affirmatively worded. */
    conditionWhen: string;
  }[];
};

/**
 * The canonical view of one run.
 *
 * **Order is the pack's own**, base checks in rubric order then each layer's,
 * with a not-asked check sitting in its rubric position — `prd-15` between 14
 * and 16, which is where someone looking for check 15 goes. The stored rows are
 * deliberately unordered (`check_id` sorts `prd-10` before `prd-2`), so this
 * restores pack order the same way `run.ts` does on the cached path.
 *
 * A check the current pack does not name sorts to the end, and ties there break
 * on the id. The tie-break is what makes the order **total** rather than merely
 * pack-shaped: without it, two checks the pack cannot place keep whatever order
 * the database happened to return them in, so the same stored run could render
 * in two orders on two page loads. `prd-10` before `prd-2` is ugly and it is
 * stable, which is the property that matters for rows nobody can rank properly.
 *
 * **`pack` is optional**, and undefined is the case where none ships for this
 * run's id at all. The run still has a score, its verdicts, its not-asked rows
 * and its provenance, so it still renders: every line falls back to its id with no prose
 * and the whole list to id order. §10's hollow track is the *no-key* state and
 * says "connect AI to activate scoring" — a sentence that is false to someone
 * holding a key and a stored run, which is why a retired rubric must not route
 * there.
 */
export function composeRunView(pack: SkillPack | undefined, run: StoredRunInput): RunView {
  const checksInPack = pack ? allChecks(pack) : [];
  const order = new Map(checksInPack.map((check, index) => [check.id, index]));
  const prose = new Map(checksInPack.map((check) => [check.id, check.prose]));

  const verdicts: CheckLine[] = run.results.map((row) => {
    const shared = {
      checkId: row.checkId,
      prose: prose.get(row.checkId) ?? null,
      tag: row.tag,
      points: row.points,
    };

    if (row.passed) return { ...shared, state: "passed" };

    return {
      ...shared,
      state: "unclear",
      // The three parts are stored apart precisely so a surface can render them
      // into §5's sentence: `MN-2: 'nearby' — same venue, or within 100 m?`.
      // One function, so the gap list and this list cannot disagree.
      evidence: renderEvidence({
        requirementId: row.requirementId,
        quote: row.quote,
        note: row.note ?? "",
      }),
    };
  });

  // Read off the run, not recomputed: these rows say what *this* run did not
  // ask and why, and they go on saying it after the rubric changes underneath
  // them. Prose is looked up exactly as a verdict's is, and is null on the same
  // terms — it is the one thing the pack still owns.
  const notAsked: CheckLine[] = run.notAsked.map((row) => ({
    checkId: row.checkId,
    prose: prose.get(row.checkId) ?? null,
    tag: row.tag,
    points: row.points,
    state: "not-asked",
    condition: row.conditionWhen,
  }));

  const checks = [...verdicts, ...notAsked].sort((a, b) => {
    const byPack =
      (order.get(a.checkId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.checkId) ?? Number.MAX_SAFE_INTEGER);
    return byPack !== 0 ? byPack : a.checkId.localeCompare(b.checkId);
  });

  // What this run's own rows say the rubric was worth, against what it is worth.
  // A run that recorded its exclusions accounts for every point either way; one
  // written before it could accounts for the applicable checks alone.
  const accounted = [...run.results, ...run.notAsked].reduce((total, row) => total + row.points, 0);

  return {
    score: Math.round(percentageOf(run.earned, run.denominator)),
    earned: run.earned,
    denominator: run.denominator,
    checks,
    notAskedUnrecorded:
      pack !== undefined &&
      run.results.length > 0 &&
      run.notAsked.length === 0 &&
      accounted < denominatorFor(checksInPack),
    provenance: {
      packId: run.packId,
      packVersion: run.packVersion,
      model: run.model,
      scoredAt: run.scoredAt,
      nextScoringAttemptAt: run.nextScoringAttemptAt,
    },
  };
}
