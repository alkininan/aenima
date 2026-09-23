import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { branchIds, docsIds, idOf, nextId, phaseOf, repoTaken } from "./next-id.mjs";
import { parseHeaderVersion } from "./version-drift.mjs";

/**
 * T0.28 — a number is answered once. The board's tasks are the phase's, not the epic's, and
 * a branch or a docs file holds a number after the task that carried it is gone.
 */

/** Phase 0 as the board holds it: E0.1 took 1–6, E0.2 took 7–27, and 40 and 96 were given by hand. */
const BOARD = [
  ...[1, 2, 3, 4, 5, 6].map((n) => `T0.${n} E0.1's`),
  ...Array.from({ length: 21 }, (_, i) => `T0.${i + 7} E0.2's`),
  "T0.40 Tokens and fonts to v2.21",
  "T0.96 Smoke D",
  "Number task IDs across the phase",
];

describe("nextId", () => {
  // TC1 → AC1
  it("answers the lowest free number in the phase for an epic holding none", () => {
    expect(nextId("E0.4 Design conformance", BOARD)).toEqual({ id: "T0.28", phase: 0, n: 28 });
  });

  // TC2 → AC2
  it("skips a number another epic in the phase holds", () => {
    // E0.1 stops at T0.6, so a per-epic count answers T0.7 — which is E0.2's Setup.
    expect(nextId("E0.1 Foundation", BOARD).id).toBe("T0.28");
  });

  // TC3 → AC3
  it("does not answer a number carried only by a branch or a docs file", () => {
    expect(nextId("E0.4 Design conformance", BOARD, ["T0.28"]).id).toBe("T0.29");
    expect(nextId("E0.4 Design conformance", BOARD, ["T0.28", "T0.29"]).id).toBe("T0.30");
  });

  // TC1 → AC1
  it("fills a hole the board left rather than counting past it", () => {
    expect(nextId("E3.1 X", ["T3.1 a", "T3.3 b", "T3.4 c"]).id).toBe("T3.2");
  });

  // TC1 → AC1
  it("starts at 1 in a phase with no numbered task anywhere", () => {
    expect(nextId("E5.2 Handover", []).id).toBe("T5.1");
    expect(nextId("E5.2 Handover", ["Smoke A", "Another"]).id).toBe("T5.1");
  });

  // The Build's "the epic still gives the phase": a number is one phase's and no other's.
  it("counts only the phase's own numbers", () => {
    expect(nextId("E3.1 X", ["T4.1 other phase", "T4.2 other phase"]).id).toBe("T3.1");
  });

  // The Build's "the epic still gives the phase": no phase, no number to invent.
  it("refuses to invent a phase when the epic name carries none", () => {
    expect(nextId("Authoring loop", ["T3.1 a"]).error).toContain("no phase number");
    expect(nextId(null, []).error).toContain("no phase number");
  });

  // The parsers under it. Reading T0.98 as 9 or as 8 would take a number that is free.
  it("reads a two-digit number as one number, not as its first digit", () => {
    const upToEight = Array.from({ length: 8 }, (_, i) => `T0.${i + 1} taken`);
    expect(nextId("E0.1 Foundation", [...upToEight, "T0.98 Smoke A"]).id).toBe("T0.9");
  });
});

describe("the parsers under it", () => {
  it("takes the phase from an epic id and nothing else", () => {
    expect(phaseOf("E3.1 Authoring loop")).toBe(3);
    expect(phaseOf("E12.4 Later")).toBe(12);
    expect(phaseOf("Phase 3 Authoring")).toBeNull();
  });

  it("reads a task id only at the head of the name", () => {
    expect(idOf("T3.1 Author-critic loop")).toEqual({ phase: 3, n: 1 });
    expect(idOf("Rework T3.1 later")).toBeNull();
    expect(idOf("")).toBeNull();
  });
});

// TC3 → AC3
describe("branchIds", () => {
  it("reads a ticket branch's id, local or on origin", () => {
    expect(branchIds("t0-28\norigin/t1-4\n")).toEqual(["T0.28", "T1.4"]);
  });

  it("reads the id a renamed branch still carries", () => {
    // stale.mjs renames to t<id>-stale-<HHMM>; branch.mjs freed t0-8 as t0-8-close.
    expect(branchIds("origin/t0-8-close\nt0-97-stale-1607\n")).toEqual(["T0.8", "T0.97"]);
  });

  it("reads nothing from a branch that is not a ticket's", () => {
    expect(branchIds("main\nclaude/dreamy-almeida-3c7e80\norigin/HEAD -> origin/main\n")).toEqual(
      [],
    );
  });
});

// TC3 → AC3
describe("docsIds", () => {
  it("reads the id a docs file's name carries", () => {
    expect(docsIds(["log/T0.28.md", "reports/T1.4.md", "tickets/T0.4-follow-up.md"])).toEqual([
      "T0.28",
      "T1.4",
      "T0.4",
    ]);
  });

  it("reads a two-digit number as one number", () => {
    expect(docsIds(["log/T0.40.md"])).toEqual(["T0.40"]);
  });

  it("reads nothing from a document that is not a ticket's", () => {
    expect(docsIds(["build-log.md", "log/deploy.md", "design-spec.md"])).toEqual([]);
  });
});

