import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultRunner, mergeDetect } from "./merge-detect.mjs";

// TC3 → AC3. Over a real repository, because the question is what git says about ancestry
// and a stubbed runner would only prove the stub agrees with itself.
describe("mergeDetect over a temporary repository", () => {
  let dir;
  let run;
  let landed;
  let stranded;
  let main;

  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (name, message) => {
    writeFileSync(join(dir, name), `${message}\n`);
    git("add", name);
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", message);
    return git("rev-parse", "HEAD");
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-merge-"));
    run = defaultRunner(dir);
    git("init", "--quiet", "--initial-branch=main");
    commit("a.txt", "base");

    // A branch that was merged back: its commit is an ancestor of main.
    git("checkout", "--quiet", "-b", "t9-1");
    landed = commit("b.txt", "landed work");
    git("checkout", "--quiet", "main");
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "merge",
      "--no-ff",
      "-m",
      "merge t9-1",
      "t9-1",
    );

    // A branch that was not: its commit is on no path back to main.
    git("checkout", "--quiet", "-b", "t9-2");
    stranded = commit("c.txt", "unmerged work");
    git("checkout", "--quiet", "main");
    main = git("rev-parse", "HEAD");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("calls a merged commit merged", () => {
    const { merged, open } = mergeDetect([{ Name: "T9.1", Commit: landed }], run, "main");
    expect(merged.map((t) => t.Name)).toEqual(["T9.1"]);
    expect(open).toEqual([]);
  });

  it("leaves an unmerged commit alone, and says why", () => {
    const { merged, open } = mergeDetect([{ Name: "T9.2", Commit: stranded }], run, "main");
    expect(merged).toEqual([]);
    expect(open[0]).toMatchObject({ Name: "T9.2", reason: "not an ancestor of main" });
  });

  it("partitions a mixed batch rather than deciding it as a whole", () => {
    const { merged, open } = mergeDetect(
      [
        { Name: "T9.1", Commit: landed },
        { Name: "T9.2", Commit: stranded },
      ],
      run,
      "main",
    );
    expect(merged.map((t) => t.Name)).toEqual(["T9.1"]);
    expect(open.map((t) => t.Name)).toEqual(["T9.2"]);
  });

  it("accepts a short hash, which is what the board stores", () => {
    const short = landed.slice(0, 7);
    expect(mergeDetect([{ Name: "T9.1", Commit: short }], run, "main").merged).toHaveLength(1);
  });

  it("calls the tip of main merged, since it is its own ancestor", () => {
    expect(mergeDetect([{ Name: "tip", Commit: main }], run, "main").merged).toHaveLength(1);
  });

  it("never calls a task with no commit merged", () => {
    const { merged, open } = mergeDetect([{ Name: "T9.3", Commit: "" }], run, "main");
    expect(merged).toEqual([]);
    expect(open[0].reason).toBe("no commit recorded");
  });

  it("does not treat a hash git cannot resolve as merged", () => {
    const { merged, open } = mergeDetect([{ Name: "T9.4", Commit: "0".repeat(40) }], run, "main");
    expect(merged).toEqual([]);
    expect(open).toHaveLength(1);
  });
});
