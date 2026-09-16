#!/usr/bin/env node
/**
 * Step 9 — which diffs a run may merge on its own.
 *
 * A finished ticket merges itself (T0.16): the reviewer's PASS is on file and the gate is
 * green, so the human's word adds nothing — except where it still does. T0.16 kept three
 * places: a migration, the product spec, and the pipeline's own guard, gate, skill and run
 * scripts. T0.21 keeps one and a half. The human owns the documents upstream, in the
 * conversation that cuts the ticket, so re-approving a spec diff adds nothing; and a harness
 * diff is not dangerous because of where it lands but because of what it does. So:
 *
 *   - a diff adding a migration waits for `apply`, and its ticket waits for `merge`: the
 *     schema is shared, and applying one is the human's call either way (§4);
 *   - a diff that **weakens a restraint** waits for `merge`, measured by running the
 *     restraints on both sides of it (`scripts/run/loosening.mjs`) rather than read off the
 *     paths it touches;
 *   - everything else lands on main at close.
 *
 * The answer is read in two places and lives in one: the guard's second door
 * (`scripts/hooks/guard.mjs`, rule (f)) refuses `gh pr merge` on the reviewer's PASS while
 * this says the diff is gated, and the skill's step 9 asks the same question before it
 * tries. `gatedDiff` is pure over injected inputs; `gatedDiffOf` reads the diff and both
 * sides of the restraints.
 */

import { execFileSync } from "node:child_process";

import { emit, isMain } from "./cli.mjs";
import { loosenedBy } from "./loosening.mjs";
import { MIGRATIONS_DIR } from "./migration-check.mjs";

/**
 * True when a repo-relative path is one only the human's word merges on its own account —
 * which since T0.21 is a migration and nothing else. Everything the harness used to gate by
 * name is gated by measurement instead.
 */
export function isGatedPath(path) {
  return String(path ?? "").startsWith(MIGRATIONS_DIR);
}

/** The migrations among `files`, in the diff's order. */
export function gatedPaths(files = []) {
  return files.filter(isGatedPath);
}

/** A reason a diff waits for the word: the rule it trips, and what would settle it. */
const reason = (rule, ungate) => ({ rule, ungate });

/**
 * `{ files, reasons, gated, ok }` for a diff whose restraint comparison has already been made.
 * `weakened` is `loosenedBy`'s reasons. `gated` is the reasons' rules, which is what a caller
 * naming them in a sentence wants; `reasons` carries what would ungate each.
 */
export function gatedDiff({ files = [], weakened = [] } = {}) {
  const reasons = [
    ...gatedPaths(files).map((file) =>
      reason(
        `it adds the migration ${file}`,
        "a migration is applied by hand, so this one waits for you either way",
      ),
    ),
    ...weakened,
  ];
  return { files, reasons, gated: reasons.map((r) => r.rule), ok: reasons.length === 0 };
}

const git = (args, cwd) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * The diff of `range` in the checkout at `cwd`, judged. `origin/main...HEAD` is what a pull
 * request from this branch merges, and it is both sides of the restraint comparison.
 */
export function gatedDiffOf({ cwd = process.cwd(), range = "origin/main...HEAD" } = {}) {
  const names = git(["diff", "--name-only", range], cwd);
  const files = String(names ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const weakened = loosenedBy({ cwd, range, files }).reasons;
  return { range, ...gatedDiff({ files, weakened }) };
}

/** CLI: `node gated.mjs [range]`, run from the checkout. */
if (isMain(import.meta.url)) emit(gatedDiffOf({ range: process.argv[2] ?? "origin/main...HEAD" }));
