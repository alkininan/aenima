import type { Database } from "@/db/database.types";

/**
 * The skill pack format — product-spec.md §7: "Every artifact type ships with a
 * rubric, an interview bank, critic tests, and probes — together a **skill
 * pack**: versioned content, maintained in a git repo, synced to workspaces on
 * release, pinnable and overridable per workspace."
 *
 * This file is the shape of that content and nothing else. No provider, no
 * database, no prompt: a pack is data that later tickets load, pin and score
 * against, and keeping it inert is what lets the standard be reviewed by
 * someone who does not read TypeScript for a living.
 */

type ArtifactKind = Database["public"]["Enums"]["artifact_kind"];

/**
 * §5: each check is "tagged **Must** (blocks handover) or **Should**
 * (advisory)". There is no third tag, and the enum is closed for the same
 * reason §5's budget is zero-sum — a rubric with a middle tier is a rubric that
 * negotiates with itself.
 */
export type CheckTag = "must" | "should";

/**
 * §4's applicability engine, as data rather than as a prompt.
 *
 * "The same engine governs individual checks: 'offline behavior' applies to a
 * network-dependent mobile screen, not to an admin dashboard. Conditions are
 * evaluated by the agent in the same pass that scores; non-applicable checks
 * leave the denominator."
 *
 * `when` is the condition in the spec's own words, carried so the agent that
 * evaluates it and the human who reviews the pack read the same sentence.
 */
export type ApplicabilityCondition = {
  id: string;
  when: string;
};

export type RubricCheck = {
  /** Stable across versions. What a gap, an objection and an evidence link cite. */
  id: string;
  /** §7.2's wording, transcribed. The rubric is law; this is not a paraphrase. */
  prose: string;
  tag: CheckTag;
  /** §5's zero-sum budget. Never optional — a check without points is not a check. */
  points: number;
  /**
   * Absent means the check always applies. Present means it can *leave* the
   * denominator, which is what §4 means by renormalization.
   */
  appliesWhen?: ApplicabilityCondition;
};

/**
 * §4: "**Conditional layers float above all types:** a safety layer … and a
 * data/compliance layer."
 *
 * A layer is not part of any one rubric — it sits above all of them — so its
 * checks *enter* the denominator rather than leaving it. That asymmetry is why
 * a layer is its own thing and not a check with a condition: a pack's own
 * checks sum to 100 (§5), and a layer's do not count against that budget.
 */
export type ConditionalLayer = {
  id: string;
  appliesWhen: ApplicabilityCondition;
  checks: RubricCheck[];
};

/**
 * One question from the interview bank, bound to the check it closes.
 *
 * §6: "Every objection must bind to a rubric check ID; unbound objections are
 * discarded (the structural cure for nitpicking)." `checkId` is therefore
 * required rather than optional — an unbound question is not expressible, and
 * `validatePack` checks that the id names a check this pack actually has.
 */
export type InterviewQuestion = {
  checkId: string;
  /**
   * Appendix B's prompt.
   *
   * Null for item 19, which the bank itself writes as "Critic sweep, no
   * question" — that is a stage direction, not something anyone says, and
   * transcribing it as a prompt would put words in an interviewer's mouth.
   */
  prompt: string | null;
  /** The critic's test: the condition under which the answer closes the check. */
  criticTest: string;
};

export type SkillPack = {
  id: string;
  /** §5: "Rubrics are versioned like documents." Semver. */
  version: string;
  /** The artifact this pack scores. One list of kinds, shared with the schema. */
  artifactKind: ArtifactKind;
  /** The base rubric. §5's budget: these sum to 100. */
  checks: RubricCheck[];
  layers: ConditionalLayer[];
  interview: InterviewQuestion[];
};

/* -------------------------------------------------------------------------- */
/* The scoring run — the contract T2.3 fills                                  */
/* -------------------------------------------------------------------------- */

/**
 * One check's verdict.
 *
 * A discriminated union, so §5's two laws are structural rather than
 * remembered. "**Checks are binary with evidence.** A check passes or fails,
 * and a failure quotes the exact gap" — so `passed` is a boolean and a failure
 * without an evidence quote cannot be constructed. "No vibes-based partial
 * credit" is why there is no score on a result: a check is worth its points or
 * it is worth none of them.
 */
export type CheckResult =
  { checkId: string; passed: true } | { checkId: string; passed: false; evidence: string };

/**
 * What a scoring run produced. Nothing makes one yet — T2.3 does.
 *
 * §5: "Every scoring run stamps provider + model + rubric version." All three
 * are recorded here, because a score whose provenance is unknown cannot be
 * re-baselined when the model or the rubric moves, and §5 requires exactly that
 * ("Switching AI provider or editing a rubric triggers a quiet re-baseline pass
 * so numbers never wobble without explanation").
 */
export type ScoringRun = {
  packId: string;
  packVersion: string;
  /** §12: one provider is active at a time, and the scorer is pinned. */
  provider: string;
  model: string;
  /** The condition ids that held for this artifact, per §4's engine. */
  conditionsMet: string[];
  /** Every applicable check's verdict. Non-applicable checks are absent. */
  results: CheckResult[];
  /** Points earned, points available, and §5's 0–100 out of them. */
  earned: number;
  denominator: number;
  score: number;
};
