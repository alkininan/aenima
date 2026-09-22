#!/usr/bin/env node
/**
 * Step 1 — the ID a newly claimed task gets when its Name has none.
 *
 * IDs are `T<phase>.<n>` (docs/guidelines.md §7), and every one names one task. The phase
 * comes from the Epic the task sits under — `E3.1 Authoring loop` is phase 3 — and the
 * number is the lowest in that phase nobody holds.
 *
 * It was the highest used *within the epic*, plus one, until T0.28. Two epics in one phase
 * then counted past each other: E0.4's first task was answered T0.1, the scaffold ticket's,
 * and E0.1's next was answered T0.7, E0.2's Setup. An ID names a branch and a file under
 * `docs/` on main, so a repeat overwrites another task's record rather than colliding
 * somewhere anyone would see. The epic still gives the phase; it no longer gives the count.
 *
 * Taken is wider than the board for the same reason. A number a branch or a docs file
 * carries stays taken once its task is gone, because the record it names is still there:
 * `docs/log/T0.97.md` is on main and no task on the board says T0.97.
 *
 * Pure over what it is handed, and it never reads Notion — the skill hands it the epic name
 * and every task name on the board. What it does read is this repository, whose branches and
 * `docs/` tree carry the rest of the taken numbers: a rule the CLI applies cannot be the one
 * a run forgets.
 */

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";

import { emit, isMain, readStdin } from "./cli.mjs";

/** Where a ticket's own documents live, under the repository root. */
export const DOCS_DIR = "docs";

/** The phase number in an epic name, or null when the name carries none. */
export function phaseOf(epicName) {
  const match = /^E(\d+)\.\d+\b/.exec(String(epicName ?? "").trim());
  return match ? Number(match[1]) : null;
}

/** The `T<phase>.<n>` at the head of a task name, or null. */
export function idOf(taskName) {
  const match = /^T(\d+)\.(\d+)\b/.exec(String(taskName ?? "").trim());
  return match ? { phase: Number(match[1]), n: Number(match[2]) } : null;
}

/**
 * The IDs a `git branch --format=%(refname:short)` listing carries, as `T<phase>.<n>`.
 *
 * A ticket branch is the ID lowercased with the dot a hyphen (`branch.mjs`), and it keeps
 * the number through a rename: `t0-97-stale-1607` is a stale run's, `t0-8-close` a branch
 * freed for a second claim. Both still hold their number.
 */
export function branchIds(listing) {
  const ids = [];
  for (const line of String(listing ?? "").split("\n")) {
    const name = basename(line.trim().split(/\s+/)[0] ?? "");
    const match = /^t(\d+)-(\d+)(?:\D|$)/.exec(name);
    if (match) ids.push(`T${Number(match[1])}.${Number(match[2])}`);
  }
  return ids;
}

/** The IDs a list of paths under `docs/` carries, read from each file's own name. */
export function docsIds(paths) {
  const ids = [];
  for (const path of paths ?? []) {
    const parsed = idOf(basename(String(path)));
    if (parsed) ids.push(`T${parsed.phase}.${parsed.n}`);
  }
  return ids;
}

/**
 * Every ID this repository still carries — its branches and its `docs/` tree.
 *
 * Returns `{ ids, unread }`. `unread` names each of the two it could not read, and it is
 * never silent: a narrowed set answers a number something still carries, which is the repeat
 * this script exists to stop. A checkout that has no `docs/` tree at all is not an unread
 * one — there is nothing there to miss.
 *
 * Injected `run` and `cwd` keep a test off this checkout.
 */
export function repoTaken({ cwd = process.cwd(), run } = {}) {
  const g =
    run ??
    ((args) =>
      spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

  const unread = [];

  const branches = g(["branch", "-a", "--format=%(refname:short)"]);
  const ok = branches.status === 0;
  if (!ok) unread.push("branches");
  const fromBranches = ok ? branchIds(branches.stdout) : [];

  let entries = [];
  try {
    entries = readdirSync(join(cwd, DOCS_DIR), { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") unread.push("docs");
  }

  return { ids: [...new Set([...fromBranches, ...docsIds(entries)])], unread };
}

/**
 * The next free ID in the task's phase.
 *
 * `taskNames` is every task on the board, whatever its epic and whatever its status;
 * `takenIds` is what the repository still carries. Returns `{ id, phase, n }`, or
 * `{ error }` when the epic name carries no phase — an un-numbered epic is a question for
 * the human, not a number to invent.
 */
export function nextId(epicName, taskNames = [], takenIds = []) {
  const phase = phaseOf(epicName);
  if (phase === null) {
    return { error: `epic name carries no phase number: ${JSON.stringify(epicName ?? null)}` };
  }

  const used = new Set(
    [...taskNames, ...takenIds]
      .map(idOf)
      .filter((parsed) => parsed !== null && parsed.phase === phase)
      .map((parsed) => parsed.n),
  );

  let n = 1;
  while (used.has(n)) n += 1;
  return { id: `T${phase}.${n}`, phase, n };
}

/**
 * CLI: `{ "epic": "E3.1 …", "tasks": ["T3.1 …", …] }` on stdin, or a --file path. `tasks` is
 * every task name on the board — `pick-next.mjs` prints them as `names`.
 *
 * Prints the answer with `unread`, so a run can see when the repository was read short.
 */
async function main() {
  const fileFlag = process.argv.indexOf("--file");
  const raw =
    fileFlag === -1 ? await readStdin() : readFileSync(process.argv[fileFlag + 1], "utf8");
  const input = JSON.parse(raw);
  const { ids, unread } = repoTaken();
  emit({ ...nextId(input.epic, input.tasks ?? [], ids), unread });
}

if (isMain(import.meta.url)) await main();
