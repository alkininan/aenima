import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claim, MARKER, marker, markerPath, readMarker } from "./claim.mjs";
import { release } from "./release.mjs";

const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });

/** A temporary repository with one commit, so a worktree can be added to it. */
function repository() {
  const dir = mkdtempSync(join(tmpdir(), "aenima-marker-"));
  git(dir, "init", "-q", "-b", "main");
  git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "base",
  );
  return dir;
}

// TC2 → AC2 (T0.9). The marker exists from claim to exit and is gone after each of the three
// exits: Review, Decision, and the error path through the SessionEnd hook.
describe("the run marker", () => {
  let cwd;
  const env = { CLAUDE_CODE_SESSION_ID: "sess-1" };
  const fields = { task: "T0.97", page: "3d07-page", branch: "t0-97" };

  beforeEach(() => {
    cwd = repository();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("records task, page, branch, a UTC start and the session", () => {
    const now = () => new Date("2026-09-09T10:00:00Z");
    expect(marker(fields, { env, now })).toEqual({
      task: "T0.97",
      page: "3d07-page",
      branch: "t0-97",
      started: "2026-09-09T10:00:00.000Z",
      session: "sess-1",
    });
  });

  // T0.11 review pass 2, Must 2 (and pass 3, Should 10): a claim never lands on a live run's
  // marker — the never-overlap rule from the claiming side.
  it("refuses to overwrite a fresh marker another session wrote, and names the task", () => {
    claim(fields, { cwd, env: { CLAUDE_CODE_SESSION_ID: "other" } });
    expect(() => claim({ ...fields, task: "T0.98" }, { cwd, env })).toThrow(
      "a live run owns this repository: T0.97",
    );
    expect(readMarker(cwd).task).toBe("T0.97");
  });

  it("overwrites another session's marker once it is older than three hours, and its own always", () => {
    const old = () => new Date(Date.now() - 4 * 60 * 60 * 1000);
    claim(fields, { cwd, env: { CLAUDE_CODE_SESSION_ID: "other" }, now: old });
    expect(claim({ ...fields, task: "T0.99" }, { cwd, env }).task).toBe("T0.99");
    expect(claim({ ...fields, task: "T0.98" }, { cwd, env }).task).toBe("T0.98");
    expect(readMarker(cwd).session).toBe("sess-1");
  });

  it("reads two markers with no session id as two sessions, not one", () => {
    claim(fields, { cwd, env: {} });
    expect(() => claim({ ...fields, task: "T0.98" }, { cwd, env: {} })).toThrow("a live run");
  });

  it("is present between claim and exit", () => {
    expect(readMarker(cwd)).toBeNull();
    claim(fields, { cwd, env });
    expect(existsSync(markerPath(cwd))).toBe(true);
    expect(readMarker(cwd).task).toBe("T0.97");
  });

  it("is absent after the Review exit", () => {
    claim(fields, { cwd, env });
    expect(release({ session: "sess-1" }, { cwd })).toMatchObject({ released: true });
    expect(existsSync(markerPath(cwd))).toBe(false);
  });

  it("is absent after the Decision exit", () => {
    claim(fields, { cwd, env });
    expect(release({ session: "sess-1" }, { cwd }).released).toBe(true);
    expect(readMarker(cwd)).toBeNull();
  });

  it("is absent after the error exit — the SessionEnd hook, given the hook's JSON", () => {
    claim(fields, { cwd, env });
    const hook = spawnSync(process.execPath, [join(import.meta.dirname, "release.mjs"), "--hook"], {
      input: JSON.stringify({ session_id: "sess-1", cwd, hook_event_name: "SessionEnd" }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: "" },
    });
    expect(hook.status).toBe(0);
    expect(JSON.parse(hook.stdout).released).toBe(true);
    expect(existsSync(markerPath(cwd))).toBe(false);
  });

  it("is left alone by a session that did not write it", () => {
    claim(fields, { cwd, env });
    expect(release({ session: "sess-2" }, { cwd })).toMatchObject({
      released: false,
      reason: "another session's marker",
    });
    expect(existsSync(markerPath(cwd))).toBe(true);
  });

  it("releases nothing when there is nothing, and says so", () => {
    expect(release({ session: "sess-1" }, { cwd })).toEqual({
      released: false,
      reason: "no marker",
    });
  });

  it("reads an unreadable marker as none rather than throwing", () => {
    claim(fields, { cwd, env });
    writeFileSync(markerPath(cwd), "not json");
    expect(readMarker(cwd)).toBeNull();
  });
});

// TC1 → AC1 (T0.10). One repository, two worktrees, one marker: what a scheduled run in its
// own worktree writes, a run in any other worktree of the repository reads.
describe("the marker is shared across worktrees", () => {
  let primary;
  let other;
  const env = { CLAUDE_CODE_SESSION_ID: "sess-1" };
  const fields = { task: "T0.96", page: "p", branch: "t0-96" };

  beforeEach(() => {
    primary = repository();
    other = mkdtempSync(join(tmpdir(), "aenima-worktree-"));
    rmSync(other, { recursive: true });
    expect(git(primary, "worktree", "add", "-q", other, "-b", "wt").status).toBe(0);
  });
  afterEach(() => {
    rmSync(other, { recursive: true, force: true });
    rmSync(primary, { recursive: true, force: true });
  });

  it("resolves to the same path from both worktrees", () => {
    expect(markerPath(other)).toBe(markerPath(primary));
    expect(markerPath(primary)).toBe(join(realpathSync(primary), ".git", MARKER));
  });

  it("is read from the other worktree after a claim in one, and released from there", () => {
    claim(fields, { cwd: primary, env });
    expect(readMarker(other)).toMatchObject({ task: "T0.96", session: "sess-1" });
    expect(release({ session: "sess-1" }, { cwd: other }).released).toBe(true);
    expect(readMarker(primary)).toBeNull();
  });

  it("is never something git could track, from either side", () => {
    claim(fields, { cwd: other, env });
    expect(git(primary, "status", "--porcelain").stdout).toBe("");
    expect(git(other, "status", "--porcelain").stdout).toBe("");
  });

  it("has no path outside a repository, rather than a guessed one", () => {
    const nowhere = mkdtempSync(join(tmpdir(), "aenima-norepo-"));
    try {
      expect(() => markerPath(nowhere)).toThrow(/not inside a git repository/);
      expect(readMarker(nowhere)).toBeNull();
    } finally {
      rmSync(nowhere, { recursive: true, force: true });
    }
  });
});
