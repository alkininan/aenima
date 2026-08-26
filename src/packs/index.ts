import { featurePrdPack } from "./feature-prd";
import type { SkillPack } from "./types";
import { assertValidPack } from "./validate";

export type {
  ApplicabilityCondition,
  CheckResult,
  CheckTag,
  ConditionalLayer,
  InterviewQuestion,
  RubricCheck,
  ScoringRun,
  SkillPack,
} from "./types";
export {
  applicableChecks,
  conditionSet,
  denominatorFor,
  packConditions,
  percentageOf,
  scoreRun,
} from "./scoring";
export type { RunScore } from "./scoring";
export { RUBRIC_TOTAL, allChecks, assertValidPack, validatePack } from "./validate";

/**
 * The pack registry — the one entry point.
 *
 * §7 has packs "maintained in a git repo, synced to workspaces on release,
 * pinnable and overridable per workspace". Only the git repo half exists yet;
 * this is where the sync lands when it does.
 *
 * Every registered pack is validated **at module load**, and a bad one throws
 * rather than reports. §5's zero-sum budget is "what keeps the standard holdable
 * in a human head" — a rubric that quietly became worth 104 would score every
 * artifact against a different standard than the one before it, and silently.
 * The cost of throwing here is that a transcription slip breaks the build, which
 * is the outcome we want.
 */
const PACKS = [featurePrdPack] satisfies SkillPack[];

for (const pack of PACKS) assertValidPack(pack);

const BY_ID = new Map(PACKS.map((pack) => [pack.id, pack]));

/** Every pack, in registration order. */
export function listPacks(): readonly SkillPack[] {
  return PACKS;
}

/**
 * One pack by id, or undefined.
 *
 * Undefined rather than a throw: a pinned pack id comes from a workspace row
 * (§7's "pinnable and overridable per workspace"), so a miss is data the caller
 * has to handle, not a programmer error it can assume away.
 */
export function getPack(id: string): SkillPack | undefined {
  return BY_ID.get(id);
}

export { featurePrdPack };
