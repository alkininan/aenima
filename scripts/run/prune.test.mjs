import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assess, listWorktrees, OLD_AFTER_MS, prune, stamp, STAMP, YOUNG_MS } from "./prune.mjs";

// T0.10 — a scheduled run's worktree is removed by a later run once it is merged or old;
// everything else on disk is somebody's and stays. Over a real repository with a bare
// origin, because the question is what git does, not what a stub agrees to.

const NOW = new Date("2026-09-10T03:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("assess", () => {
  const wt = (path, extra = {}) => ({
    path,
    head: "abc",
    branch: `worktree-${path}`,
    locked: false,
    bare: false,
    ...extra,
  });
  const run = (worktrees, obs = {}) =>
    assess({
      worktrees: [wt("/repo"), ...worktrees],
      current: "/repo/.claude/worktrees/me",
      now: NOW.getTime(),
      stampedAt: () => NOW.getTime() - DAY,
      isMerged: () => true,
      isDirty: () => false,
      ...obs,
    });

  it("removes a stamped, clean, unlocked worktree whose head is on origin/main", () => {
    const { remove, keep } = run([wt("/repo/.claude/worktrees/a")]);
    expect(remove.map((w) => [w.path, w.reason])).toEqual([
      ["/repo/.claude/worktrees/a", "merged into origin/main"],
    ]);
    expect(keep).toEqual([]);
  });

  it("removes an unmerged one only once it is older than three days", () => {
    const young = run([wt("/a")], { isMerged: () => false });
    expect(young.remove).toEqual([]);
    expect(young.keep[0].reason).toBe("unmerged and younger than three days");
    const old = run([wt("/a")], {
      isMerged: () => false,
      stampedAt: () => NOW.getTime() - OLD_AFTER_MS - 1,
    });
    expect(old.remove[0].reason).toBe("older than three days");
  });

  it("never touches a worktree without the stamp, whatever its state", () => {
    const { remove, keep } = run([wt("/human")], { stampedAt: () => null });
    expect(remove).toEqual([]);
    expect(keep[0].reason).toBe("not a run's worktree");
  });

  it("keeps a locked one, a dirty one, and its own", () => {
    const { remove, keep } = run(
      [wt("/locked", { locked: true }), wt("/dirty"), wt("/repo/.claude/worktrees/me")],
      { isDirty: (w) => w.path === "/dirty" },
    );
    expect(remove).toEqual([]);
    expect(keep.map((w) => w.reason)).toEqual([
      "locked by a session",
      "uncommitted work",
      "this run's own worktree",
    ]);
  });

  // T0.10 open question 8 → T0.12. A stamped worktree younger than the marker's three hours
  // stays even when merged: a live run's own worktree is exactly that between its steps 0 and 2.
  it("keeps a merged worktree stamped less than three hours ago", () => {
    const young = run([wt("/a")], { stampedAt: () => NOW.getTime() - YOUNG_MS + 1 });
    expect(young.remove).toEqual([]);
    expect(young.keep[0].reason).toBe("stamped less than three hours ago");
    const older = run([wt("/a")], { stampedAt: () => NOW.getTime() - YOUNG_MS });
    expect(older.remove[0].reason).toBe("merged into origin/main");
  });

  it("never lists the main worktree as a candidate", () => {
    const { main, remove, keep } = run([]);
    expect(main).toBe("/repo");
    expect(remove).toEqual([]);
    expect(keep).toEqual([]);
  });
});

