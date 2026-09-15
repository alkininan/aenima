import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { conflictsFor, conflictsOf } from "./conflicts.mjs";
import { defaultRunner } from "./merge-detect.mjs";

// T0.20 TC3 → AC3, the files' half: a merge GitHub refused says which files stand in the way.
// Over a real repository, because what conflicts is git's to say and a stubbed runner would
// only prove the stub agrees with itself.
describe("conflictsOf over a temporary repository", () => {
  let dir;
  let run;

  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (files, message) => {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), `${text}\n`);
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-conflicts-"));
    run = defaultRunner(dir);
    git("init", "--quiet", "--initial-branch=main");
    commit({ "guidelines.md": "v1.10", "README.md": "steps", "a.txt": "a" }, "base");

    // The ticket's branch rewrites two files and adds one.
    git("checkout", "--quiet", "-b", "t9-1");
    commit(
      { "guidelines.md": "v1.11 from the ticket", "README.md": "ticket steps", "new.txt": "n" },
      "ticket",
    );

    // Main moves on the same two passages, and on a file the ticket did not touch.
    git("checkout", "--quiet", "main");
    commit(
      { "guidelines.md": "v1.11 from another ticket", "README.md": "other steps", "a.txt": "b" },
      "other",
    );

    // A branch that touches nothing main changed.
    git("checkout", "--quiet", "-b", "t9-2", "main~1");
    commit({ "c.txt": "c" }, "clean");
    git("checkout", "--quiet", "main");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("names the files in conflict, and only those", () => {
    expect(conflictsOf("t9-1", run, "main")).toEqual({
      ok: true,
      head: "t9-1",
      base: "main",
      clean: false,
      files: ["README.md", "guidelines.md"],
      why: null,
    });
  });

  it("says a branch that merges cleanly has no files in the way", () => {
    expect(conflictsOf("t9-2", run, "main")).toMatchObject({ ok: true, clean: true, files: [] });
  });

  // T0.20 TC3 → AC3 (review pass 2, Should 6): against an origin/main that could not be
  // fetched, "no conflicts" would be a guess.
  it("says so, rather than naming nothing, when origin could not be fetched", () => {
    const result = conflictsFor("t9-1", run);
    expect(result.ok).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.why).toContain("fetch");
  });

  it("says so, rather than naming nothing, when a ref is not there", () => {
    const result = conflictsOf("t9-missing", run, "main");
    expect(result.ok).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.why).toContain("t9-missing");
  });
});
