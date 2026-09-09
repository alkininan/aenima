#!/usr/bin/env node
/**
 * Step 1 — the run marker.
 *
 * `.claude/.run-active` is a run's footprint in the checkout it owns: task id, page id,
 * branch, when it started, which session wrote it. It exists from claim until the run exits
 * — Review, Decision or error — and `release.mjs` removes it on each of those paths, the
 * error path through the SessionEnd hook. Two readers, neither the skill: the guard refuses
 * `gh pr merge` while it exists (docs/guidelines.md §5, hard boundaries), and the next
 * run's preflight reads an In progress task with no marker, or a marker older than three
 * hours, as a run that died (`stale.mjs`). The skill never reasons about it.
 *
 * Gitignored; per checkout, never shared.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { emit, isMain } from "./cli.mjs";

export const MARKER = join(".claude", ".run-active");

/** Where the marker lives for a checkout. */
export const markerPath = (cwd) => join(cwd, MARKER);

/** The marker's content, or null when there is none or it cannot be read as one. */
export function readMarker(cwd) {
  try {
    return JSON.parse(readFileSync(markerPath(cwd), "utf8"));
  } catch {
    return null;
  }
}

/** The record a claim writes. `session` is the session id the runtime exposes, or null. */
export function marker({ task, page, branch }, { now = () => new Date(), env = {} } = {}) {
  return {
    task: String(task ?? "").trim(),
    page: String(page ?? "").trim(),
    branch: String(branch ?? "").trim(),
    started: now().toISOString(),
    session: env.CLAUDE_CODE_SESSION_ID ?? null,
  };
}

/** Write the marker for this checkout. Returns what was written. */
export function claim(fields, { cwd = process.cwd(), env = process.env, now } = {}) {
  const record = marker(fields, { env, now });
  const path = markerPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** CLI: `node claim.mjs --task T0.97 --page <page id> --branch t0-97`. */
function main() {
  const args = process.argv.slice(2);
  const read = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  const task = read("--task");
  if (!task) {
    process.stderr.write("usage: claim.mjs --task <id> [--page <page id>] [--branch <name>]\n");
    process.exit(1);
  }
  emit(claim({ task, page: read("--page"), branch: read("--branch") }));
}

if (isMain(import.meta.url)) main();
