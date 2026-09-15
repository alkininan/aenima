#!/usr/bin/env node
/**
 * Step 0b — which files stand in the way of a merge GitHub refused (T0.20).
 *
 * A merge the guard let through can still be refused by GitHub: main moved after the human's
 * word and the pull request no longer merges cleanly. A refusal always reports, and the report
 * names the files, so the human reads what is in the way rather than that something is. gh's
 * refusal does not name them; `git merge-tree --write-tree --name-only` does, by trying the
 * merge in the object store without touching a checkout — exit 0 clean, exit 1 with the
 * conflicted paths after the tree it wrote.
 */

import { emit, isMain } from "./cli.mjs";
import { defaultRunner } from "./merge-detect.mjs";

/**
 * `{ ok, head, base, clean, files, why }` for merging `head` into `base`. `files` are the paths
 * in conflict, sorted, empty when the merge is clean; `ok` false when git could not try it — a
 * ref that is not there — with `why` saying so. `run` is `defaultRunner(cwd)`, injected so a
 * test drives a temporary repository.
 */
export function conflictsOf(head, run, base = "origin/main") {
  const result = run(["merge-tree", "--write-tree", "--name-only", "--no-messages", base, head]);
  const [tree = "", ...paths] = String(result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // Exit 1 is both "conflicts" and "not something we can merge"; only the first writes a tree.
  if ((result.status === 0 || result.status === 1) && /^[0-9a-f]{40,64}$/.test(tree)) {
    const files = result.status === 0 ? [] : [...new Set(paths)].sort();
    return { ok: true, head, base, clean: result.status === 0, files, why: null };
  }
  const said =
    String(result.stderr ?? "")
      .trim()
      .split("\n")[0] || `exit ${result.status}`;
  return {
    ok: false,
    head,
    base,
    clean: false,
    files: [],
    why: `git could not try merging ${head} into ${base}: ${said}`,
  };
}

/** CLI: `node conflicts.mjs <branch>` — the branch as origin has it, against origin/main. */
async function main() {
  const branch = process.argv[2];
  if (!branch) {
    process.stderr.write("usage: conflicts.mjs <branch>\n");
    process.exit(1);
  }
  const run = defaultRunner(process.cwd());
  run(["fetch", "--quiet", "origin"]);
  emit(conflictsOf(`origin/${branch}`, run));
}

if (isMain(import.meta.url)) await main();
