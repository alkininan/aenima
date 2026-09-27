import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claim, readMarker } from "./claim.mjs";
import { PHASES, setPhase } from "./phase.mjs";

const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });

function repository() {
  const dir = mkdtempSync(join(tmpdir(), "aenima-phase-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "b");
  return dir;
}

// T0.44 TC2 → AC2: the phase the guard reads is the one the orchestrator wrote into the marker.
describe("the marker's phase", () => {
  let cwd;
  const env = { CLAUDE_CODE_SESSION_ID: "sess-1" };

  beforeEach(() => {
    cwd = repository();
    claim({ task: "T0.44", page: "p", branch: "t0-44" }, { cwd, env });
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("writes the phase and the route beside what the claim wrote, and keeps the rest", () => {
    setPhase({ phase: "build", route: "medium" }, { cwd, env });
    expect(readMarker(cwd)).toMatchObject({
      task: "T0.44",
      branch: "t0-44",
      session: "sess-1",
      phase: "build",
      route: "medium",
    });
    setPhase({ phase: "review" }, { cwd, env });
    expect(readMarker(cwd)).toMatchObject({ phase: "review", route: "medium" });
  });

  it("names the five phases in the order a run passes through them", () => {
    expect(PHASES).toEqual(["plan", "build", "review", "gate", "close"]);
  });

  it("refuses a phase or a route it does not know", () => {
    expect(() => setPhase({ phase: "ship" }, { cwd, env })).toThrow("no phase called");
    expect(() => setPhase({ phase: "build", route: "low" }, { cwd, env })).toThrow(
      "no route called",
    );
    expect(readMarker(cwd).phase).toBeUndefined();
  });

  it("refuses another session's marker, and a repository with none", () => {
    expect(() =>
      setPhase({ phase: "close" }, { cwd, env: { CLAUDE_CODE_SESSION_ID: "other" } }),
    ).toThrow("another session's run: T0.44");
    rmSync(join(cwd, ".git", "aenima-run-active"));
    expect(() => setPhase({ phase: "close" }, { cwd, env })).toThrow("no run marker");
  });
});
