#!/usr/bin/env node
/**
 * Step 1 — the run marker.
 *
 * `aenima-run-active` in the repository's shared `.git` directory is a run's footprint: task
 * id, page id, branch, when it started, which session wrote it. It exists from claim until
 * the run exits — Review, Decision or error — and `release.mjs` removes it on each of those
 * paths, the error path through the SessionEnd hook. Two readers, neither the skill: the
 * guard refuses `gh pr merge` while it exists (docs/guidelines.md §5, hard boundaries), and
 * the next run's preflight reads an In progress task with no marker, or a marker older than
 * three hours, as a run that died (`stale.mjs`). The skill never reasons about it.
 *
 * It lives in the git common dir (`repo.mjs`) rather than in the checkout because a
 * scheduled run may get a worktree of its own, and a marker one worktree wrote must be
 * visible from every other: that is the whole of the never-overlap rule. Git never tracks
 * a file there, so nothing gitignores it and no worktree has to copy it.
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import { commonDir } from "./repo.mjs";

export const MARKER = "aenima-run-active";

/** A marker older than this belongs to a run that is not coming back (`stale.mjs`). */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Where the marker lives for the repository containing `cwd`: the same path from every
 * worktree of it. Throws when `cwd` is in no repository — a run outside one has nothing to
 * claim and nothing to read.
 */
export function markerPath(cwd) {
  const common = commonDir(cwd);
  if (common === null) throw new Error(`not inside a git repository: ${cwd}`);
  return join(common, MARKER);
}

/** Remove the marker file. */
export function unlinkMarker(cwd) {
  unlinkSync(markerPath(cwd));
}

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

/**
 * Write the marker for the repository containing `cwd`. Returns what was written.
 *
 * Never over a live run's: a fresh marker another session wrote is a run in progress in
 * some worktree of this repository, and a claim on top of it would make the next preflight
 * read that run as dead and rename its branch from under it (review pass 2). The claim
 * throws instead, naming the task; a marker of this session's, or one older than three
 * hours, is overwritten as before.
 */
export function claim(fields, { cwd = process.cwd(), env = process.env, now } = {}) {
  const record = marker(fields, { env, now });
  const existing = readMarker(cwd);
  if (existing !== null && (existing.session ?? null) !== record.session) {
    const age = Date.parse(record.started) - Date.parse(existing.started);
    if (Number.isFinite(age) && age < STALE_AFTER_MS) {
      throw new Error(
        `a live run owns this repository: ${existing.task} since ${existing.started}; claim nothing`,
      );
    }
  }
  writeFileSync(markerPath(cwd), `${JSON.stringify(record, null, 2)}\n`);
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
  try {
    emit(claim({ task, page: read("--page"), branch: read("--branch") }));
  } catch (error) {
    emit({ claimed: false, reason: error.message });
    process.exit(1);
  }
}

if (isMain(import.meta.url)) main();
