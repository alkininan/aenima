import { describe, expect, it } from "vitest";

import { baseRef, branchName, createBranch, isPrimaryCheckout } from "./branch.mjs";

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
  const record = (results) => {
    const calls = [];
    const run = (args) => {
      calls.push(args.join(" "));
      if (args.includes("--git-common-dir") || args.includes("--git-dir")) {
        return { status: 0, stdout: "/repo/.git\n" };
      }
      return results[args[0]] ?? { status: 0, stdout: "" };
    };
    return { calls, run };
  };

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
