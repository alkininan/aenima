#!/usr/bin/env node
/**
 * The ground every checkout of this repository shares.
 *
 * A linked worktree has its own working tree and its own `.git` file, but one `.git`
 * directory stands behind all of them: `git rev-parse --git-common-dir`. Anything one
 * checkout must be able to see from another lives there — the run marker (`claim.mjs`) and
 * the Stop gate's green fingerprint (`scripts/hooks/gate.mjs`). Git never tracks a file put
 * there, so nothing in it can be committed by accident, and a worktree Claude Code creates
 * does not have to copy it.
 *
 * T0.9 kept the marker at `.claude/.run-active` inside the checkout, which two worktrees
 * cannot see across; T0.10 puts runs on a schedule that may give each run a worktree, so a
 * marker only one checkout could see would let two runs overlap without either noticing.
 */

import { spawnSync } from "node:child_process";

/**
 * The absolute path of the `.git` directory shared by every worktree of the repository that
 * contains `cwd`, or null when `cwd` is not inside one. Never a guess: a caller that needs a
 * path when there is no repository has nothing to write to.
 */
export function commonDir(cwd = process.cwd()) {
  const run = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (run.status !== 0) return null;
  const path = run.stdout.trim();
  return path === "" ? null : path;
}
