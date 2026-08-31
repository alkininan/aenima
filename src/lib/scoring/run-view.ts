import { excludedChecks, percentageOf } from "@/packs/scoring";
import type { CheckTag, SkillPack } from "@/packs/types";
import { allChecks } from "@/packs/validate";

import { renderEvidence } from "./evidence";

/**
 * A stored run, as a person reads it — product-spec.md §1 law 3.
 *
 * "Every score, flag, and suggestion expands into the exact quoted gap. A number
 * that cannot be interrogated does not ship." This is the composition that makes
 * that literal: a run's rows plus its pack become one ordered list in which
 * every check says what happened to it.
 *
 * Pure. No database, no clock, no provider — the run comes in as data and the
 * view comes out, so every rule below is testable without any of the three.
 *
 * **No arithmetic is invented here.** The denominator was renormalized when the
 * run was written (§4), the score is `percentageOf` and nothing else (§5's one
 * place a score is divided), and points and tags are read off the stored row
 * rather than looked up — T2.3 copied them there so a run stays readable against
 * the rubric that produced it.
 */

/** What one check's line says. Exactly three things can have happened to a check. */
export type CheckLine = {
  checkId: string;
  /**
   * The rubric's own wording — §7.2 transcribed, and content the pack owns
   * rather than a string the product says (see `src/packs/types.ts`).
   *
   * **Null when the loaded pack has no check with this id.** `getPack` returns
   * the *current* pack and a run is stamped with the pack version that produced
   * it, so a rubric that has since dropped or renamed a check leaves a real,
   * scored verdict with no sentence to show. The id is still true, so the line
   * renders on its own rather than disappearing — a verdict that counted toward
   * the score must not vanish from the list that explains it. See the open
   * question in docs/build-log.md: prose is not versioned with the run the way
   * tag and points are.
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
   * **not** hold — it is written affirmatively in the pack, so a surface that
   * prints it bare states the opposite of the reason. Negating it is the
   * surface's job (`t.item.checkNotAskedReason`).
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
  provenance: RunProvenance;
};

/** What a stored run holds, narrowed to what this needs. Keeps the module DB-free. */
export type StoredRunInput = {
  packId: string;
  packVersion: string;
  model: string;
  scoredAt: string;
  nextScoringAttemptAt: string | null;
  conditionsMet: readonly string[];
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
 * A check the current pack does not name sorts to the end, keeping its relative
 * order — it is still a verdict this run reached and still counted toward the
 * score, so it belongs in the list that explains the score.
 */
export function composeRunView(pack: SkillPack, run: StoredRunInput): RunView {
  const order = new Map(allChecks(pack).map((check, index) => [check.id, index]));
  const prose = new Map(allChecks(pack).map((check) => [check.id, check.prose]));

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

  const notAsked: CheckLine[] = excludedChecks(pack, run.conditionsMet).map(
    ({ check, condition }) => ({
      checkId: check.id,
      prose: check.prose,
      tag: check.tag,
      points: check.points,
      state: "not-asked",
      condition: condition.when,
    }),
  );

  const checks = [...verdicts, ...notAsked].sort(
    (a, b) =>
      (order.get(a.checkId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.checkId) ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    score: Math.round(percentageOf(run.earned, run.denominator)),
    earned: run.earned,
    denominator: run.denominator,
    checks,
    provenance: {
      packId: run.packId,
      packVersion: run.packVersion,
      model: run.model,
      scoredAt: run.scoredAt,
      nextScoringAttemptAt: run.nextScoringAttemptAt,
    },
  };
}
