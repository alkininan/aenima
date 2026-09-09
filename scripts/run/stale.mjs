#!/usr/bin/env node
/**
 * Step 0c — a run that died partway, found and recovered.
 *
 * A task at In progress is a claim that a run is working on it. The run's footprint is the
 * marker `claim.mjs` writes in the checkout; a task whose marker is absent here, or whose
 * marker is older than three hours, is a run that stopped without reaching an exit. The
 * reviewer's 529s during the fixture runs are the concrete case (docs/reports/T0.8.md, open
 * question 3): a session that dies mid-step-5 leaves In progress behind, and until T0.9 the
 * next run reported "a run is in progress" and claimed nothing until a human reset the row.
 *
 * Recovery is automatic because a wrong guess costs nothing: the dead run's branch is kept
 * under `t<id>-stale-<HHMM>` for salvage, anything uncommitted on it is committed there
 * first, and the task is claimed again from `origin/main`. `assess` is pure; `recover`
 * takes the git runner injected so a test drives it against a temporary repository.
 */

import { spawnSync } from "node:child_process";

import { branchName } from "./branch.mjs";
import { readMarker } from "./claim.mjs";
import { emit, isMain, readStdin } from "./cli.mjs";

/** A marker older than this belongs to a run that is not coming back. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/** `T0.97 Smoke C` → `T0.97`. */
export const idOf = (name) => String(name ?? "").match(/^T\d+\.\d+/)?.[0] ?? null;

/**
 * Sort the In progress tasks into the one a live run owns, if any, and the stale ones.
 *
 * `marker` is what `claim.mjs` wrote, or null. A marker is fresh when it is younger than
 * `STALE_AFTER_MS`; a fresh marker names a live task and every other In progress task is
 * stale. No marker, or an old one: every In progress task is stale.
 */
export function assess({ inProgress = [], marker = null, now = Date.now() } = {}) {
  const started = marker ? Date.parse(marker.started) : NaN;
  const age = Number.isFinite(started) ? now - started : Infinity;
  const markerState = marker === null ? "absent" : age < STALE_AFTER_MS ? "fresh" : "old";

  const live =
    markerState === "fresh"
      ? (inProgress.find((task) => idOf(task.Name) === String(marker.task)) ?? null)
      : null;

  const reason =
    markerState === "absent"
      ? "no run marker in this checkout"
      : markerState === "old"
        ? `the run marker is ${Math.round(age / 60000)} minutes old`
        : "the run marker names another task";

  return {
    markerState,
    live,
    stale: inProgress.filter((task) => task !== live).map((task) => ({ ...task, reason })),
  };
}

/** `HHMM` in UTC — timestamps are stored in UTC (CLAUDE.md), branch names included. */
export const stamp = (date) =>
  `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });

/**
 * Keep a dead run's branch for salvage and clear the way for a fresh claim.
 *
 * Renames `t<id>` to `t<id>-stale-<HHMM>`. If that branch is checked out with uncommitted
 * work, the work is committed onto it first, so nothing the dead run did is lost and the
 * tree is clean for the new branch. A pushed copy on origin is renamed the same way. With
 * no branch at all there is nothing to keep, and `renamed` says so.
 */
export function recover(id, { cwd = process.cwd(), run, now = () => new Date() } = {}) {
  const g = run ?? ((args) => git(args, cwd));
  const branch = branchName(id);
  const stale = `${branch}-stale-${stamp(now())}`;

  const exists = g(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
  if (!exists) return { branch, renamed: null, head: null, wip: false, remote: null };

  const head = g(["rev-parse", branch]).stdout.trim();
  const current = g(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  let wip = false;
  if (current === branch && g(["status", "--porcelain"]).stdout.trim() !== "") {
    g(["add", "-A"]);
    g(["commit", "--quiet", "-m", `wip: ${id} — stale run, kept for salvage`]);
    wip = true;
  }

  const renamed = g(["branch", "-m", branch, stale]);
  if (renamed.status !== 0) {
    return {
      branch,
      renamed: null,
      head,
      wip,
      remote: null,
      detail: `${renamed.stdout ?? ""}${renamed.stderr ?? ""}`.trim(),
    };
  }

  let remote = null;
  const pushed = g(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]);
  if (pushed.status === 0) {
    // `--atomic`: the create and the delete land together or not at all, so a rejected
    // create cannot leave origin without either copy (review pass 2).
    const moved = g([
      "push",
      "--quiet",
      "--atomic",
      "origin",
      `refs/remotes/origin/${branch}:refs/heads/${stale}`,
      `:refs/heads/${branch}`,
    ]);
    remote = moved.status === 0 ? stale : null;
  }

  return { branch, renamed: stale, head, wip, remote };
}

/**
 * CLI. Assess: `{ "inProgress": [rows] }` on stdin — the marker is read from this checkout by
 * the script, never handed over by the skill (the skill does not read it: T0.9 item 2); a
 * `"marker"` field, when present, is taken as given so a test can drive `assess` from stdin.
 * Recover: `node stale.mjs --recover T0.97`, run from the checkout.
 */
async function main() {
  const i = process.argv.indexOf("--recover");
  if (i !== -1) {
    emit(recover(process.argv[i + 1]));
    return;
  }
  const input = JSON.parse(await readStdin());
  const marker = input.marker === undefined ? readMarker(process.cwd()) : input.marker;
  emit(assess({ inProgress: input.inProgress ?? [], marker }));
}

if (isMain(import.meta.url)) await main();
