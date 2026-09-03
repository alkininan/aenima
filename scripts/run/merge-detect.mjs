#!/usr/bin/env node
/**
 * Step 0b — which Review tasks have landed.
 *
 * A task at Review carries the commit its branch ended on. It is Done when that commit is an
 * ancestor of `origin/main` — which is what a merge means, whatever route it took: a merge
 * commit, a squash that kept the hash, a fast-forward. `git merge-base --is-ancestor` answers
 * it by exit status and is the only reliable question here; comparing branch names or reading
 * the PR would both be guesses about what the human did.
 *
 * A squash-merge rewrites the hash, so its original commit is *not* an ancestor and the task
 * stays at Review. That is the honest answer: nothing in the repo proves it landed.
 */

import { spawnSync } from "node:child_process";

import { emit, isMain, readStdin } from "./cli.mjs";

/**
 * True when `commit` is an ancestor of `ref`. Injected as `run` so a test drives it against
 * a temporary repository rather than this one.
 */
export function defaultRunner(cwd) {
  return (args) => spawnSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Partition Review tasks into merged and still-open.
 *
 * `tasks` are rows with `{ Name, Commit, url }`. A row with no commit is never merged: the
 * run that set it to Review is the one that writes the commit, so a missing one means the
 * close did not finish.
 */
export function mergeDetect(tasks = [], run, ref = "origin/main") {
  const merged = [];
  const open = [];

  for (const task of tasks) {
    const commit = String(task?.Commit ?? "").trim();
    if (commit === "") {
      open.push({ ...task, reason: "no commit recorded" });
      continue;
    }
    const result = run(["merge-base", "--is-ancestor", commit, ref]);
    if (result.status === 0) merged.push(task);
    else open.push({ ...task, reason: `not an ancestor of ${ref}` });
  }

  return { merged, open };
}

/** CLI: `{ "tasks": [...], "ref": "origin/main" }` on stdin, run from the repo. */
async function main() {
  const input = JSON.parse(await readStdin());
  const run = defaultRunner(input.cwd ?? process.cwd());
  emit(mergeDetect(input.tasks ?? [], run, input.ref ?? "origin/main"));
}

if (isMain(import.meta.url)) await main();
