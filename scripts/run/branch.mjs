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
 * happens; a run in a worktree leaves the worktree where it is. T0.9 moves runs to worktrees
 * and this distinction goes away with it.
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

/** Fetch, then create and check out the ticket branch. Returns what step 9 needs to know. */
export function createBranch(id, { cwd = process.cwd(), env = process.env, run } = {}) {
  const g = run ?? ((args) => git(args, cwd));
  const base = baseRef(env);
  const branch = branchName(id);

  const fetched = g(["fetch", "--quiet", "origin"]);
  const primary = isPrimaryCheckout(g);
  const created = g(["checkout", "-b", branch, base]);

  return {
    branch,
    base,
    primary,
    fetched: fetched.status === 0,
    ok: created.status === 0,
    detail: created.status === 0 ? null : `${created.stdout ?? ""}${created.stderr ?? ""}`.trim(),
  };
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
