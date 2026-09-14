import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STALE_AFTER_MS, assess, idOf, recover, stamp } from "./stale.mjs";

const NOW = Date.parse("2026-09-09T12:00:00Z");
const row = (Name) => ({ Name, url: `https://notion/${Name}` });
const markerAt = (task, iso) => ({ task, page: "p", branch: "b", started: iso, session: "s" });

// TC3 → AC3. Absent marker → stale; fresh marker → not; old marker → stale.
describe("assess", () => {
  it("reads an In progress task with no marker in this repository as stale", () => {
    const result = assess({ inProgress: [row("T0.97 Smoke C")], marker: null, now: NOW });
    expect(result.markerState).toBe("absent");
    expect(result.live).toBeNull();
    expect(result.stale.map((t) => t.Name)).toEqual(["T0.97 Smoke C"]);
    expect(result.stale[0].reason).toBe("no run marker in this repository");
  });

  it("reads a fresh marker as a live run and claims nothing", () => {
    const result = assess({
      inProgress: [row("T0.97 Smoke C")],
      marker: markerAt("T0.97", "2026-09-09T11:30:00Z"),
      now: NOW,
    });
    expect(result.markerState).toBe("fresh");
    expect(result.live?.Name).toBe("T0.97 Smoke C");
    expect(result.stale).toEqual([]);
  });

  it("reads a marker older than three hours as stale", () => {
    const result = assess({
      inProgress: [row("T0.97 Smoke C")],
      marker: markerAt("T0.97", new Date(NOW - STALE_AFTER_MS - 1).toISOString()),
      now: NOW,
    });
    expect(result.markerState).toBe("old");
    expect(result.live).toBeNull();
    expect(result.stale[0].reason).toContain("180 minutes old");
  });

  it("treats exactly three hours as old, not fresh", () => {
    const marker = markerAt("T0.97", new Date(NOW - STALE_AFTER_MS).toISOString());
    expect(assess({ inProgress: [row("T0.97 x")], marker, now: NOW }).markerState).toBe("old");
  });

  it("reads a marker with no readable start as old", () => {
    const marker = markerAt("T0.97", "yesterday-ish");
    expect(assess({ inProgress: [row("T0.97 x")], marker, now: NOW }).stale).toHaveLength(1);
  });

  it("with a fresh marker naming one task, every other In progress task is stale", () => {
    const result = assess({
      inProgress: [row("T0.97 Smoke C"), row("T0.96 Smoke D")],
      marker: markerAt("T0.97", "2026-09-09T11:30:00Z"),
      now: NOW,
    });
    expect(result.live?.Name).toBe("T0.97 Smoke C");
    expect(result.stale.map((t) => t.Name)).toEqual(["T0.96 Smoke D"]);
    expect(result.stale[0].reason).toBe("the run marker names another task");
  });

  it("with nothing In progress there is nothing live and nothing stale", () => {
    expect(assess({ inProgress: [], marker: null, now: NOW })).toMatchObject({
      live: null,
      stale: [],
    });
  });

  it("reads the id off the front of a name", () => {
    expect(idOf("T0.97 Smoke C")).toBe("T0.97");
    expect(idOf("Raise SignInForm dom test timeout")).toBeNull();
  });

  it("stamps HHMM in UTC", () => {
    expect(stamp(new Date("2026-09-09T16:07:00Z"))).toBe("1607");
    expect(stamp(new Date("2026-09-09T00:00:00Z"))).toBe("0000");
  });
});