describe("stamp and prune, over a real repository", () => {
  let root;
  let origin;
  let primary;
  const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const commit = (cwd, message) => {
    git(cwd, "add", "-A");
    git(
      cwd,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      message,
    );
  };
  const worktree = (name, ...args) => {
    const path = join(root, name);
    expect(
      git(primary, "worktree", "add", "-q", path, "-b", `worktree-${name}`, ...args).status,
    ).toBe(0);
    return path;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aenima-prune-"));
    origin = join(root, "origin.git");
    primary = join(root, "primary");
    git(root, "init", "-q", "--bare", "-b", "main", origin);
    git(root, "clone", "-q", origin, primary);
    writeFileSync(join(primary, "a.txt"), "a\n");
    commit(primary, "base");
    git(primary, "push", "-q", "origin", "main");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("stamps a linked worktree in its own git directory and leaves the tree clean", () => {
    const wt = worktree("run");
    const written = stamp(wt, { now: () => NOW });
    expect(written.stamped).toBe(true);
    expect(written.path).toContain(join(".git", "worktrees"));
    expect(readFileSync(written.path, "utf8").trim()).toBe(NOW.toISOString());
    expect(git(wt, "status", "--porcelain").stdout).toBe("");
  });

  it("never stamps the primary checkout", () => {
    expect(stamp(primary)).toEqual({ stamped: false, path: null });
  });

  // T0.10 open question 9 → T0.12. Linked is git's notion, not a path comparison, so a
  // subdirectory of either checkout is read the same as its root.
  it("stamps from a subdirectory of a linked worktree, and not from one of the primary", () => {
    const wt = worktree("deep");
    mkdirSync(join(wt, "src", "x"), { recursive: true });
    expect(stamp(join(wt, "src", "x"), { now: () => NOW }).stamped).toBe(true);
    mkdirSync(join(primary, "src"), { recursive: true });
    expect(stamp(join(primary, "src"))).toEqual({ stamped: false, path: null });
  });

  it("knows its own worktree from a subdirectory, and leaves it alone", () => {
    const me = worktree("me");
    stamp(me, { now: () => new Date(NOW.getTime() - 4 * DAY) });
    mkdirSync(join(me, "docs"), { recursive: true });
    const result = prune({ cwd: join(me, "docs"), now: () => NOW });
    expect(result.removed).toEqual([]);
    expect(result.kept.map((w) => w.reason)).toEqual(["this run's own worktree"]);
    expect(existsSync(me)).toBe(true);
  });

  it("removes the merged and the old, keeps the young, the dirty, the human's and its own", () => {
    const merged = worktree("merged");
    stamp(merged, { now: () => new Date(NOW.getTime() - 4 * HOUR) });
    const young = worktree("young");
    stamp(young, { now: () => new Date(NOW.getTime() - 4 * HOUR) });
    writeFileSync(join(young, "b.txt"), "b\n");
    commit(young, "unmerged work");
    const old = worktree("old");
    stamp(old, { now: () => new Date(NOW.getTime() - 4 * DAY) });
    writeFileSync(join(old, "c.txt"), "c\n");
    commit(old, "old unmerged work");
    const dirty = worktree("dirty");
    stamp(dirty, { now: () => new Date(NOW.getTime() - 4 * HOUR) });
    writeFileSync(join(dirty, "d.txt"), "d\n");
    const human = worktree("human");
    const me = worktree("me");

    const result = prune({ cwd: me, now: () => NOW });

    // Git reports paths with symlinks resolved; the temp dir on macOS is behind one.
    const real = (path) => join(realpathSync(root), path.slice(root.length + 1));
    expect(result.stamped).toBe(true);
    expect(result.removed.map((w) => [w.path, w.reason, w.branchDeleted])).toEqual([
      [real(merged), "merged into origin/main", "worktree-merged"],
      [real(old), "older than three days", null],
    ]);
    expect(result.failed).toEqual([]);
    expect(existsSync(merged)).toBe(false);
    expect(existsSync(old)).toBe(false);
    // The old one's commits are still reachable: the branch stayed because `-d` refused it.
    expect(git(primary, "rev-parse", "--verify", "--quiet", "worktree-old").status).toBe(0);
    expect(existsSync(young)).toBe(true);
    expect(existsSync(dirty)).toBe(true);
    expect(existsSync(human)).toBe(true);
    expect(existsSync(me)).toBe(true);
    expect(result.kept.map((w) => w.reason).sort()).toEqual(
      [
        "not a run's worktree",
        "this run's own worktree",
        "uncommitted work",
        "unmerged and younger than three days",
      ].sort(),
    );
    expect(listWorktrees(primary).map((w) => w.path)).toHaveLength(5);
  });

  it("keeps a locked worktree even when merged and stamped", () => {
    const locked = worktree("locked");
    stamp(locked, { now: () => new Date(NOW.getTime() - 4 * HOUR) });
    git(primary, "worktree", "lock", locked);
    const result = prune({ cwd: primary, now: () => NOW });
    expect(result.stamped).toBe(false);
    expect(result.removed).toEqual([]);
    expect(result.kept[0].reason).toBe("locked by a session");
    expect(existsSync(join(locked, "a.txt"))).toBe(true);
    expect(existsSync(join(locked, STAMP))).toBe(false);
  });
});
