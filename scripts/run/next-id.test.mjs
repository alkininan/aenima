import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  // TC2 → AC2
  it("counts only the phase's own numbers", () => {
    expect(nextId("E3.1 X", ["T4.1 other phase", "T4.2 other phase"]).id).toBe("T3.1");
  });

  // TC1 → AC1
  it("refuses to invent a phase when the epic name carries none", () => {
    expect(nextId("Authoring loop", ["T3.1 a"]).error).toContain("no phase number");
    expect(nextId(null, []).error).toContain("no phase number");
  });

  // TC1 → AC1
  it("reads a two-digit number as one number, not as its first digit", () => {
    expect(nextId("E0.1 Foundation", ["T0.98 Smoke A"]).id).toBe("T0.1");
    expect(nextId("E0.1 Foundation", ["T0.1 a", "T0.98 Smoke A"]).id).toBe("T0.2");
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
  it("takes the numbers the branches and the docs tree carry", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    mkdirSync(join(cwd, "docs", "log"), { recursive: true });
    writeFileSync(join(cwd, "docs", "log", "T0.28.md"), "# T0.28\n");
    writeFileSync(join(cwd, "docs", "log", "deploy.md"), "# deploy\n");

    const run = () => ({ status: 0, stdout: "origin/t1-4\nmain\n" });
    expect(repoTaken({ cwd, run }).sort()).toEqual(["T0.28", "T1.4"]);
  });

  it("takes only the docs tree when git cannot answer", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    mkdirSync(join(cwd, "docs", "reports"), { recursive: true });
    writeFileSync(join(cwd, "docs", "reports", "T2.9.md"), "# T2.9\n");

    const run = () => ({ status: 128, stdout: "" });
    expect(repoTaken({ cwd, run })).toEqual(["T2.9"]);
  });

  it("takes nothing where there is no docs tree at all", () => {
    const cwd = mkdtempSync(join(tmpdir(), "aenima-next-id-"));
    const run = () => ({ status: 0, stdout: "main\n" });
    expect(repoTaken({ cwd, run })).toEqual([]);
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
    expect(parseHeaderVersion(text)).toBe("1.20");
  });
});