// TC3 → AC3
describe("repoTaken", () => {
  /** A git that answers each subcommand in turn; `top` null is a root it cannot name. */
  const git =
    ({ top, branches = { status: 0, stdout: "" } }) =>
    (args) =>
      args[0] === "rev-parse"
        ? top === null
          ? { status: 128, stdout: "" }
          : { status: 0, stdout: `${top}\n` }
        : branches;

  it("takes the numbers the branches and the docs tree carry", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    mkdirSync(join(cwd, "docs", "log"), { recursive: true });
    writeFileSync(join(cwd, "docs", "log", "T0.28.md"), "# T0.28\n");
    writeFileSync(join(cwd, "docs", "log", "deploy.md"), "# deploy\n");

    const run = git({ top: cwd, branches: { status: 0, stdout: "origin/t1-4\nmain\n" } });
    const taken = repoTaken({ cwd, run });
    expect(taken.ids.sort()).toEqual(["T0.28", "T1.4"]);
    expect(taken.unread).toEqual([]);
  });

  // The docs tree is the repository's, not the working directory's: `scripts/` holds none, and
  // reading it there answered T0.1 with nothing unread.
  it("reads the docs tree at the root git names, not under the working directory", () => {
    const root = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    mkdirSync(join(root, "docs", "log"), { recursive: true });
    writeFileSync(join(root, "docs", "log", "T0.1.md"), "# T0.1\n");
    const cwd = join(root, "scripts");
    mkdirSync(cwd);

    expect(repoTaken({ cwd, run: git({ top: root }) })).toEqual({ ids: ["T0.1"], unread: [] });
  });

  it("says so when git could not answer, rather than answering short in silence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    mkdirSync(join(cwd, "docs", "reports"), { recursive: true });
    writeFileSync(join(cwd, "docs", "reports", "T2.9.md"), "# T2.9\n");

    const run = git({ top: cwd, branches: { status: 128, stdout: "" } });
    expect(repoTaken({ cwd, run })).toEqual({ ids: ["T2.9"], unread: ["branches"] });
  });

  it("takes nothing, and reports nothing unread, where the root holds no docs tree", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    const run = git({ top: cwd, branches: { status: 0, stdout: "main\n" } });
    expect(repoTaken({ cwd, run })).toEqual({ ids: [], unread: [] });
  });

  // No root, so no way to know a missing tree from one somewhere else: the set is narrow.
  it("says the docs tree is unread when git cannot name the root at all", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    const run = git({ top: null, branches: { status: 128, stdout: "" } });
    expect(repoTaken({ cwd, run })).toEqual({ ids: [], unread: ["branches", "docs"] });
  });

  it("says so when the docs tree is there and cannot be read", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    // A file where the tree should be: readdir refuses with ENOTDIR, not ENOENT.
    writeFileSync(join(cwd, "docs"), "not a directory\n");
    const run = git({ top: cwd, branches: { status: 0, stdout: "origin/t1-4\n" } });
    expect(repoTaken({ cwd, run })).toEqual({ ids: ["T1.4"], unread: ["docs"] });
  });
});

// TC1 → AC1 · TC3 → AC3. The CLI is the composition: a run gets the board's names and the
// repository's own numbers in one answer, or neither rule is applied where it is used.
describe("next-id.mjs as the command", () => {
  const script = join(import.meta.dirname, "next-id.mjs");
  const cli = (input, cwd) =>
    JSON.parse(
      spawnSync("node", [script], { cwd, input: JSON.stringify(input), encoding: "utf8" }).stdout,
    );

  /** A checkout with one commit, so its branch is born and `git branch` lists it. */
  const checkout = (branch) => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    const git = (...args) =>
      spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd,
        encoding: "utf8",
      });
    git("init", "-q", "-b", branch);
    writeFileSync(join(cwd, "a.txt"), "a\n");
    git("add", "-A");
    git("commit", "-q", "-m", "a");
    return cwd;
  };

  it("counts what the checkout carries, not only the names it is handed", () => {
    const cwd = checkout("t0-2");
    mkdirSync(join(cwd, "docs", "log"), { recursive: true });
    writeFileSync(join(cwd, "docs", "log", "T0.3.md"), "# T0.3\n");

    // Handed T0.1 alone: the branch holds 2 and the docs file holds 3, so the answer is 4.
    expect(cli({ epic: "E0.2 Pipeline", tasks: ["T0.1 Scaffold"] }, cwd)).toEqual({
      id: "T0.4",
      phase: 0,
      n: 4,
      unread: [],
    });
  });

  // Must 2 of review pass 2: from `scripts/`, git still answers and `docs/` is not there, so the
  // answer was T0.1 — the scaffold ticket's — with `unread` empty.
  it("reads the checkout's docs tree from a directory inside it", () => {
    const cwd = checkout("main");
    mkdirSync(join(cwd, "docs", "log"), { recursive: true });
    writeFileSync(join(cwd, "docs", "log", "T0.1.md"), "# T0.1\n");
    const inner = join(cwd, "scripts");
    mkdirSync(inner);

    expect(cli({ epic: "E0.9 New", tasks: [] }, inner)).toEqual({
      id: "T0.2",
      phase: 0,
      n: 2,
      unread: [],
    });
  });

  it("carries the epic's refusal through, with nothing unread", () => {
    const out = cli({ epic: "Pipeline", tasks: [] }, checkout("main"));
    expect(out.error).toContain("no phase number");
    expect(out.unread).toEqual([]);
  });
});

// TC4 → AC4
describe("docs/guidelines.md", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "..", "docs", "guidelines.md"), "utf8");

  /** §7's body, from its heading to the next one. */
  const names = text.split(/^## 7\. Names$/m)[1]?.split(/^## /m)[0] ?? "";

  it("states under §7 that a number is the phase's and never used twice", () => {
    expect(names).toContain("belongs to its phase, not to its epic");
    expect(names).toContain("never used twice");
    expect(names).toMatch(/branch or a file under\s+`docs\/`/);
  });

  it("carries the bumped version in its header", () => {
    expect(parseHeaderVersion(text)).toBe("1.21");
  });
});
