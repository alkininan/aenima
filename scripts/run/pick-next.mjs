#!/usr/bin/env node
/**
 * Step 1 — which Ready task a run claims.
 *
 * Top Ready by Priority (Must, then Should, then Could), then oldest created. `Won't` is
 * never claimed: it is the MoSCoW way of saying not this release, and a run that picked one
 * up would be doing work somebody decided against.
 *
 * Pure. The skill hands it the rows a Notion query returned.
 */

import { readFileSync } from "node:fs";
import { emit, isMain, readStdin } from "./cli.mjs";

/** Claim order. A priority outside this list sorts last and is never preferred. */
export const PRIORITY_ORDER = ["Must", "Should", "Could"];

const rank = (priority) => {
  const index = PRIORITY_ORDER.indexOf(priority);
  return index === -1 ? PRIORITY_ORDER.length : index;
};

/**
 * The task to claim, or null when nothing is claimable.
 *
 * `rows` are Tasks rows as queried: `{ Name, Status, Priority, createdTime, url }`.
 */
export function pickNext(rows = []) {
  const ready = rows.filter((row) => row?.Status === "Ready" && row?.Priority !== "Won't");
  if (ready.length === 0) return null;

  return ready
    .slice()
    .sort((a, b) => {
      const byPriority = rank(a.Priority) - rank(b.Priority);
      if (byPriority !== 0) return byPriority;
      return String(a.createdTime ?? "").localeCompare(String(b.createdTime ?? ""));
    })
    .at(0);
}

/** CLI: the rows array, or `{ "results": [...] }` as the query returns it, on stdin. */
async function main() {
  const fileFlag = process.argv.indexOf("--file");
  const raw =
    fileFlag === -1 ? await readStdin() : readFileSync(process.argv[fileFlag + 1], "utf8");
  const input = JSON.parse(raw);
  const rows = Array.isArray(input) ? input : (input.results ?? []);
  emit(pickNext(rows));
}

if (isMain(import.meta.url)) await main();
