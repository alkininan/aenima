import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claims, classify, codeSpans, gitLook, ownSections } from "./claims.mjs";

/**
 * T0.34 — TC1 → AC1. A fixture ticket carrying one of each case the classifier has to tell
 * apart: a path that is there and one that is not, an identifier that is there and one that
 * is not, and a command that must never be looked up at all.
 */
const FIXTURE = [
  "# T9.9 — A fixture",
  "",
  "## Build",
  "",
  "1. Edit `docs/guidelines.md`, which is on main, and write `docs/no-such-file.md`, which is not.",
  "2. `runScorer` already exists; `zzzAbsentIdentifier` does not.",
  "3. Run `pnpm test` when you are done.",
  "",
  "## Cited",
  "",
  "### guidelines §5",
  "",
  "Quoting `docs/only-in-the-quoted-section.md`, which is the spec's claim and not the ticket's.",
].join("\n");

/** On main: the two names the fixture says are there, and nothing else. */
const look = {
  tops: ["docs", "scripts", "src"],
  file: (name) => name === "docs/guidelines.md",
  identifier: (name) => name === "runScorer",
};

describe("ownSections", () => {
  it("stops at the Cited section, because quoted spec text is not the ticket's claim", () => {
    const own = ownSections(FIXTURE);
    expect(own).toContain("docs/guidelines.md");
    expect(own).not.toContain("docs/only-in-the-quoted-section.md");
  });

  it("keeps the whole file when there is no Cited section", () => {
    expect(ownSections("## Build\n\n`docs/a.md`")).toContain("docs/a.md");
  });
});

describe("codeSpans", () => {
  it("reads inline spans", () => {
    expect(codeSpans("a `one` b `two` c")).toEqual(["one", "two"]);
  });

  it("skips a fenced block, which is an example rather than a claim", () => {
    const text = [
      "`kept`",
      "",
      "```bash",
      "node scripts/run/never-existed.mjs",
      "```",
      "",
      "`also`",
    ].join("\n");
    expect(codeSpans(text)).toEqual(["kept", "also"]);
  });

  it("reads a doubled-backtick span, which is how a span holding a backtick is written", () => {
    expect(codeSpans("a ``a ` b`` c")).toEqual(["a ` b"]);
  });
});

describe("classify", () => {
  it("reads a token with a top-level segment on main as a path", () => {
    expect(classify("src/packs", look)).toMatchObject({ kind: "path" });
  });

  it("reads a token with a file extension as a path", () => {
    expect(classify("CLAUDE.md", look)).toMatchObject({ kind: "path" });
    expect(classify("drizzle/0001_policies.sql", look)).toMatchObject({ kind: "path" });
  });

  it("reads a trailing slash as a directory, which is still a path", () => {
    expect(classify("docs/log/", look)).toMatchObject({ kind: "path" });
  });

  it("does not read a git ref as a path — `origin` is no directory of this repo", () => {
    expect(classify("origin/main", look)).toMatchObject({ kind: "skip" });
  });

  it("reads a bare name as an identifier", () => {
    expect(classify("runScorer", look)).toMatchObject({ kind: "identifier" });
    expect(classify("next_scoring_attempt_at", look)).toMatchObject({ kind: "identifier" });
    expect(classify("db:migrate", look)).toMatchObject({ kind: "identifier" });
  });

  it("skips a command, a flag, a placeholder, a fragment and a bare number", () => {
    for (const token of [
      "pnpm test",
      "--force",
      "docs/tickets/<id>.md",
      "z.toJSONSchema()",
      "src/db/queries/*",
      "0.3",
      "§5",
      "https://aeni.ma",
    ]) {
      expect(classify(token, look), token).toMatchObject({ kind: "skip" });
    }
  });
});

describe("claims", () => {
  const found = claims(FIXTURE, look);
  const names = (list) => list.map((entry) => entry.name);

  it("reports the absent path and the absent identifier", () => {
    expect(names(found.absent).sort()).toEqual(["docs/no-such-file.md", "zzzAbsentIdentifier"]);
  });

  it("reports nothing main has", () => {
    expect(names(found.absent)).not.toContain("docs/guidelines.md");
    expect(names(found.absent)).not.toContain("runScorer");
    expect(names(found.present).sort()).toEqual(["docs/guidelines.md", "runScorer"]);
  });

  it("never looks a command up, so it is neither absent nor present", () => {
    expect(names(found.skipped)).toContain("pnpm test");
    expect(names(found.absent)).not.toContain("pnpm test");
    expect(names(found.present)).not.toContain("pnpm test");
  });

  it("says of each absent name whether it is a path or an identifier", () => {
    const byName = Object.fromEntries(found.absent.map((entry) => [entry.name, entry.kind]));
    expect(byName["docs/no-such-file.md"]).toBe("path");
    expect(byName["zzzAbsentIdentifier"]).toBe("identifier");
  });

  it("reports one entry per name however often the ticket repeats it", () => {
    const twice = "## Build\n\n`docs/no-such-file.md` and `docs/no-such-file.md` again.";
    expect(claims(twice, look).absent).toHaveLength(1);
  });
});

