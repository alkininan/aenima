import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { decide as gate, MAX_RED, STEPS } from "../hooks/gate.mjs";
import { decide } from "../hooks/guard.mjs";
import { reviewed } from "./permission.mjs";
import {
  coverageGaps,
  detectorLoosened,
  DETECTOR,
  DOOR_CORPUS,
  doorRefusals,
  doorsLoosened,
  gateLoosened,
  GUARD_CORPUS,
  guardLoosened,
  hookName,
  hooksLoosened,
  hooksOf,
  loosenedBy,
  loosenings,
  PATH_CORPUS,
  pathsLoosened,
  refusals,
  ruleLetters,
  scriptsOf,
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
  // The gate's commands live here, so both sides of the comparison need one.
  cpSync(join(root, "package.json"), join(dir, "package.json"));
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

/** The probe's gate wrapper, as this checkout's own gate would be measured. */
const gateDecide = ({ red = 0, state = null } = {}) => {
  const step = STEPS.at(red);
  return gate({
    input: { session_id: "s" },
    state,
    fingerprint: "a tree the gate has not seen",
    runStep: (each) => (each === step ? { ok: false, output: "boom" } : { ok: true, output: "" }),
  });
};

describe("the corpus", () => {
  // AC3, AC4 — the measurement is only as good as what it measures. If the guard stops
  // refusing a corpus entry in this checkout, that shows up here rather than at a merge.
  it("is refused entry by entry by this checkout's guard", () => {
    const answers = refusals(decide);
    for (const entry of GUARD_CORPUS) {
      expect(answers[entry.name], entry.name).toBe(true);
    }
  });

  // TC3 → AC3: a rule with no corpus entry could be deleted unseen.
  it("has an entry for every rule letter the guard marks", () => {
    const letters = ruleLetters(readFileSync(join(root, "scripts/hooks/guard.mjs"), "utf8"));
    expect(letters).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(uncovered(letters)).toEqual([]);
  });

  // TC3 → AC3
  it("reads a rule that nothing covers as a gap, naming the letter", () => {
    expect(uncovered(["a", "z"])).toEqual(["z"]);
    const gaps = coverageGaps(["a", "z"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].rule).toBe("guard rule (z) has no entry in the corpus");
    expect(gaps[0].ungate).toContain(DETECTOR);
  });

  // TC5 → AC5: the path corpus is migrations, because nothing else is gated by name now.
  it("names only the paths a migration lives at", () => {
    expect(PATH_CORPUS.every((path) => path.startsWith("drizzle/"))).toBe(true);
  });

  // Review pass 2, Must 2. The guard's rule table only reacts to these two; they are what a
  // merge and a close actually rest on, so they are measured in their own right.
  it("is refused entry by entry by this checkout's two doors", () => {
    const answers = doorRefusals({ reviewed, gateDecide });
    for (const entry of DOOR_CORPUS) {
      expect(answers[entry.name], entry.name).toBe(true);
    }
    expect(DOOR_CORPUS.map((entry) => entry.door)).toContain("reviewed");
    expect(DOOR_CORPUS.map((entry) => entry.door)).toContain("gate");
  });

  it("reaches the gate's last step and its release count, whatever they are named", () => {
    expect(STEPS.length).toBeGreaterThan(1);
    expect(MAX_RED).toBeGreaterThan(1);
    // The release is not a restraint: past MAX_RED the gate is meant to step aside.
    expect(
      gateDecide({ red: 0, state: { session_id: "s", count: MAX_RED, greenHash: null } }).exit,
    ).toBe(0);
  });
});

// Review pass 2, Must 2.
describe("doorsLoosened", () => {
  const name = DOOR_CORPUS[0].name;

  it("names a door that stopped refusing, by the door it is", () => {
    const found = doorsLoosened({ [name]: true }, { [name]: false });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe(`the guard's second door no longer refuses ${name}`);
  });

  it("names the Stop gate as itself", () => {
    const stop = DOOR_CORPUS.find((entry) => entry.door === "gate").name;
    expect(doorsLoosened({ [stop]: true }, { [stop]: false })[0].rule).toBe(
      `the Stop gate no longer refuses ${stop}`,
    );
  });

  it("says nothing about a door that is refused on both sides, or tightened", () => {
    expect(doorsLoosened({ [name]: true }, { [name]: true })).toEqual([]);
    expect(doorsLoosened({ [name]: false }, { [name]: true })).toEqual([]);
  });
});

describe("ruleLetters", () => {
  // TC3 → AC3: the letters are how the corpus knows which rules exist.
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

// TC5 → AC5: a migration taken off the list is a loosening like any other.
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

// Build 2's hook bullet: a guard nothing invokes refuses nothing, so every hook of main's
// `.claude/settings.json` has to still be there carrying main's command.
describe("hooksOf and hooksLoosened", () => {
  const settings = (hooks) => JSON.stringify({ hooks });
  const group = (event, matcher, ...commands) =>
    settings({
      [event]: [{ matcher, hooks: commands.map((command) => ({ type: "command", command })) }],
    });

  it("keys a group by its event and matcher and keeps every command in it", () => {
    // Review pass 1, Must 2: `SessionEnd *` holds two hooks, and keeping one a group would
    // let the other be deleted unseen.
    expect([...hooksOf(group("SessionEnd", "*", "node release.mjs", "node runs.mjs"))]).toEqual([
      ["SessionEnd *", ["node release.mjs", "node runs.mjs"]],
    ]);
    expect(hooksOf("{")).toBeNull();
  });

  it("names a hook deleted from a group that still has another", () => {
    // Review pass 1, Must 2.
    const found = hooksLoosened(
      group("SessionEnd", "*", "node scripts/run/release.mjs --hook", "node runs.mjs"),
      group("SessionEnd", "*", "node runs.mjs"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe(
      "the SessionEnd * hook that runs scripts/run/release.mjs no longer carries main's command",
    );
  });

  it("names a whole group that is gone, and one whose command was rewritten", () => {
    expect(hooksLoosened(group("Stop", "*", "node gate.mjs"), settings({}))[0].rule).toBe(
      "the Stop * hook that runs gate.mjs no longer carries main's command",
    );
    expect(
      hooksLoosened(
        group("PreToolUse", "Bash", "node guard.mjs"),
        group("PreToolUse", "Bash", "true"),
      )[0].rule,
    ).toBe("the PreToolUse Bash hook that runs guard.mjs no longer carries main's command");
  });

  it("names a hook by the last script its command runs, or by its opening words", () => {
    expect(hookName('d=$(mktemp -d) && node "$d/scripts/hooks/guard.mjs"')).toBe(
      "scripts/hooks/guard.mjs",
    );
    expect(hookName("true")).toBe("true");
  });

  it("says nothing about a hook added, and refuses a side it cannot read", () => {
    const before = group("Stop", "*", "node gate.mjs");
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

// Build 2's gate bullet. `STEPS` names the steps; package.json holds the commands they run.
describe("gateLoosened", () => {
  const pkg = (scripts) => JSON.stringify({ name: "aenima", scripts });
  const real = pkg({ lint: "eslint .", typecheck: "tsc --noEmit", test: "vitest run" });
  const side = (steps, maxRed, scripts = real) => ({ steps, maxRed, scripts });

  it("names a step the gate stopped running", () => {
    const found = gateLoosened(
      side(["lint", "typecheck", "test"], 3),
      side(["lint", "typecheck"], 3),
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the Stop gate no longer runs test");
  });

  it("names a release count raised, and lets one lowered through", () => {
    expect(gateLoosened(side([], 3), side([], 5))[0].rule).toBe(
      "the gate now steps aside after 5 reds rather than 3",
    );
    expect(gateLoosened(side([], 3), side([], 2))).toEqual([]);
  });

  it("names a gate command emptied in package.json, with STEPS left alone", () => {
    // Review pass 1, Must 1: `"test": "true"` leaves STEPS three long and the gate toothless.
    const steps = ["lint", "typecheck", "test"];
    const found = gateLoosened(
      side(steps, 3),
      side(steps, 3, pkg({ lint: "eslint .", typecheck: "tsc --noEmit", test: "true" })),
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("the gate's test command is no longer main's");
    expect(found[0].ungate).toContain("package.json's test script");
  });

  it("says nothing about a script the gate does not run, and refuses a side it cannot read", () => {
    const steps = ["lint", "typecheck", "test"];
    expect(
      gateLoosened(side(steps, 3), side(steps, 3, pkg({ ...scriptsOf(real), dev: "next" }))),
    ).toEqual([]);
    expect(gateLoosened(side(steps, 3), side(steps, 3, "{"))).toHaveLength(1);
    expect(gateLoosened(side(steps, 3, "{"), side(steps, 3))[0].rule).toContain(
      "could not be read",
    );
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
        gate: {
          before: { steps: ["test"], maxRed: 3, scripts: '{"scripts":{"test":"vitest run"}}' },
          after: { steps: ["test"], maxRed: 3, scripts: '{"scripts":{"test":"vitest run"}}' },
        },
        tests: { deleted: [], added: [] },
      }),
    ).toEqual([]);
  });

  it("puts the detector first, so the reason a diff cannot mark its own homework leads", () => {
    const gateSides = { steps: [], maxRed: 3, scripts: '{"scripts":{}}' };
    const found = loosenings({
      files: [DETECTOR],
      guard: { before: { a: true }, after: { a: false } },
      settings: { before: '{"hooks":{}}', after: '{"hooks":{}}' },
      gate: { before: gateSides, after: gateSides },
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

  it("gates a diff that renames the detector away", { timeout: 60_000 }, () => {
    // Review pass 2, Must 1: `git diff --name-only` prints a rename's destination alone, so
    // without `--no-renames` the detector could be replaced wholesale by a self-merging diff.
    const dir = repoWith((at) => {
      git(["mv", DETECTOR, "scripts/run/loosen.mjs"], at);
      git(["mv", "scripts/run/loosening.test.mjs", "scripts/run/loosen.test.mjs"], at);
      edit(at, "scripts/run/gated.mjs", (text) =>
        text.replace('from "./loosening.mjs"', 'from "./loosen.mjs"'),
      );
      edit(at, "scripts/run/loosen.mjs", (text) =>
        text.replace('"scripts/run/loosening.mjs"', '"scripts/run/loosen.mjs"'),
      );
    });
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons[0].rule).toContain(DETECTOR);
  });

  it("gates a diff that opens the guard's second door", { timeout: 60_000 }, () => {
    // Review pass 2, Must 2: the rule table only reacts to `reviewed()`, so a diff that made
    // it answer yes to everything would self-merge and every diff after it would too.
    const dir = repoWith((at) =>
      edit(at, "scripts/run/permission.mjs", (text) =>
        text.replace(
          "export function reviewed({ dir = process.cwd(), deps = {} } = {}) {",
          "export function reviewed({ dir = process.cwd(), deps = {} } = {}) {\n  if (true) return { ok: true, why: null, task: { name: 'T0.1', branch: 't0-1' }, gated: [] };",
        ),
      ),
    );
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons.map((r) => r.rule)).toEqual(
      DOOR_CORPUS.filter((entry) => entry.door === "reviewed").map(
        (entry) => `the guard's second door no longer refuses ${entry.name}`,
      ),
    );
  });

  it("gates a diff that empties one of the gate's commands", { timeout: 60_000 }, () => {
    // Review pass 1, Must 1 and review pass 2, Must 2, end to end: STEPS is untouched and the
    // gate is toothless, and the gate's own decision stops refusing a red step.
    const dir = repoWith((at) =>
      edit(at, "package.json", (text) => text.replace(/"test": "[^"]*"/, '"test": "true"')),
    );
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons.map((r) => r.rule)).toEqual([
      "the gate's test command is no longer main's",
    ]);
  });

  it("gates a diff whose before side cannot be read", { timeout: 60_000 }, () => {
    const dir = temp("aenima-loosening-empty-");
    git(["init", "-q", "-b", "main"], dir);
    const found = loosenedBy({ cwd: dir, range: "main...HEAD" });
    expect(found.ok).toBe(false);
    expect(found.reasons[0].rule).toContain("could not be read");
  });
});
