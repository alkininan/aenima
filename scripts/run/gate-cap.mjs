#!/usr/bin/env node
/**
 * After the gatekeeper — what the run does next, counted (T0.46).
 *
 * The gatekeeper reads the pushed commit and writes `docs/gates/<id>.md`, its last line one
 * of MERGE, MERGE APPLY or HOLD (`.claude/agents/gatekeeper.md`). This file reads that line,
 * the commit the file names, the reviewer's pass in `docs/reviews/<id>.md`, and what
 * `gated.mjs` says of the diff, and answers:
 *
 *   MERGE                      → merge: the closer's merge leg lands the pull request.
 *   MERGE APPLY                → apply: the closer applies the migrations on that word, then
 *                                 merges in the same run.
 *   HOLD, a pass left          → build: HOLD is findings. The builder fixes what the numbered
 *                                 reasons name, the reviewer reads the fixes as the next pass,
 *                                 the closer pushes again and the gatekeeper reads the new
 *                                 commit — the round counted toward the three-corrections rule
 *                                 by the reviewer's pass (`review-cap.mjs`).
 *   HOLD, pass 3               → decision: the third correction still held stops at Decision
 *                                 under §4, one comment quoting the reasons.
 *   a destructive migration    → migration: whatever the verdict, a migration that destroys
 *   that waits                   or rewrites data is the human's `apply` (Build 3, Rules) —
 *                                 the diff is gated, Decision, the migration question.
 *
 * A file with no verdict, no commit, or none at all answers `decision`: a verdict nobody can
 * read is not one anybody enforced.
 */

import { readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";
import { consumedApplies, gatedDiffOf } from "./gated.mjs";
import { GATE_HOLD, GATE_MERGE, GATE_MERGE_APPLY, GATE_VERDICTS, readGate } from "./permission.mjs";
import { MAX_PASSES, readVerdict } from "./review-cap.mjs";

/**
 * What comes after this gate: `{ next, verdict, commit, reasons, why }`, `next` one of
 * `merge`, `apply`, `build`, `migration` or `decision`. `gate` is the gate file's text or
 * null, `review` the reviewer's, `diff` `gatedDiff`'s judgement — `{ ok, reasons, migrations }`.
 */
export function nextAfterGate({ gate = null, review = null, diff = null } = {}) {
  const read = readGate(gate);
  if (read === null) {
    return {
      next: "decision",
      verdict: null,
      commit: null,
      reasons: [],
      why: "no gatekeeper verdict was written",
    };
  }
  const base = { verdict: read.verdict, commit: read.commit, reasons: read.reasons };
  if (read.verdict === null) {
    const ends = read.last === null ? "nothing" : `"${read.last}"`;
    return {
      next: "decision",
      ...base,
      why: `the gatekeeper's file ends in ${ends} rather than ${GATE_VERDICTS.join(", ")}`,
    };
  }
  if (read.commit === null) {
    return {
      next: "decision",
      ...base,
      why: "the gatekeeper's file names no commit, so nothing says which commit it judged",
    };
  }
  if (diff !== null && diff.ok === false) {
    const held = (diff.migrations ?? []).filter((each) => each.waits && each.safety !== "additive");
    const named =
      held.map((each) => each.path).join(", ") ||
      (diff.reasons ?? []).map((r) => r.rule).join("; ");
    return {
      next: "migration",
      ...base,
      reasons: diff.reasons ?? [],
      why: `${named} destroys or rewrites data, and a migration that does is applied on your word alone — Decision, and the migration question`,
    };
  }
  if (read.verdict === GATE_MERGE)
    return { next: "merge", ...base, why: "the gatekeeper says merge" };
  if (read.verdict === GATE_MERGE_APPLY) {
    return { next: "apply", ...base, why: "the gatekeeper says apply, then merge" };
  }
  // HOLD: findings, counted by the reviewer's pass.
  const pass = review === null ? null : readVerdict(review).pass;
  if (pass === null) {
    return {
      next: "decision",
      ...base,
      why: `the gatekeeper holds (${GATE_HOLD}) and the reviewer's pass could not be read, so the corrections cannot be counted`,
    };
  }
  if (pass >= MAX_PASSES) {
    return {
      next: "decision",
      ...base,
      why: `the gatekeeper still holds after pass ${pass}, the last correction the run gets`,
    };
  }
  return {
    next: "build",
    ...base,
    why: `the gatekeeper holds after pass ${pass}; the builder fixes what the reasons name and the reviewer reads the fixes as pass ${pass + 1}`,
  };
}

/** A file's text, or null. */
function readOrNull(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** CLI: `node gate-cap.mjs docs/gates/<id>.md docs/reviews/<id>.md`, from the checkout. */
async function main() {
  const [gateFile, reviewFile] = process.argv.slice(2);
  if (!gateFile || !reviewFile) {
    process.stderr.write("usage: gate-cap.mjs docs/gates/<id>.md docs/reviews/<id>.md\n");
    process.exit(1);
  }
  const { tags, why } = await consumedApplies();
  const diff = gatedDiffOf({ applied: tags });
  emit({
    ...nextAfterGate({ gate: readOrNull(gateFile), review: readOrNull(reviewFile), diff }),
    applied: tags,
    appliedWhy: why,
    migrations: diff.migrations,
    loosenings: diff.loosenings,
  });
}

if (isMain(import.meta.url)) await main();
