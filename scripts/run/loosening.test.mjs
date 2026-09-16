import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { decide } from "../hooks/guard.mjs";
import {
  coverageGaps,
  detectorLoosened,
  DETECTOR,
  gateLoosened,
  GUARD_CORPUS,
  guardLoosened,
  hooksLoosened,
  hooksOf,
  loosenedBy,
  loosenings,
  PATH_CORPUS,
  pathsLoosened,
  refusals,
  ruleLetters,
  testsLoosened,
  uncovered,
} from "./loosening.mjs";

/**
 * T0.21 — the gated set stops being a list of paths and becomes a measurement. The tests
 * below are of two kinds: the pure rules, and TC3/TC4 over a real repository with a real
 * before/after pair, because a detector that only ever saw hand-written inputs would not
 * prove it can read a diff.
 */

const root = join(import.meta.dirname, "..", "..");
const made = [];

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * A repository holding this checkout's `scripts/` and `.claude/settings.json` on `main`, then
 * one commit on a branch with `mutate` applied. `loosenedBy` is asked for `main...HEAD`, which
 * is the same shape as the `origin/main...HEAD` a pull request merges.
 */
function repoWith(mutate) {
  const dir = temp("aenima-loosening-test-");
  cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  cpSync(join(root, ".claude", "settings.json"), join(dir, ".claude", "settings.json"));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "T"], dir);
  git(["add", "-A"], dir);
  git(["commit", "-qm", "before"], dir);
  git(["checkout", "-qb", "work"], dir);
  mutate(dir);
  git(["add", "-A"], dir);
  git(["commit", "-qm", "after"], dir);
  return dir;
}

/** Rewrite one file of the repository under test. */
function edit(dir, path, change) {
  const file = join(dir, path);
  const before = readFileSync(file, "utf8");
  const after = change(before);
  expect(after, `${path} was not changed by the mutation`).not.toBe(before);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, after);
}

describe("the corpus", () => {
  // AC3, AC4 — the measurement is only as good as what it measures. If the guard stops
  // refusing a corpus entry in this checkout, that shows up here rather than at a merge.
  it("is refused entry by entry by this checkout's guard", () => {
    const answers = refusals(decide);
    for (const entry of GUARD_CORPUS) {
      expect(answers[entry.name], entry.name).toBe(true);
    }
  });

  it("has an entry for every rule letter the guard marks", () => {
    const letters = ruleLetters(readFileSync(join(root, "scripts/hooks/guard.mjs"), "utf8"));
    expect(letters).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(uncovered(letters)).toEqual([]);
  });

  it("reads a rule that nothing covers as a gap, naming the letter", () => {
    expect(uncovered(["a", "z"])).toEqual(["z"]);
    const gaps = coverageGaps(["a", "z"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].rule).toBe("guard rule (z) has no entry in the corpus");
    expect(gaps[0].ungate).toContain(DETECTOR);
  });

  it("names only the paths a migration lives at", () => {
    expect(PATH_CORPUS.every((path) => path.startsWith("drizzle/"))).toBe(true);
  });
});

describe("ruleLetters", () => {
  it("reads the letters off the rule comments and nowhere else", () => {
    const source = ["  // (a) one", "// (b) two", "const x = 1; // (c) not at the start"].join(
      "\n",
    );
    expect(ruleLetters(source)).toEqual(["a", "b"]);
  });
});

describe("guardLoosened", () => {
  // TC3 → AC3 and TC4 → AC4, as the pure rule.
  it("names an entry refused before and allowed after", () => {
    const found = guardLoosened({ "pnpm db:push": true }, { "pnpm db:push": false });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the guard no longer refuses pnpm db:push");
  });

  it("says nothing about an entry that is refused on both sides, or tightened", () => {
    expect(guardLoosened({ a: true }, { a: true })).toEqual([]);
    expect(guardLoosened({ a: false }, { a: true })).toEqual([]);
  });
});

