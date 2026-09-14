import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claim, markerPath } from "./claim.mjs";

// TC3 → AC3 · T0.9 open question 5 → T0.12. The SessionEnd path of `release.mjs`: the hook JSON on stdin
// names the session and the cwd, and only the marker that session wrote goes. `release()`
// itself is covered beside `claim`; this drives the command the hook runs.

const script = join(import.meta.dirname, "release.mjs");
const hook = (payload, cwd) =>
  spawnSync("node", [script, "--hook"], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CODE_SESSION_ID: "" },
  });

describe("release.mjs --hook", () => {
  let repo;
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "aenima-release-"));
    git("init", "-q", "-b", "main");
    writeFileSync(join(repo, "a.txt"), "a\n");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("removes the marker the ending session wrote, reading session and cwd from the payload", () => {
    claim(
      { task: "T0.12", page: "p", branch: "t0-12" },
      { cwd: repo, env: { CLAUDE_CODE_SESSION_ID: "sess-a" } },
    );
    expect(existsSync(markerPath(repo))).toBe(true);

    const run = hook({ session_id: "sess-a", cwd: repo, hook_event_name: "SessionEnd" }, tmpdir());

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ released: true, marker: { task: "T0.12" } });
    expect(existsSync(markerPath(repo))).toBe(false);
  });

  it("leaves another session's marker alone", () => {
    claim(
      { task: "T0.12", page: "p", branch: "t0-12" },
      { cwd: repo, env: { CLAUDE_CODE_SESSION_ID: "sess-a" } },
    );

    const run = hook({ session_id: "sess-b", cwd: repo }, repo);

    expect(JSON.parse(run.stdout)).toMatchObject({
      released: false,
      reason: "another session's marker",
    });
    expect(existsSync(markerPath(repo))).toBe(true);
  });

  it("releases nothing on a payload it cannot read", () => {
    claim(
      { task: "T0.12", page: "p", branch: "t0-12" },
      { cwd: repo, env: { CLAUDE_CODE_SESSION_ID: "sess-a" } },
    );

    const run = hook("not json", repo);

    expect(JSON.parse(run.stdout)).toEqual({ released: false, reason: "unreadable hook input" });
    expect(existsSync(markerPath(repo))).toBe(true);
  });

  it("says there was no marker when none was written", () => {
    const run = hook({ session_id: "sess-a", cwd: repo }, repo);
    expect(JSON.parse(run.stdout)).toEqual({ released: false, reason: "no marker" });
  });
});
