#!/usr/bin/env node
/**
 * `pnpm board:ids` — the keys of `.claude/board.json`, one per line.
 *
 * The file is the dev board's identity (docs/guidelines.md §1): the ids of the Admin page
 * and its databases, and the prefix every comment the pipeline writes begins with. This
 * prints what is configured, never what it is set to — keys, not values — so a shell
 * transcript that runs it carries no id. The file is read from the repository root wherever
 * the command is run from, a worktree or a subdirectory included.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMain } from "./run/cli.mjs";

export const BOARD_FILE = join(".claude", "board.json");
const root = join(import.meta.dirname, "..");

/**
 * The top-level keys of a JSON object document, in the order `JSON.parse` yields them: file
 * order, except that integer-like keys come first — board.json has none, its keys are names.
 * Anything that is not an object is refused with the file's name.
 */
export function boardIds(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${BOARD_FILE}: not JSON (${error.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${BOARD_FILE}: expected a JSON object at the top level`);
  }
  return Object.keys(parsed);
}

/** CLI: `node board-ids.mjs` — one key per line. */
function main() {
  const keys = boardIds(readFileSync(join(root, BOARD_FILE), "utf8"));
  process.stdout.write(keys.map((key) => `${key}\n`).join(""));
}

if (isMain(import.meta.url)) main();
