import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkReport, reviewerSection, tableRows, testsWrittenSection } from "./report-check.mjs";

const good = `# T0.9 — report

## ACs implemented

| AC | Test |
|---|---|
| AC1 | TC1 |

## Tests written, each observed red first

\`scripts/hooks/guard.test.mjs\` — 43 tests.

| test | reddened by | red → green |
|---|---|---|
| "allows a heredoc that mentions db:migrate" | heredoc bodies no longer consumed | 2 failed / 41 passed → 43 passed |
| "refuses gh pr merge while the run marker exists" | rule (f) ignores the marker | 1 failed / 42 passed → 43 passed |

## Reviewer passes and findings

| pass | commit | model | resumed | verdict |
|---|---|---|---|---|
| 1 | \`a1b2c3d\` | Opus | no | FINDINGS |
| 2 | \`d4e5f6a\` | \`fable\` | yes | **PASS** |

1. Must — rule (f) ignored the marker. Fixed.
`;

describe("report-check", () => {
  it("finds the Tests written section and stops at the next heading", () => {
    const section = testsWrittenSection(good);
    expect(section).toContain("reddened by");
    expect(section).not.toContain("Reviewer passes");
    expect(testsWrittenSection("# report\n\n## ACs implemented\n")).toBeNull();
  });

  it("reads the table, header then rows, skipping the rule line", () => {
    const table = tableRows(testsWrittenSection(good));
    expect(table.header).toEqual(["test", "reddened by", "red → green"]);
    expect(table.body).toHaveLength(2);
    expect(table.body[1][1]).toBe("rule (f) ignores the marker");
  });

  it("accepts a report whose every test carries its mutation and its count", () => {
    expect(checkReport(good, { testFiles: ["scripts/hooks/guard.test.mjs"] })).toEqual({
      ok: true,
      problems: [],
      rows: 2,
    });
  });

  it("refuses a report with no red-first section at all — T0.8's", () => {
    const report =
      "# T0.8 — report\n\n## ACs implemented\n\n| AC | Test |\n|---|---|\n| AC1 | TC1 |\n";
    expect(checkReport(report)).toMatchObject({
      ok: false,
      problems: ["no `## Tests written…` section"],
    });
  });

  it("refuses a row with an empty mutation or count cell", () => {
    const report = good.replace("| rule (f) ignores the marker |", "| |");
    const result = checkReport(report);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      'row 2 ("refuses gh pr merge while the run marker exists") has an empty cell',
    ]);
  });

  it("refuses a section with no table, or a table missing the two columns", () => {
    const prose = good.replace(
      /\| test \| reddened by[\s\S]*43 passed \|\n/,
      "all seen red first.\n",
    );
    expect(checkReport(prose).problems).toEqual(["no table under Tests written"]);

    const wrongColumns = good.replace(
      "| test | reddened by | red → green |",
      "| test | note | result |",
    );
    expect(checkReport(wrongColumns).problems).toEqual([
      "no `reddened by` column",
      "no `red → green` column",
    ]);
  });

  it("refuses when a test file in the diff is not in the record", () => {
    const result = checkReport(good, {
      testFiles: ["scripts/hooks/guard.test.mjs", "scripts/run/stale.test.mjs"],
    });
    expect(result.problems).toEqual([
      "scripts/run/stale.test.mjs is in the diff and not in the record",
    ]);
  });

  // T0.22 TC2 → AC2
  describe("the model of every reviewer pass", () => {
    const chain = ["fable", "opus"];

    it("finds the Reviewer passes section and accepts a pass on every model of the chain", () => {
      expect(reviewerSection(good)).toContain("| pass | commit | model | resumed | verdict |");
      expect(reviewerSection("# report\n\n## Tests written\n")).toBeNull();
      expect(checkReport(good, { chain })).toEqual({ ok: true, problems: [], rows: 2 });
    });

    it("refuses a report with no Reviewer passes section, no table there, or no model column", () => {
      const cut = good.slice(0, good.indexOf("## Reviewer passes"));
      expect(checkReport(cut, { chain }).problems).toEqual(["no `## Reviewer passes…` section"]);

      const prose = good.replace(
        /\| pass \| commit[\s\S]*\| \*\*PASS\*\* \|\n/,
        "Two passes, on Opus.\n",
      );
      expect(checkReport(prose, { chain }).problems).toEqual(["no table under Reviewer passes"]);

      const noModel = good.replace(
        "| pass | commit | model | resumed | verdict |",
        "| pass | commit | note | resumed | verdict |",
      );
      expect(checkReport(noModel, { chain }).problems).toEqual([
        "no `model` column under Reviewer passes",
      ]);
    });

    it("refuses a pass that names no model", () => {
      const report = good.replace("| 1 | `a1b2c3d` | Opus |", "| 1 | `a1b2c3d` |  |");
      expect(checkReport(report).problems).toEqual(["reviewer pass 1 names no model"]);
    });

    it("refuses a pass on a model outside the configured chain — never one the run picked", () => {
      const report = good.replace("| `fable` |", "| Sonnet |");
      expect(checkReport(report, { chain }).problems).toEqual([
        "reviewer pass 2 ran on Sonnet, which is not in the configured chain — fable, opus",
      ]);
      expect(checkReport(report).ok).toBe(true);
    });

    it("is the table the skill's step 8 tells a run to write", () => {
      const skill = readFileSync(
        join(import.meta.dirname, "..", "..", ".claude/skills/ticket/SKILL.md"),
        "utf8",
      );
      const step8 = skill.match(/^## 8 Report\n[\s\S]*?(?=^## 9 )/m)?.[0] ?? "";
      expect(step8).toContain("columns `pass · commit · model · resumed · verdict`");
      expect(step8).toContain("the model it ran on");
    });
  });

  // T0.23 TC1 → AC1 — a pass resumed at its turn limit is marked so, and a partial review is never
  // reported as a verdict.
  describe("a pass resumed at its turn limit", () => {
    it("refuses a reviewer table with no resumed column", () => {
      const report = good
        .replace(
          "| pass | commit | model | resumed | verdict |",
          "| pass | commit | model | verdict |",
        )
        .replace("|---|---|---|---|---|", "|---|---|---|---|")
        .replace("| Opus | no |", "| Opus |")
        .replace("| `fable` | yes |", "| `fable` |");
      expect(checkReport(report).problems).toEqual(["no `resumed` column under Reviewer passes"]);
    });

    it("refuses a pass that says neither yes nor no under resumed", () => {
      const report = good.replace("| `fable` | yes |", "| `fable` | once |");
      expect(checkReport(report).problems).toEqual([
        "reviewer pass 2 says once under resumed, not yes or no",
      ]);
      const empty = good.replace("| Opus | no |", "| Opus |  |");
      expect(checkReport(empty).problems).toEqual([
        "reviewer pass 1 says nothing under resumed, not yes or no",
      ]);
    });

    it("refuses a pass whose verdict is not PASS or FINDINGS — a partial review is never one", () => {
      const report = good.replace("| yes | **PASS** |", "| yes | stopped at its turn limit |");
      expect(checkReport(report).problems).toEqual([
        "reviewer pass 2 carries stopped at its turn limit where a verdict stands — PASS or FINDINGS",
      ]);
      const noVerdict = good.replace("| resumed | verdict |", "| resumed | outcome |");
      expect(checkReport(noVerdict).problems).toEqual([
        "no `verdict` column under Reviewer passes",
      ]);
    });
  });
});

