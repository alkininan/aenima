#!/usr/bin/env node
/**
 * Step 0 — a merge whose deploy failed, reverted (T0.16).
 *
 * When `health.mjs` finds the site answering wrong after main moved, the merge at the tip
 * of origin/main is reverted: one commit, `git revert -m 1`, that restores the tree of the
 * merge's first parent — never a force-push, never a rewrite. This prepares that commit on a
 * detached HEAD and stops. The push is the skill's own command, `git push origin HEAD:main`,
 * so the guard reads it and lets exactly that shape through: HEAD one commit past
 * origin/main with the tree origin/main had before the merge (`scripts/hooks/guard.mjs`,
 * rule (d)). The ticket the merge landed is read from the pull request's subject, so the
 * skill can put it back at Backlog and file the fix.
 */

import { spawnSync } from "node:child_process";

import { emit, isMain } from "./cli.mjs";

/** `Merge pull request #12 from alkininan/t0-16` → `t0-16`; null when the subject is not one. */
export function branchOfMerge(subject) {
  return (
    String(subject ?? "").match(/^Merge pull request #\d+ from [^\s/]+\/(t\d+-\d+)$/)?.[1] ?? null
  );
}

/** `t0-16` → `T0.16`; null for anything else, a stale branch included. */
export function idOfBranch(branch) {
  const match = String(branch ?? "").match(/^t(\d+)-(\d+)$/);
  return match ? `T${match[1]}.${match[2]}` : null;
}

const out = (result) => String(result?.stdout ?? "").trim();

/**
 * Detach at origin/main and revert its tip. Returns `{ ok, merge, head, subject, branch,
 * id, previous, push }`, or `{ ok: false, why }` with the checkout left as it was.
 */
export function prepareRevert({ cwd = process.cwd(), run } = {}) {
  const g = run ?? ((args) => spawnSync("git", args, { cwd, encoding: "utf8" }));

  g(["fetch", "--quiet", "origin"]);
  const tip = out(g(["rev-parse", "--verify", "--quiet", "origin/main"]));
  if (tip === "") return { ok: false, why: "origin/main cannot be resolved" };

  const parents = out(g(["log", "-1", "--format=%P", tip]))
    .split(/\s+/)
    .filter(Boolean);
  if (parents.length < 2) {
    return {
      ok: false,
      why: `the tip of origin/main, ${tip.slice(0, 7)}, is not a merge commit, so there is nothing to revert`,
      merge: tip,
    };
  }

  if (out(g(["status", "--porcelain"])) !== "") {
    return { ok: false, why: "the checkout has uncommitted work, and a revert needs a clean tree" };
  }

  const subject = out(g(["log", "-1", "--format=%s", tip]));
  const branch = branchOfMerge(subject);
  const previous = out(g(["rev-parse", "--abbrev-ref", "HEAD"]));

  const detached = g(["checkout", "--quiet", "--detach", tip]);
  if (detached.status !== 0) {
    return {
      ok: false,
      why: `origin/main could not be checked out: ${out(detached) || detached.stderr}`,
    };
  }
  const reverted = g(["revert", "--no-edit", "-m", "1", tip]);
  if (reverted.status !== 0) {
    g(["revert", "--abort"]);
    g(["checkout", "--quiet", previous]);
    return {
      ok: false,
      why: `git revert failed: ${`${reverted.stdout ?? ""}${reverted.stderr ?? ""}`.trim()}`,
      merge: tip,
    };
  }

  return {
    ok: true,
    merge: tip,
    head: out(g(["rev-parse", "HEAD"])),
    subject,
    branch,
    id: idOfBranch(branch),
    previous,
    push: "git push origin HEAD:main",
  };
}

/** CLI: `node revert.mjs`, run from the checkout. */
if (isMain(import.meta.url)) {
  const result = prepareRevert();
  emit(result);
  process.exit(result.ok ? 0 : 1);
}
