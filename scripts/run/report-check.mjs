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
 *
 * Since T0.22 the section headed `## Reviewer passes…` holds a table too, one row a pass, and
 * every row names the model that pass ran on — a model of the configured chain when the chain
 * is given, which the command reads from the repo. A reader sees which mind passed which code,
 * and a pass on a model the run picked for itself cannot be reported as though it were not.
 *
 * Since T0.23 every row also says under `resumed`, `yes` or `no`, whether the pass stopped at its
 * turn limit and was continued, and under `verdict` carries PASS or FINDINGS and nothing else: a
 * pass that reached no verdict is not a row, because a partial review is never reported as one.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";
import { readChain } from "./review-model.mjs";
import { BASE, touchedTests } from "./review-scope.mjs";

/** The section of a report whose `## ` heading starts with `title`, up to the next heading. */
function sectionOf(text, title) {
  const match = String(text ?? "").match(
    new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"),
  );
  return match ? match[1] : null;
}

/** The `## Tests written…` section of a report, up to the next `## ` heading. */
export function testsWrittenSection(text) {
  return sectionOf(text, "Tests written");
}

/** The `## Reviewer passes…` section of a report, up to the next `## ` heading. */
export function reviewerSection(text) {
  return sectionOf(text, "Reviewer passes");
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

/** A table cell as it reads, code and bold markers aside. */
const bare = (cell) =>
  String(cell ?? "")
    .replace(/[`*]/g, "")
    .trim();

/**
 * The problems with a report's reviewer passes: no section, no table, no `model`, `resumed` or
 * `verdict` column, or a pass whose model is empty or — when `chain` is given — outside it,
 * whose `resumed` is not `yes` or `no`, or whose verdict is not PASS or FINDINGS.
 */
export function reviewerProblems(text, chain = null) {
  const section = reviewerSection(text);
  if (section === null) return ["no `## Reviewer passes…` section"];
  const table = tableRows(section);
  if (table === null) return ["no table under Reviewer passes"];
  const head = table.header.map((cell) => cell.toLowerCase());
  const column = (name) => head.findIndex((cell) => cell.includes(name));
  const model = column("model");
  const resumed = column("resumed");
  const verdict = column("verdict");
  for (const [index, name] of [
    [model, "model"],
    [resumed, "resumed"],
    [verdict, "verdict"],
  ]) {
    if (index === -1) return [`no \`${name}\` column under Reviewer passes`];
  }
  if (table.body.length === 0) return ["the reviewer table has no rows"];

  const pass = column("pass");
  const allowed = chain?.map((name) => name.toLowerCase());
  const problems = [];
  table.body.forEach((row, i) => {
    const label = (pass === -1 ? "" : row[pass]) || String(i + 1);
    const cell = bare(row[model]);
    if (cell === "") {
      problems.push(`reviewer pass ${label} names no model`);
    } else if (allowed && !allowed.includes(cell.toLowerCase())) {
      problems.push(
        `reviewer pass ${label} ran on ${cell}, which is not in the configured chain — ${chain.join(", ")}`,
      );
    }
    const again = bare(row[resumed]);
    if (!["yes", "no"].includes(again.toLowerCase())) {
      problems.push(
        `reviewer pass ${label} says ${again || "nothing"} under resumed, not yes or no`,
      );
    }
    const said = bare(row[verdict]);
    if (!["PASS", "FINDINGS"].includes(said)) {
      problems.push(
        `reviewer pass ${label} carries ${said || "nothing"} where a verdict stands — PASS or FINDINGS`,
      );
    }
  });
  return problems;
}

/**
 * Check a report. `testFiles` are the test files the diff touches; each must be named in
 * the section. `chain` is the reviewer's configured models; without it a pass need only name
 * one. Returns `{ ok, problems, rows }`.
 */
export function checkReport(text, { testFiles = [], chain = null } = {}) {
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

  problems.push(...reviewerProblems(text, chain));

  return { ok: problems.length === 0, problems, rows: table?.body.length ?? 0 };
}

/**
 * CLI: `node report-check.mjs docs/reports/<id>.md [base]`, the base `origin/main` unless given
 * (review-scope.mjs's `BASE` says why). Exit 1 on a refused report.
 */
function main() {
  const [report, base] = process.argv.slice(2);
  if (!report) {
    process.stderr.write("usage: report-check.mjs <report file> [base ref]\n");
    process.exit(1);
  }
  const run = (args) => spawnSync("git", args, { encoding: "utf8" });
  const result = checkReport(readFileSync(report, "utf8"), {
    testFiles: touchedTests(run, base ?? BASE),
    chain: readChain(),
  });
  emit(result);
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