// T0.25 TC1 → AC1. T1.4's addendum round: local `main` at `c310b30`, `origin/main` at `ed0c5b8`,
// and the check refused a correct report over ten test files that were T0.24's and T3.1's. A real
// repository, because the defect is which ref git is asked about, not how the answer is read.
describe("report-check with no base, in a worktree whose local main is behind origin/main", () => {
  let dir;

  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (name, text = "export {};\n") => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
    git("add", name);
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", name);
    return git("rev-parse", "HEAD");
  };
  const repo = join(import.meta.dirname, "..", "..");

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-report-"));
    git("init", "--quiet", "--initial-branch=main");
    // The chain the check reads is the checkout's own, so the fixture carries the real one.
    for (const file of [".claude/agents/reviewer.md", ".claude/settings.json"]) {
      commit(file, readFileSync(join(repo, file), "utf8"));
    }
    const stale = git("rev-parse", "HEAD");
    // Another ticket's test, merged since the primary checkout last moved `main`.
    git("update-ref", "refs/remotes/origin/main", commit("other.test.mjs"));
    git("checkout", "--quiet", "-b", "t9-9");
    commit("mine.test.mjs");
    git("branch", "--force", "main", stale);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts a report that records the branch's own tests and nobody else's", () => {
    writeFileSync(
      join(dir, "report.md"),
      good
        .replace("`scripts/hooks/guard.test.mjs` — 43 tests.", "`mine.test.mjs` — 43 tests.")
        .replace("| Opus |", "| opus |"),
    );
    const cli = spawnSync("node", [join(import.meta.dirname, "report-check.mjs"), "report.md"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(JSON.parse(cli.stdout)).toEqual({ ok: true, problems: [], rows: 2 });
    expect(cli.status).toBe(0);
  });
});
