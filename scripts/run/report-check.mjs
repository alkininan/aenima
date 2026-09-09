#!/usr/bin/env node
/**
 * Step 8 — the report is refused without its red-first record.
 *
 * A passing test is evidence about the test. The record that makes it evidence about the
 * code is the mutation that made it red and the count that went green afterwards, per test
 * — and T0.8's own report had none, because the session that built it was interrupted before
 * the record was written and nothing refused the report without it. This does.
 *
 * The report's section headed `## Tests written…` holds one table with a `reddened by`
 * column and a `red → green` column. Every row has all three cells filled, and every test
 * file the diff adds or changes is named somewhere in that section.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";
import { touchedTests } from "./review-scope.mjs";

/** The `## Tests written…` section of a report, up to the next `## ` heading. */
export function testsWrittenSection(text) {
  const match = String(text ?? "").match(/^## Tests written[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return match ? match[1] : null;
}

/** The rows of the first markdown table in `section`: header cells, then body rows. */
export function tableRows(section) {
  const lines = String(section ?? "")
    .split("\n")
    .filter((line) => /^\s*\|.*\|\s*$/.test(line));
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
  const rows = lines.map(cells).filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
  return rows.length === 0 ? null : { header: rows[0], body: rows.slice(1) };
}

/**
 * Check a report. `testFiles` are the test files the diff touches; each must be named in
 * the section. Returns `{ ok, problems, rows }`.
 */
export function checkReport(text, { testFiles = [] } = {}) {
  const problems = [];
  const section = testsWrittenSection(text);
  if (section === null) {
    return { ok: false, problems: ["no `## Tests written…` section"], rows: 0 };
  }

  const table = tableRows(section);
  if (table === null) {
    problems.push("no table under Tests written");
  } else {
    const head = table.header.map((cell) => cell.toLowerCase());
    const mutation = head.findIndex((cell) => cell.includes("reddened"));
    const count = head.findIndex((cell) => cell.includes("green"));
    if (mutation === -1) problems.push("no `reddened by` column");
    if (count === -1) problems.push("no `red → green` column");
    if (table.body.length === 0) problems.push("the table has no rows");
    table.body.forEach((row, i) => {
      const cellsNeeded = [0, mutation, count].filter((j) => j !== -1);
      if (cellsNeeded.some((j) => !row[j])) {
        problems.push(`row ${i + 1} (${row[0] || "unnamed"}) has an empty cell`);
      }
    });
  }

  for (const file of testFiles) {
    if (!section.includes(file)) problems.push(`${file} is in the diff and not in the record`);
  }

  return { ok: problems.length === 0, problems, rows: table?.body.length ?? 0 };
}

/** CLI: `node report-check.mjs docs/reports/<id>.md [base]`. Exit 1 on a refused report. */
function main() {
  const [report, base] = process.argv.slice(2);
  if (!report) {
    process.stderr.write("usage: report-check.mjs <report file> [base ref]\n");
    process.exit(1);
  }
  const run = (args) => spawnSync("git", args, { encoding: "utf8" });
  const result = checkReport(readFileSync(report, "utf8"), {
    testFiles: touchedTests(run, base ?? "main"),
  });
  emit(result);
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