/**
 * TC1 → AC1, the other half: the two git commands themselves, against a real reference.
 * The logic above runs on an injected lookup, so nothing in it can tell a `cat-file` that
 * answers wrongly from one that answers at all — a fixture that skips the wiring cannot test
 * the wiring.
 */
describe("gitLook", () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-claims-"));
    const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "--initial-branch=main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "guidelines.md"), "The scorer's pin lives in runScorer.\n");
    git("add", "-A");
    git("commit", "-m", "one");
    // On the working tree but not on the reference: a checkout ahead is not evidence.
    writeFileSync(join(dir, "docs", "later.md"), "later\n");
    writeFileSync(join(dir, "docs", "guidelines.md"), "runScorer and zzzOnlyInTheWorkingTree.\n");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the reference's top level, which is what tells a path from a git ref", () => {
    expect(gitLook({ ref: "main", cwd: dir }).tops).toEqual(["docs"]);
  });

  it("finds a file the reference has and not one it lacks", () => {
    const look = gitLook({ ref: "main", cwd: dir });
    expect(look.file("docs/guidelines.md")).toBe(true);
    expect(look.file("docs/no-such-file.md")).toBe(false);
  });

  it("finds a directory, trailing slash and all", () => {
    expect(gitLook({ ref: "main", cwd: dir }).file("docs/")).toBe(true);
  });

  it("finds an identifier the reference has and not one it lacks", () => {
    const look = gitLook({ ref: "main", cwd: dir });
    expect(look.identifier("runScorer")).toBe(true);
    expect(look.identifier("zzzAbsentIdentifier")).toBe(false);
  });

  it("reads the reference and not the working tree, which can be ahead of it", () => {
    const look = gitLook({ ref: "main", cwd: dir });
    expect(look.file("docs/later.md")).toBe(false);
    expect(look.identifier("zzzOnlyInTheWorkingTree")).toBe(false);
  });
});

/**
 * TC2–TC7 → AC2–AC7. The documents that say when the script runs and where a rule goes.
 * A grep per claim, on a clause rather than a keyword: a `toContain("claims.mjs")` would
 * stay green on a step 2 that only mentioned the script in passing.
 */
describe("the protocol says when the names are checked and where a rule goes", () => {
  const root = join(import.meta.dirname, "..", "..");
  const doc = (name) => readFileSync(join(root, name), "utf8");
  const section = (text, open, close) =>
    text.slice(text.indexOf(open), close ? text.indexOf(close) : undefined);

  // TC2 → AC2
  it("guidelines §5 step 2 runs claims.mjs and says what an absent name is", () => {
    const step = section(doc("docs/guidelines.md"), "2  Inline", "3  Branch");
    expect(step).toContain("claims.mjs");
    expect(step).toContain("either something the\n                ticket creates or drift");
    expect(step).toContain("drift goes by §4");
  });

  // TC3 → AC3
  it("guidelines §5 step 8 files an area rule as a line, and sends the rest to open questions", () => {
    const step = section(doc("docs/guidelines.md"), "8  Report", "9  Close");
    expect(step).toContain(".claude/rules/<area>.md, ending in docs/log/<id>.md");
    expect(step).toContain("is not written into\n                CLAUDE.md by a run");
    expect(step).toContain("report's open questions");
  });

  // TC4 → AC4
  it("guidelines §6 says a ticket's Rules section carries only what is not already standing", () => {
    const six = section(doc("docs/guidelines.md"), "## 6. Cutting tickets", "## 7. Names");
    expect(six).toContain("is not already standing");
    expect(six).toContain("loads by path out of `.claude/rules/`");
  });

  // TC5 → AC5
  it("the /ticket skill's steps 2 and 8 say what the guidelines say", () => {
    const skill = doc(".claude/skills/ticket/SKILL.md");
    const two = section(skill, "## 2 Inline", "## 3 Branch");
    expect(two).toContain("node scripts/run/claims.mjs docs/tickets/<id>.md");
    expect(two).toContain("The script finds the names; what a\nmissing one means is yours.");
    const eight = section(skill, "## 8 Report", "## 9 Close");
    expect(eight).toContain(".claude/rules/<area>.md");
    expect(eight).toContain("is not written into `CLAUDE.md` by a run");
  });

  // TC6 → AC6
  it("build guide §2 names the area file for a rule about one area of the code", () => {
    const two = section(
      doc("docs/build-guide.md"),
      "## 2. How to run a ticket",
      "## 3. Rules that",
    );
    expect(two).toContain("`.claude/rules/<area>.md`");
    expect(two).toContain("one area of the code");
  });

  // TC7 → AC7
  it("the guidelines header carries one new version line naming §5 and §6", () => {
    const header = doc("docs/guidelines.md").split("-->")[0];
    const newest = header.split(/^\s{5}v\d/m)[0];
    expect(newest).toContain("(T0.34)");
    expect(newest).toContain("§5 step 2");
    expect(newest).toContain("step 8");
    expect(newest).toContain("§6");
  });
});
