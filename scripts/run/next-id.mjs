#!/usr/bin/env node
/**
 * Step 1 — the ID a newly claimed task gets when its Name has none.
 *
 * IDs are `T<phase>.<n>` (docs/guidelines.md §7). The phase comes from the Epic the task
 * sits under — `E3.1 Authoring loop` is phase 3 — and the number is the highest already
 * used *within that epic*, plus one. Not the highest on the board: two epics in one phase
 * would then interleave, and an ID would stop saying which capability it belongs to.
 *
 * Pure. The skill hands it the epic name and the epic's task names; it never reads Notion.
 */

import { readFileSync } from "node:fs";
import { emit, isMain, readStdin } from "./cli.mjs";

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
 * The next free ID in an epic.
 *
 * Returns `{ id, phase, n }`, or `{ error }` when the epic name carries no phase — an
 * un-numbered epic is a question for the human, not a number to invent.
 */
export function nextId(epicName, taskNames = []) {
  const phase = phaseOf(epicName);
  if (phase === null) {
    return { error: `epic name carries no phase number: ${JSON.stringify(epicName ?? null)}` };
  }

  const used = taskNames
    .map(idOf)
    .filter((parsed) => parsed !== null && parsed.phase === phase)
    .map((parsed) => parsed.n);

  const n = used.length === 0 ? 1 : Math.max(...used) + 1;
  return { id: `T${phase}.${n}`, phase, n };
}

/** CLI: `{ "epic": "E3.1 …", "tasks": ["T3.1 …", …] }` on stdin, or a --file path. */
async function main() {
  const fileFlag = process.argv.indexOf("--file");
  const raw =
    fileFlag === -1 ? await readStdin() : readFileSync(process.argv[fileFlag + 1], "utf8");
  const input = JSON.parse(raw);
  emit(nextId(input.epic, input.tasks ?? []));
}

if (isMain(import.meta.url)) await main();
