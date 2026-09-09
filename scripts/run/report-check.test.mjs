import { describe, expect, it } from "vitest";

import { checkReport, tableRows, testsWrittenSection } from "./report-check.mjs";

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

None.
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
});
