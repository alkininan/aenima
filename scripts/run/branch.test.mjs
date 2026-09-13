import { describe, expect, it } from "vitest";

import { baseRef, branchName, createBranch, heldBy, isPrimaryCheckout } from "./branch.mjs";

describe("branchName", () => {
  it("lowercases the id and turns the dot into a hyphen", () => {
    expect(branchName("T3.1")).toBe("t3-1");
    expect(branchName("T0.98")).toBe("t0-98");
  });

  it("does not double the leading t when the id already carries one", () => {
    expect(branchName("t0.8")).toBe("t0-8");
  });

  it("ignores surrounding whitespace", () => {
    expect(branchName("  T0.8  ")).toBe("t0-8");
  });
});

describe("baseRef", () => {
  it("is origin/main when nothing overrides it", () => {
    expect(baseRef({})).toBe("origin/main");
  });

  it("is overridable, which is how a run tests a skill that is not yet on main", () => {
    expect(baseRef({ AENIMA_RUN_BASE: "HEAD" })).toBe("HEAD");
  });

  it("treats an empty override as no override rather than as an empty ref", () => {
    expect(baseRef({ AENIMA_RUN_BASE: "   " })).toBe("origin/main");
  });
});

describe("isPrimaryCheckout", () => {
  const runner = (common, own) => (args) => {
    if (args.includes("--git-common-dir")) return { status: 0, stdout: `${common}\n` };
    if (args.includes("--git-dir")) return { status: 0, stdout: `${own}\n` };
    return { status: 1, stdout: "" };
  };

  it("is true when the common git dir and this one are the same directory", () => {
    expect(isPrimaryCheckout(runner("/repo/.git", "/repo/.git"))).toBe(true);
  });

  it("is false inside a linked worktree", () => {
    expect(isPrimaryCheckout(runner("/repo/.git", "/repo/.git/worktrees/wt"))).toBe(false);
  });

  it("says null rather than true when git cannot answer", () => {
    expect(isPrimaryCheckout(() => ({ status: 128, stdout: "" }))).toBeNull();
  });
});

describe("createBranch", () => {
  const record = (results, { onOrigin = false } = {}) => {
    const calls = [];
    const run = (args) => {
      calls.push(args.join(" "));
      if (args.includes("--git-common-dir") || args.includes("--git-dir")) {
        return { status: 0, stdout: "/repo/.git\n" };
      }
      if (args[0] === "rev-parse" && args.includes("--verify")) {
        return { status: onOrigin ? 0 : 1, stdout: "" };
      }
      return results[args[0]] ?? { status: 0, stdout: "" };
    };
    return { calls, run };
  };

  // TC1 → AC1. A task sent back to Ready by a reply at Review carries its branch and its
  // pull request: the branch is reused from origin's copy, not recreated off main.
  it("reuses a branch already on origin, set to origin's copy, and says so", () => {
    const { calls, run } = record({}, { onOrigin: true });
    const result = createBranch("T0.11", { env: {}, run });
    expect(calls).toContain("rev-parse --verify --quiet refs/remotes/origin/t0-11");
    expect(calls.at(-1)).toBe("checkout -B t0-11 origin/t0-11");
    expect(result).toMatchObject({ reused: true, base: "origin/t0-11", ok: true });
  });

  it("branches new off the base when origin has no copy", () => {
    const { calls, run } = record({});
    const result = createBranch("T0.11", { env: {}, run });
    expect(calls.at(-1)).toBe("checkout -b t0-11 origin/main");
    expect(result).toMatchObject({ reused: false, base: "origin/main" });
  });

  // The run that took the task to Review left its worktree on the branch, and git refuses
  // to check a branch out in two worktrees at once (review pass 1, Must 1).
  const porcelain = [
    "worktree /repo",
    "HEAD aaaa",
    "branch refs/heads/main",
    "",
    "worktree /repo/.claude/worktrees/kirch",
    "HEAD bbbb",
    "branch refs/heads/t0-11",
    "",
  ].join("\n");
  const holding = (extra = {}) => ({
    worktree: { status: 0, stdout: porcelain },
    ...extra,
  });
  const runner = (results, onOrigin) => {
    const { calls, run: base } = record(results, { onOrigin });
    const run = (args) => {
      if (args[0] === "worktree" && args[1] === "list") return results.worktree;
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        return { status: 0, stdout: "/repo\n" };
      }
      return base(args);
    };
    return { calls, run };
  };

  it("removes the other worktree that still holds the branch, then checks it out", () => {
    const { calls, run } = runner(holding(), true);
    const result = createBranch("T0.11", { env: {}, run });
    const remove = calls.indexOf("worktree remove /repo/.claude/worktrees/kirch");
    expect(remove).toBeGreaterThan(-1);
    expect(calls.at(-1)).toBe("checkout -B t0-11 origin/t0-11");
    expect(remove).toBeLessThan(calls.length - 1);
    expect(result).toMatchObject({
      ok: true,
      reused: true,
      freed: "/repo/.claude/worktrees/kirch",
    });
  });

  it("stops rather than lose work when that worktree cannot be removed", () => {
    const { calls, run } = runner(holding({ worktree: { status: 0, stdout: porcelain } }), true);
    const failing = (args) =>
      args[0] === "worktree" && args[1] === "remove"
        ? { status: 128, stderr: "contains modified or untracked files" }
        : run(args);
    const result = createBranch("T0.11", { env: {}, run: failing });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("/repo/.claude/worktrees/kirch");
    expect(result.detail).toContain("modified or untracked");
    expect(calls.some((c) => c.startsWith("checkout"))).toBe(false);
  });

  it("does not remove its own worktree when that is where the branch is checked out", () => {
    const own = porcelain.replaceAll("/repo/.claude/worktrees/kirch", "/repo");
    const { calls, run } = runner(holding({ worktree: { status: 0, stdout: own } }), true);
    createBranch("T0.11", { env: {}, run });
    expect(calls.some((c) => c.startsWith("worktree remove"))).toBe(false);
    expect(calls.at(-1)).toBe("checkout -B t0-11 origin/t0-11");
  });

  it("names the other worktree holding a branch, and null when none does", () => {
    const run = (args) =>
      args[0] === "worktree" ? { status: 0, stdout: porcelain } : { status: 0, stdout: "/repo\n" };
    expect(heldBy("t0-11", run)).toBe("/repo/.claude/worktrees/kirch");
    expect(heldBy("t0-12", run)).toBeNull();
    expect(heldBy("main", run)).toBeNull();
  });

  it("fetches before it branches, so origin/main is not yesterday's", () => {
    const { calls, run } = record({});
    createBranch("T0.98", { env: {}, run });
    expect(calls[0]).toBe("fetch --quiet origin");
    expect(calls.at(-1)).toBe("checkout -b t0-98 origin/main");
  });

  it("branches from the override when one is set", () => {
    const { calls, run } = record({});
    createBranch("T0.98", { env: { AENIMA_RUN_BASE: "HEAD" }, run });
    expect(calls.at(-1)).toBe("checkout -b t0-98 HEAD");
  });

  it("reports the failure instead of returning ok on a checkout that did not happen", () => {
    const { run } = record({ checkout: { status: 128, stderr: "already exists" } });
    const result = createBranch("T0.98", { env: {}, run });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("already exists");
  });

  it("records that the checkout is primary, which step 9 needs to return it to main", () => {
    const { run } = record({});
    expect(createBranch("T0.98", { env: {}, run }).primary).toBe(true);
  });
});
