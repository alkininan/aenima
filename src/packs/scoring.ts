import type { CheckResult, RubricCheck, SkillPack } from "./types";

/**
 * Applicability and renormalization — product-spec.md §4 and §5.
 *
 * This is the arithmetic everything else trusts, so it is pure: no clock, no
 * database, no provider. Given a pack and the conditions that held for one
 * artifact, it says which checks count and what they are worth out of.
 *
 * §4: "Conditions are evaluated by the agent in the same pass that scores;
 * non-applicable checks leave the denominator. … Denominators renormalize when
 * conditional checks enter or leave."
 *
 * Both directions are real and they are not symmetric. A *check* with a
 * condition leaves the base when its condition fails — `prd-15` on a PRD with
 * no list surface, `prd-16` on an admin dashboard. A *layer* enters when its
 * condition holds — the safety layer on anything with user-to-user visibility.
 * That is why the pack's own checks sum to 100 and a layer's do not.
 */

/** Convenience for callers holding a list rather than a set. */
export function conditionSet(conditionsMet: readonly string[]): ReadonlySet<string> {
  return new Set(conditionsMet);
}

/**
 * Every check that counts for an artifact whose conditions are `conditionsMet`.
 *
 * Order is the pack's own — base checks in rubric order, then each layer's, in
 * the order the pack declares them. A stable order matters because this feeds a
 * per-check list a person reads (§8's meter expansion), and a list that
 * reshuffles between runs is a list nobody can compare.
 */
export function applicableChecks(pack: SkillPack, conditionsMet: readonly string[]): RubricCheck[] {
  const met = conditionSet(conditionsMet);

  // A base check counts unless it carries a condition that did not hold.
  const base = pack.checks.filter(
    (check) => check.appliesWhen === undefined || met.has(check.appliesWhen.id),
  );

  // A layer's checks count only when the layer's own condition held. A layer
  // check may carry its own condition too, and both have to hold.
  const layered = pack.layers
    .filter((layer) => met.has(layer.appliesWhen.id))
    .flatMap((layer) =>
      layer.checks.filter(
        (check) => check.appliesWhen === undefined || met.has(check.appliesWhen.id),
      ),
    );

  return [...base, ...layered];
}

/** What the applicable checks are worth in total — §5's renormalized denominator. */
export function denominatorFor(checks: readonly RubricCheck[]): number {
  return checks.reduce((total, check) => total + check.points, 0);
}

export type RunScore = {
  earned: number;
  denominator: number;
  /** §5: 0–100, out of the renormalized denominator. */
  score: number;
};

/**
 * The score for a set of verdicts.
 *
 * Only applicable checks are counted, and a verdict for a check that does not
 * apply is ignored rather than an error: §4 has applicability decided in the
 * same pass as scoring, so a run can legitimately carry a result for a check
 * that later renormalized out, and silently dropping it is what keeps the
 * denominator honest.
 *
 * A check with no verdict scores nothing. That is deliberate — §5's checks are
 * binary, so "not answered" and "failed" are worth the same, and treating an
 * absent verdict as a pass would let a truncated run report a perfect score.
 *
 * The denominator is zero only for a pack with no applicable checks at all,
 * which is not a real pack; the guard exists so the arithmetic cannot produce
 * `NaN` and hand it to a meter.
 */
export function scoreRun(
  pack: SkillPack,
  conditionsMet: readonly string[],
  results: readonly CheckResult[],
): RunScore {
  const checks = applicableChecks(pack, conditionsMet);
  const denominator = denominatorFor(checks);

  const passed = new Set(results.filter((result) => result.passed).map((result) => result.checkId));

  const earned = checks.reduce(
    (total, check) => (passed.has(check.id) ? total + check.points : total),
    0,
  );

  return {
    earned,
    denominator,
    score: denominator === 0 ? 0 : (earned / denominator) * 100,
  };
}
