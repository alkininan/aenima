import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { branchOfMerge, idOfBranch, prepareRevert } from "./revert.mjs";

// T0.16 TC5 → AC5. A merge whose deploy check failed is reverted: one commit on top of
// origin/main that restores the tree the merge's first parent had, prepared here and pushed
// by the skill as `git push origin HEAD:main` — the one push to main the guard lets through.
describe("branchOfMerge and idOfBranch", () => {
  it("reads the ticket branch out of a pull-request merge subject", () => {
    expect(branchOfMerge("Merge pull request #12 from alkininan/t0-16")).toBe("t0-16");
    expect(branchOfMerge("Merge branch 'feature'")).toBeNull();
    expect(idOfBranch("t0-16")).toBe("T0.16");
    expect(idOfBranch("t0-16-stale-1607")).toBeNull();
    expect(idOfBranch(null)).toBeNull();
  });
});

describe("prepareRevert over a temporary repository", () => {
  let root;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  const sh = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (cwd, name, message) => {
    writeFileSync(join(cwd, name), `${message}\n`);
    sh(cwd, "add", name);
    sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
    return sh(cwd, "rev-parse", "HEAD");
  };

  /** A source repo, a bare origin cloned from it, and a working clone with origin/main. */
  const fixture = ({ mergeAtTip }) => {
    root = mkdtempSync(join(tmpdir(), "aenima-revert-"));
    const src = join(root, "src");
    sh(root, "init", "-q", "-b", "main", src);
    commit(src, "a.txt", "base");
    if (mergeAtTip) {
      sh(src, "checkout", "-q", "-b", "t9-1");
      commit(src, "broken.txt", "break sign-in");
      sh(src, "checkout", "-q", "main");
      sh(
        src,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "merge",
        "--no-ff",
        "-q",
        "-m",
        "Merge pull request #3 from alkininan/t9-1",
        "t9-1",
      );
    } else {
      commit(src, "b.txt", "plain");
    }
    sh(root, "clone", "-q", "--bare", src, join(root, "origin.git"));
    const work = join(root, "work");
    sh(root, "clone", "-q", join(root, "origin.git"), work);
    sh(work, "checkout", "-q", "-b", "wt");
    return work;
  };

  it("reverts the merge at the tip as one commit on origin/main that restores the tree before it", () => {
    const work = fixture({ mergeAtTip: true });
    const result = prepareRevert({ cwd: work });
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ branch: "t9-1", id: "T9.1", previous: "wt" });
    expect(sh(work, "rev-parse", "HEAD^")).toBe(sh(work, "rev-parse", "origin/main"));
    expect(sh(work, "rev-parse", "HEAD^{tree}")).toBe(
      sh(work, "rev-parse", "origin/main^1^{tree}"),
    );
    expect(sh(work, "rev-parse", "HEAD")).toBe(result.head);
    expect(result.push).toBe("git push origin HEAD:main");
    // Nothing is pushed here: the push is the skill's own command, so the guard sees it.
    expect(sh(work, "rev-parse", "origin/main")).toBe(result.merge);
  });

  it("does nothing when the tip of origin/main is not a merge commit, and says so", () => {
    const work = fixture({ mergeAtTip: false });
    const before = sh(work, "rev-parse", "HEAD");
    const result = prepareRevert({ cwd: work });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("not a merge commit");
    expect(sh(work, "rev-parse", "HEAD")).toBe(before);
  });

  it("stops rather than carry uncommitted work into a detached checkout", () => {
    const work = fixture({ mergeAtTip: true });
    writeFileSync(join(work, "half.txt"), "half\n");
    const result = prepareRevert({ cwd: work });
    expect(result.ok).toBe(false);
    expect(result.why).toContain("uncommitted");
    expect(sh(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("wt");
  });
});
