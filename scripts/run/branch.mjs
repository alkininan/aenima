#!/usr/bin/env node
/**
 * Step 3 — the ticket branch.
 *
 * `t<id lowercased, dot to hyphen>` off `origin/main` (docs/guidelines.md §7). The base is
 * overridable through `AENIMA_RUN_BASE` for one reason: a run whose own skill and scripts are
 * not yet on main would check them out from under itself at this step. That is exactly the
 * live test of this ticket, and the override is how it runs. Normal use never sets it.
 *
 * A run in the primary checkout is recorded as such so step 9 can return it to main whatever
 * happens; a run in a worktree — every scheduled run, in the worktree Desktop made for it
 * (docs/guidelines.md §5) — leaves the worktree where it is for `prune.mjs` to remove later.
 */

import { spawnSync } from "node:child_process";

import { emit, isMain } from "./cli.mjs";

/** `T0.98` → `t0-98`. */
export function branchName(id) {
  return `t${String(id ?? "")
    .trim()
    .toLowerCase()
    .replace(/^t/, "")
    .replaceAll(".", "-")}`;
}

/** The base a run branches from. */
export function baseRef(env = process.env) {
  const override = String(env.AENIMA_RUN_BASE ?? "").trim();
  return override === "" ? "origin/main" : override;
}

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });

/**
 * True when `cwd` is the repository's primary checkout rather than a linked worktree.
 * `--git-common-dir` and `--git-dir` name the same directory only in the primary one.
 */
export function isPrimaryCheckout(run) {
  const common = run(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const own = run(["rev-parse", "--path-format=absolute", "--git-dir"]);
  if (common.status !== 0 || own.status !== 0) return null;
  return common.stdout.trim() === own.stdout.trim();
}

/**
 * Fetch, then check out the ticket branch. Returns what step 9 needs to know.
 *
 * A branch already on origin is reused, not recreated: a task sent back to Ready by a reply
 * at Review, or picked up again after a migration was applied, carries its branch and its
 * pull request with it — one ticket, one PR, however many rounds (T0.11). The local branch
 * is set to origin's copy, which every exit pushes, so nothing a previous round did is
 * lost. With no copy on origin the branch is new, off the base.
 */
export function createBranch(id, { cwd = process.cwd(), env = process.env, run } = {}) {
  const g = run ?? ((args) => git(args, cwd));
  const base = baseRef(env);
  const branch = branchName(id);

  const fetched = g(["fetch", "--quiet", "origin"]);
  const primary = isPrimaryCheckout(g);
  const remote = `origin/${branch}`;
  const reused = g(["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}`]).status === 0;

  // The run that took the task to Review left its worktree on the branch, and `prune.mjs`
  // keeps an unmerged worktree for three days; git refuses to check a branch out twice. That
  // worktree is clean by construction — every exit pushes — so it is removed first. A dirty
  // one holds work nobody pushed and stops the run here rather than losing it.
  let freed = null;
  if (reused) {
    const held = heldBy(branch, g);
    if (held !== null) {
      const removed = g(["worktree", "remove", held]);
      if (removed.status !== 0) {
        return {
          branch,
          base: remote,
          reused,
          freed,
          primary,
          fetched: fetched.status === 0,
          ok: false,
          detail: `${branch} is checked out in ${held} and it could not be removed: ${`${removed.stdout ?? ""}${removed.stderr ?? ""}`.trim()}`,
        };
      }
      freed = held;
    }
  }

  const created = reused
    ? g(["checkout", "-B", branch, remote])
    : g(["checkout", "-b", branch, base]);

  return {
    branch,
    base: reused ? remote : base,
    reused,
    freed,
    primary,
    fetched: fetched.status === 0,
    ok: created.status === 0,
    detail: created.status === 0 ? null : `${created.stdout ?? ""}${created.stderr ?? ""}`.trim(),
  };
}

/** The path of another worktree that has `branch` checked out, or null when none has. */
export function heldBy(branch, run) {
  const list = run(["worktree", "list", "--porcelain"]);
  if (list.status !== 0) return null;
  const own = String(run(["rev-parse", "--show-toplevel"]).stdout ?? "").trim();
  let path = null;
  for (const line of String(list.stdout ?? "").split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
    else if (line === `branch refs/heads/${branch}` && path !== null && path !== own) return path;
  }
  return null;
}

/** CLI: `node branch.mjs <ticket-id>`. */
function main() {
  const id = process.argv[2];
  if (!id) {
    process.stderr.write("usage: branch.mjs <ticket-id>\n");
    process.exit(1);
  }
  const result = createBranch(id);
  emit(result);
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