describe("pathsLoosened", () => {
  it("names a path gated before and not after", () => {
    const found = pathsLoosened({ "drizzle/0015.sql": true }, { "drizzle/0015.sql": false });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("drizzle/0015.sql is no longer a gated path");
  });
});

describe("detectorLoosened", () => {
  // TC6 → AC6.
  it("gates a diff that edits the detector, whatever the measurement says", () => {
    const found = detectorLoosened(["src/a.ts", DETECTOR]);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toContain(DETECTOR);
  });

  it("says nothing about a diff that leaves the detector alone", () => {
    expect(detectorLoosened(["src/a.ts", "scripts/run/gated.mjs"])).toEqual([]);
  });
});

describe("hooksOf and hooksLoosened", () => {
  const settings = (hooks) => JSON.stringify({ hooks });
  const one = (event, matcher, command) =>
    settings({ [event]: [{ matcher, hooks: [{ type: "command", command }] }] });

  it("keys a hook by its event and matcher, and carries its command", () => {
    expect([...hooksOf(one("PreToolUse", "Bash", "node guard.mjs"))]).toEqual([
      ["PreToolUse Bash", "node guard.mjs"],
    ]);
    expect(hooksOf("{")).toBeNull();
  });

  it("names a hook that is gone", () => {
    const found = hooksLoosened(one("Stop", "*", "node gate.mjs"), settings({}));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the Stop * hook is gone from .claude/settings.json");
  });

  it("names a hook whose command is no longer main's", () => {
    const found = hooksLoosened(
      one("PreToolUse", "Bash", "node guard.mjs"),
      one("PreToolUse", "Bash", "true"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the PreToolUse Bash hook's command is no longer main's");
  });

  it("says nothing about a hook added, and refuses a side it cannot read", () => {
    const before = one("Stop", "*", "node gate.mjs");
    const after = JSON.stringify({
      hooks: {
        Stop: [{ matcher: "*", hooks: [{ type: "command", command: "node gate.mjs" }] }],
        SessionEnd: [{ matcher: "*", hooks: [{ type: "command", command: "node runs.mjs" }] }],
      },
    });
    expect(hooksLoosened(before, after)).toEqual([]);
    expect(hooksLoosened(before, "{")).toHaveLength(1);
    expect(hooksLoosened("{", after)).toHaveLength(1);
  });
});

describe("gateLoosened", () => {
  it("names a step the gate stopped running", () => {
    const found = gateLoosened(
      { steps: ["lint", "typecheck", "test"], maxRed: 3 },
      { steps: ["lint", "typecheck"], maxRed: 3 },
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the Stop gate no longer runs test");
  });

  it("names a release count raised, and lets one lowered through", () => {
    expect(gateLoosened({ steps: [], maxRed: 3 }, { steps: [], maxRed: 5 })[0].rule).toBe(
      "the gate now steps aside after 5 reds rather than 3",
    );
    expect(gateLoosened({ steps: [], maxRed: 3 }, { steps: [], maxRed: 2 })).toEqual([]);
  });
});

describe("testsLoosened", () => {
  it("names a deleted test whose criteria nothing added carries", () => {
    const found = testsLoosened([{ path: "a.test.mjs", text: "// AC1 and AC2" }], []);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("a.test.mjs is deleted and nothing added names AC1, AC2");
  });

  it("lets a deleted test through when an added file names the same criteria", () => {
    expect(
      testsLoosened(
        [{ path: "a.test.mjs", text: "// AC1" }],
        [{ path: "b.test.mjs", text: "// AC1 again, better" }],
      ),
    ).toEqual([]);
  });

  it("gates a deleted test that names no criterion — nothing can be read as its replacement", () => {
    const found = testsLoosened([{ path: "a.test.mjs", text: "it works" }], []);
    expect(found[0].rule).toBe("a.test.mjs is deleted and names no criterion");
  });

  it("says nothing about a deleted file that is not a test", () => {
    expect(testsLoosened([{ path: "src/a.ts", text: "// AC1" }], [])).toEqual([]);
  });
});

describe("loosenings", () => {
  it("is empty for a diff that changes nothing about the restraints", () => {
    // TC1 → AC1 and TC2 → AC2, as the pure rule: a spec diff and a routine harness diff.
    expect(
      loosenings({
        files: ["docs/product-spec.md", "scripts/run/health.mjs", "scripts/run/health.test.mjs"],
        guard: { before: { a: true }, after: { a: true } },
        paths: { before: { p: true }, after: { p: true } },
        letters: ["a"],
        settings: { before: '{"hooks":{}}', after: '{"hooks":{}}' },
        gate: { before: { steps: ["test"], maxRed: 3 }, after: { steps: ["test"], maxRed: 3 } },
        tests: { deleted: [], added: [] },
      }),
    ).toEqual([]);
  });

  it("puts the detector first, so the reason a diff cannot mark its own homework leads", () => {
    const found = loosenings({
      files: [DETECTOR],
      guard: { before: { a: true }, after: { a: false } },
      settings: { before: '{"hooks":{}}', after: '{"hooks":{}}' },
    });
    expect(found[0].rule).toContain(DETECTOR);
    expect(found).toHaveLength(2);
  });
});

describe("loosenedBy over a repository", () => {
  it("reads a diff that weakens nothing as ok", { timeout: 60_000 }, () => {
    // TC2 → AC2: a routine harness change — a new file that refuses nothing new and takes
    // nothing away — self-merges.
    const dir = repoWith((at) => writeFileSync(join(at, "scripts/run/notes.md"), "a new file\n"));
    expect(loosenedBy({ cwd: dir, range: "main...HEAD" })).toEqual({ ok: true, reasons: [] });
  });

  it("gates a diff that deletes a guard rule, and names it", { timeout: 60_000 }, () => {
    // TC3 → AC3: rule (a) removed outright. Both of its corpus commands go from refused to
    // allowed, and the reasons name them.
    const dir = repoWith((at) =>
      edit(at, "scripts/hooks/guard.mjs", (text) =>
        text.replace(
          /\n    \/\/ \(a\) push rewrites[\s\S]*?CLAUDE\.md › Prohibitions\.";\n    }\n/,
          "\n",
        ),
      ),
    );
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons.map((r) => r.rule)).toEqual([
      "the guard no longer refuses pnpm db:push",
      "the guard no longer refuses drizzle-kit push",
    ]);
    expect(found.reasons[0].ungate).toContain("restore the rule");
  });

  it("gates a diff that narrows a matcher, and names it", { timeout: 60_000 }, () => {
    // TC4 → AC4: rule (c) still stands, but its matcher no longer reaches `--prod`, so one
    // corpus command that was refused is allowed. Nothing else in the corpus moves.
    const dir = repoWith((at) =>
      edit(at, "scripts/hooks/guard.mjs", (text) =>
        text.replace(
          'vercel.some((a) => a.startsWith("--prod") || a === "deploy")',
          'vercel.some((a) => a === "deploy")',
        ),
      ),
    );
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons.map((r) => r.rule)).toEqual(["the guard no longer refuses vercel --prod"]);
  });

  it("gates a diff that edits the detector", { timeout: 60_000 }, () => {
    // TC6 → AC6, end to end: the file that does the measuring is in the diff.
    const dir = repoWith((at) =>
      edit(at, DETECTOR, (text) => `${text}\n// a comment the detector did not have\n`),
    );
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons[0].rule).toContain(DETECTOR);
  });

  it("gates a diff whose before side cannot be read", { timeout: 60_000 }, () => {
    const dir = temp("aenima-loosening-empty-");
    git(["init", "-q", "-b", "main"], dir);
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons[0].rule).toContain("could not be read");
  });
});