// TC4 → AC4. Over a real temporary repository, because the question is what git does to
// the branch and a stubbed runner would only prove the stub agrees with itself.
describe("recover", () => {
  let dir;
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  const run = (args) => git(...args);
  const now = () => new Date("2026-09-09T16:07:00Z");
  const commit = (message) => {
    git("add", "-A");
    git(
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

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-stale-"));
    git("init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.txt"), "a\n");
    commit("base");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("renames the dead run's branch and preserves its head", () => {
    git("checkout", "-q", "-b", "t0-97");
    writeFileSync(join(dir, "b.txt"), "b\n");
    commit("work");
    const head = git("rev-parse", "HEAD").stdout.trim();
    git("checkout", "-q", "main");

    const result = recover("T0.97", { run, now });

    expect(result).toMatchObject({ branch: "t0-97", renamed: "t0-97-stale-1607", head });
    expect(git("rev-parse", "t0-97-stale-1607").stdout.trim()).toBe(head);
    expect(git("rev-parse", "--verify", "--quiet", "refs/heads/t0-97").status).not.toBe(0);
  });

  it("commits uncommitted work onto the stale branch first, so nothing is lost", () => {
    git("checkout", "-q", "-b", "t0-97");
    commit("work");
    const head = git("rev-parse", "HEAD").stdout.trim();
    writeFileSync(join(dir, "c.txt"), "half-written\n");

    const result = recover("T0.97", { run, now });

    expect(result.wip).toBe(true);
    // The old head is the parent of the WIP commit: preserved, and reachable.
    expect(git("rev-parse", "t0-97-stale-1607~1").stdout.trim()).toBe(head);
    expect(git("show", "t0-97-stale-1607:c.txt").stdout).toBe("half-written\n");
    expect(git("status", "--porcelain").stdout.trim()).toBe("");
  });

  it("says there was no branch when the run died before making one", () => {
    expect(recover("T0.97", { run, now })).toEqual({
      branch: "t0-97",
      renamed: null,
      head: null,
      wip: false,
      remote: null,
    });
  });

  // T0.9 open question 8 → T0.12. The flag reads the commit's status, not the intention.
  it("says wip is false, and why, when the commit itself was refused", () => {
    git("checkout", "-q", "-b", "t0-97");
    commit("work");
    writeFileSync(join(dir, "c.txt"), "half-written\n");
    const hooks = join(dir, "hooks");
    mkdirSync(hooks);
    writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\necho refused by hook >&2\nexit 1\n", {
      mode: 0o755,
    });
    git("config", "core.hooksPath", hooks);

    const result = recover("T0.97", { run, now });

    expect(result.wip).toBe(false);
    expect(result.detail).toContain("refused by hook");
    expect(result.renamed).toBe("t0-97-stale-1607");
  });

  it("leaves a clean checked-out branch without a WIP commit", () => {
    git("checkout", "-q", "-b", "t0-97");
    commit("work");
    const head = git("rev-parse", "HEAD").stdout.trim();
    const result = recover("T0.97", { run, now });
    expect(result.wip).toBe(false);
    expect(git("rev-parse", "t0-97-stale-1607").stdout.trim()).toBe(head);
  });
});

// T0.9 open question 7 → T0.12. The remote half of `recover`, over a bare origin: the pushed
// copy of the dead run's branch is renamed on origin the same way, atomically.
describe("recover, with a pushed branch", () => {
  let root;
  let dir;
  const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const now = () => new Date("2026-09-09T16:07:00Z");
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

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aenima-stale-remote-"));
    const origin = join(root, "origin.git");
    dir = join(root, "clone");
    git(root, "init", "-q", "--bare", "-b", "main", origin);
    git(root, "clone", "-q", origin, dir);
    writeFileSync(join(dir, "a.txt"), "a\n");
    commit(dir, "base");
    git(dir, "push", "-q", "origin", "main");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("renames origin's copy too, and reports the remote name", () => {
    git(dir, "checkout", "-q", "-b", "t0-97");
    writeFileSync(join(dir, "b.txt"), "b\n");
    commit(dir, "work");
    const head = git(dir, "rev-parse", "HEAD").stdout.trim();
    git(dir, "push", "-q", "-u", "origin", "t0-97");
    git(dir, "checkout", "-q", "main");

    const result = recover("T0.97", { run: (args) => git(dir, ...args), now });

    expect(result).toMatchObject({ renamed: "t0-97-stale-1607", remote: "t0-97-stale-1607", head });
    expect(git(dir, "ls-remote", "--heads", "origin", "t0-97-stale-1607").stdout).toContain(head);
    expect(git(dir, "ls-remote", "--heads", "origin", "t0-97").stdout.trim()).toBe("");
  });

  it("reports no remote when the branch was never pushed", () => {
    git(dir, "checkout", "-q", "-b", "t0-97");
    commit(dir, "work");
    git(dir, "checkout", "-q", "main");
    const result = recover("T0.97", { run: (args) => git(dir, ...args), now });
    expect(result.remote).toBeNull();
    expect(result.renamed).toBe("t0-97-stale-1607");
  });
});
