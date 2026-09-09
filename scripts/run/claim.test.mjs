import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claim, marker, markerPath, readMarker } from "./claim.mjs";
import { release } from "./release.mjs";

// TC2 → AC2. The marker exists from claim to exit and is gone after each of the three
// exits: Review, Decision, and the error path through the SessionEnd hook.
describe("the run marker", () => {
  let cwd;
  const env = { CLAUDE_CODE_SESSION_ID: "sess-1" };
  const fields = { task: "T0.97", page: "3d07-page", branch: "t0-97" };

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "aenima-marker-"));
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
