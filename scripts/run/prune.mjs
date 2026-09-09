#!/usr/bin/env node
/**
 * Step 0 — the worktrees earlier runs left behind, removed.
 *
 * A scheduled run may get a worktree of its own, and Desktop does not remove it when the
 * run ends: a worktree goes when its session is archived, by hand or by the auto-archive
 * that follows a merged pull request, and an idle run opens no pull request. Hourly, that
 * is twenty-four checkouts a day. So each run stamps the worktree it is in as a run's, and
 * removes every stamped worktree from before that is clean, unlocked, not its own, and
 * either merged into `origin/main` or older than three days. A worktree without the stamp
 * is a human's and is never touched; a locked one belongs to a session Desktop still
 * holds; a dirty one holds work nobody committed and is left for a person to look at.
 *
 * The stamp lives in the worktree's own git directory — `.git/worktrees/<name>/` in the
 * shared `.git` — so it is not an untracked file in the checkout and `git status` stays
 * clean. `assess` is pure over injected observations; `prune` gathers them with git.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";

/** The file a run writes into its worktree's git directory. */
export const STAMP = "aenima-run";

/** A stamped worktree older than this goes whether or not its branch merged. */
export const OLD_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

const git = (args, cwd) =>
  spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** A path as git reports it — symlinks resolved, so two spellings of one directory compare equal. */
const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** The absolute git directory of the checkout at `cwd`: the shared one, or a worktree's own. */
function gitDir(cwd) {
  const run = git(["rev-parse", "--path-format=absolute", "--git-dir"], cwd);
  return run.status === 0 ? run.stdout.trim() : null;
}

/** The worktrees of the repository containing `cwd`, the main one first, as git lists them. */
export function listWorktrees(cwd) {
  const run = git(["worktree", "list", "--porcelain"], cwd);
  if (run.status !== 0) return [];
  return run.stdout
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const entry = { path: null, head: null, branch: null, locked: false, bare: false };
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") entry.path = value;
        else if (key === "HEAD") entry.head = value;
        else if (key === "branch") entry.branch = value.replace(/^refs\/heads\//, "");
        else if (key === "locked") entry.locked = true;
        else if (key === "bare") entry.bare = true;
      }
      return entry;
    });
}

/**
 * Mark the checkout at `cwd` as a run's, when it is a linked worktree. The primary checkout
 * is never stamped: it is not something a run may remove.
 */
export function stamp(cwd = process.cwd(), { now = () => new Date() } = {}) {
  const own = gitDir(cwd);
  const worktrees = listWorktrees(cwd);
  const isLinked = own !== null && worktrees.length > 0 && real(worktrees[0].path) !== real(cwd);
  if (!isLinked) return { stamped: false, path: null };
  const path = join(own, STAMP);
  writeFileSync(path, `${now().toISOString()}\n`);
  return { stamped: true, path };
}

/**
 * Which worktrees to remove and which to keep, each with its reason. `worktrees` is
 * `listWorktrees`' output; the observations are injected so the rule can be tested without
 * a repository standing in every state at once.
 */
export function assess({
  worktrees = [],
  current,
  now = Date.now(),
  stampedAt,
  isMerged,
  isDirty,
} = {}) {
  const remove = [];
  const keep = [];
  const [main, ...linked] = worktrees;
  for (const wt of linked) {
    const say = (reason) => keep.push({ ...wt, reason });
    if (real(wt.path) === real(current)) {
      say("this run's own worktree");
      continue;
    }
    const at = stampedAt(wt);
    if (at === null) {
      say("not a run's worktree");
      continue;
    }
    if (wt.locked) {
      say("locked by a session");
      continue;
    }
    if (isDirty(wt)) {
      say("uncommitted work");
      continue;
    }
    const merged = isMerged(wt);
    const old = now - at > OLD_AFTER_MS;
    if (merged) remove.push({ ...wt, reason: "merged into origin/main" });
    else if (old) remove.push({ ...wt, reason: "older than three days" });
    else say("unmerged and younger than three days");
  }
  return { main: main?.path ?? null, remove, keep };
}

/** When the stamp in a worktree's git directory was written, in ms, or null when unstamped. */
function stampedAtOf(wt) {
  const own = gitDir(wt.path);
  if (own === null) return null;
  const path = join(own, STAMP);
  if (!existsSync(path)) return null;
  const written = Date.parse(readFileSync(path, "utf8").trim());
  return Number.isFinite(written) ? written : statSync(path).mtimeMs;
}

/**
 * Stamp this worktree, then remove what earlier runs left. `base` is the branch a merge
 * lands on; a ref git cannot resolve reads as nothing merged, which keeps rather than
 * removes.
 */
export function prune({ cwd = process.cwd(), base = "origin/main", now = () => new Date() } = {}) {
  const own = stamp(cwd, { now });
  git(["fetch", "--quiet", "origin"], cwd);
  const worktrees = listWorktrees(cwd);
  const decision = assess({
    worktrees,
    current: cwd,
    now: now().getTime(),
    stampedAt: stampedAtOf,
    isMerged: (wt) => git(["merge-base", "--is-ancestor", wt.head, base], cwd).status === 0,
    isDirty: (wt) => git(["status", "--porcelain"], wt.path).stdout.trim() !== "",
  });

  const removed = [];
  const failed = [];
  for (const wt of decision.remove) {
    const gone = git(["worktree", "remove", wt.path], cwd);
    if (gone.status !== 0) {
      failed.push({ path: wt.path, detail: `${gone.stdout}${gone.stderr}`.trim() });
      continue;
    }
    // `-d`, never `-D`: a branch with commits main does not hold stays, and says so.
    const branch =
      wt.branch && wt.branch !== "main" && git(["branch", "-d", wt.branch], cwd).status === 0
        ? wt.branch
        : null;
    removed.push({ path: wt.path, reason: wt.reason, branchDeleted: branch });
  }
  git(["worktree", "prune"], cwd);
  return { stamped: own.stamped, removed, failed, kept: decision.keep };
}

if (isMain(import.meta.url)) emit(prune());
