import { denominatorFor } from "./scoring";
import type { RubricCheck, SkillPack } from "./types";

/**
 * §5's laws, as code.
 *
 * "Any new check — including ones promoted from the probe library by the
 * learning loop — must take its points from an existing check. This zero-sum
 * budget is what keeps the standard holdable in a human head."
 *
 * A budget enforced by convention is a budget that drifts: someone adds a check
 * worth 4, the rubric quietly becomes 104, and every score since is measured
 * against a different standard than the one before it. So the rule lives here,
 * runs at load (`src/packs/index.ts`), and refuses to let a broken pack exist
 * rather than reporting it somewhere nobody looks.
 */

/** §5's budget. The base rubric is worth exactly this, always. */
export const RUBRIC_TOTAL = 100;

/** Semver, loosely — three dot-separated numbers, optionally pre-release. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Every check a pack contains, base and layered — the id space is one space. */
export function allChecks(pack: SkillPack): RubricCheck[] {
  return [...pack.checks, ...pack.layers.flatMap((layer) => layer.checks)];
}

/**
 * Every problem with a pack, not just the first.
 *
 * All of them, because a pack is edited by hand and fixing one error per run is
 * a slow way to transcribe twenty checks.
 */
export function validatePack(pack: SkillPack): string[] {
  const problems: string[] = [];

  if (!SEMVER.test(pack.version)) {
    problems.push(`version "${pack.version}" is not semver — §5 versions rubrics like documents`);
  }

  // §5's zero-sum budget, on the base only. A layer floats above the rubric
  // (§4), so its points are additional by design and counting them here would
  // make the budget unenforceable for any pack that has one.
  const base = denominatorFor(pack.checks);
  if (base !== RUBRIC_TOTAL) {
    problems.push(
      `base checks sum to ${base}, not ${RUBRIC_TOTAL} — §5's budget is zero-sum, so a new ` +
        `check takes its points from an existing one`,
    );
  }

  const checks = allChecks(pack);

  // Ids are one space across base and layers, because they land in one
  // `gap.check_id` column and one evidence link.
  const seen = new Set<string>();
  for (const check of checks) {
    if (seen.has(check.id)) problems.push(`duplicate check id "${check.id}"`);
    seen.add(check.id);

    if (!Number.isInteger(check.points) || check.points <= 0) {
      problems.push(
        `check "${check.id}" has points ${check.points}; points must be a positive integer`,
      );
    }
  }

  // §6: "every objection must bind to a rubric check ID; unbound objections are
  // discarded." A question that names no real check is an objection nothing can
  // discard, because it arrives already inside the bank.
  for (const question of pack.interview) {
    if (!seen.has(question.checkId)) {
      problems.push(
        `interview question binds to "${question.checkId}", which this pack has no check for`,
      );
    }
  }

  return problems;
}

/** `validatePack`, but loud. What the registry calls at load. */
export function assertValidPack(pack: SkillPack): void {
  const problems = validatePack(pack);
  if (problems.length === 0) return;

  throw new Error(
    `skill pack "${pack.id}@${pack.version}" is invalid:\n` +
      problems.map((problem) => `  - ${problem}`).join("\n"),
  );
}
