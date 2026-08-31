import type { ApplicabilityCondition, CheckResult, RubricCheck, SkillPack } from "./types";

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

/**
 * Every distinct condition a pack can be asked about — §4's applicability
 * engine, as the list of questions rather than the answers.
 *
 * A fact about the pack, not about any one run: the same list is what a scoring
 * call asks the model to decide, what a pack review reads to see which
 * judgements a rubric depends on, and what the next pack will need the moment
 * it carries a condition of its own.
 *
 * Both directions are collected, because both are conditions the model answers:
 * a check's own `appliesWhen` (which takes it *out* of the base) and a layer's
 * (which brings its checks *in*). Deduplicated by id and returned in pack order
 * — checks first, then layers — so a question list built from it is stable
 * between runs. Two checks sharing a condition ask about it once.
 */
export function packConditions(pack: SkillPack): ApplicabilityCondition[] {
  const byId = new Map<string, ApplicabilityCondition>();

  const add = (condition: ApplicabilityCondition | undefined): void => {
    if (condition && !byId.has(condition.id)) byId.set(condition.id, condition);
  };

  for (const check of pack.checks) add(check.appliesWhen);
  for (const layer of pack.layers) {
    add(layer.appliesWhen);
    for (const check of layer.checks) add(check.appliesWhen);
  }

  return [...byId.values()];
}

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

/**
 * §5's 0–100. **The one place a score is divided.**
 *
 * Both callers need it and they need it from the same place: a fresh run
 * divides what it just computed, and a stored run divides what it recorded.
 * Two implementations of one formula is two things that can disagree, which is
 * the reason the score is not a column in the first place.
 *
 * A denominator of zero belongs to a pack with no applicable checks, which is
 * not a real pack; the guard exists so the arithmetic cannot produce `NaN` and
 * hand it to a meter.
 */
export function percentageOf(earned: number, denominator: number): number {
  return denominator === 0 ? 0 : (earned / denominator) * 100;
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

  return { earned, denominator, score: percentageOf(earned, denominator) };
}

/**
 * A check that was not asked, and the condition that kept it out.
 *
 * §4's renormalization is invisible arithmetic until someone asks why the
 * denominator is 99, and this is the answer. It is the exact complement of
 * `applicableChecks` over the same pack and the same conditions: every check
 * that has a row in the rubric and no verdict in the run.
 *
 * The condition is carried rather than looked up because the two directions do
 * not share one. A base check is excluded by **its own** `appliesWhen`; a layer
 * check is excluded by **the layer's**, and may never have carried one of its
 * own. A caller holding only the check id could not tell which sentence to show,
 * and would show the wrong one for `prd-20`.
 *
 * **The condition it returns held false.** `ApplicabilityCondition.when` is
 * written affirmatively — "The feature renders a list, so it has empty and
 * first-use states." — and a check is here precisely because that is *not* true
 * of this artifact. A surface that prints `when` on its own states the opposite
 * of the reason; the negation belongs to the surface (see `src/i18n`), and this
 * function only says which sentence is the false one.
 */
export type ExcludedCheck = {
  check: RubricCheck;
  /** The condition that did **not** hold. */
  condition: ApplicabilityCondition;
};

export function excludedChecks(pack: SkillPack, conditionsMet: readonly string[]): ExcludedCheck[] {
  const met = conditionSet(conditionsMet);

  // A base check leaves when its own condition failed.
  const base = pack.checks.flatMap((check) =>
    check.appliesWhen !== undefined && !met.has(check.appliesWhen.id)
      ? [{ check, condition: check.appliesWhen }]
      : [],
  );

  const layered = pack.layers.flatMap((layer) => {
    // The layer never entered: every check it holds is out, and the layer's own
    // condition is why — not whatever a check may additionally carry.
    if (!met.has(layer.appliesWhen.id)) {
      return layer.checks.map((check) => ({ check, condition: layer.appliesWhen }));
    }

    // The layer entered, so a check inside it is out only on its own condition.
    return layer.checks.flatMap((check) =>
      check.appliesWhen !== undefined && !met.has(check.appliesWhen.id)
        ? [{ check, condition: check.appliesWhen }]
        : [],
    );
  });

  return [...base, ...layered];
}
