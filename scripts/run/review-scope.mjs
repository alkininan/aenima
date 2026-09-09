#!/usr/bin/env node
/**
 * Step 5 — what the reviewer runs.
 *
 * The reviewer used to run the whole suite while the Stop gate ran it too, and two parallel
 * suites on one machine reddened `SignInForm.dom.test.tsx` twice for a ticket that never
 * touched it (docs/reports/T0.98.md). The gate owns the full suite. The reviewer runs the
 * tests that speak to this ticket: the files its Tests section names, and every test file
 * the diff touches. That is a list to compute, not to judge.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";

/** A path that vitest would collect. */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Something that looks like a repo-relative path to a test file. */
const PATH_LIKE = /[A-Za-z0-9_@./-]+\.(?:test|spec)\.[cm]?[jt]sx?/g;

/** The `## Tests` section of a ticket file, up to the next `## ` heading. */
export function testsSection(text) {
  const match = String(text ?? "").match(/^## Tests\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return match ? match[1] : "";
}

/** Test files the ticket's Tests section names, in order of first mention. */
export function namedTests(text) {
  return [...new Set(testsSection(text).match(PATH_LIKE) ?? [])];
}

/** Test files the diff against `base` adds or changes. */
export function touchedTests(run, base = "main") {
  const diff = run(["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`]);
  if (diff.status !== 0) return [];
  return diff.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && TEST_FILE.test(line));
}

/**
 * The reviewer's list: named ∪ touched, existing files only. `missing` names what the
 * ticket cites and the checkout does not hold — a claim the reviewer should read as one.
 */
export function reviewScope({ ticketText, run, base = "main", exists = existsSync }) {
  const named = namedTests(ticketText);
  const touched = touchedTests(run, base);
  const all = [...new Set([...named, ...touched])];
  return {
    files: all.filter((file) => exists(file)).sort(),
    named,
    touched,
    missing: named.filter((file) => !exists(file)),
  };
}

/** CLI: `node review-scope.mjs docs/tickets/<id>.md [base]`, run from the checkout. */
function main() {
  const [ticket, base] = process.argv.slice(2);
  if (!ticket) {
    process.stderr.write("usage: review-scope.mjs <ticket file> [base ref]\n");
    process.exit(1);
  }
  const ticketText = readFileSync(ticket, "utf8");
  const run = (args) => spawnSync("git", args, { encoding: "utf8" });
  emit(reviewScope({ ticketText, run, base: base ?? "main" }));
}

if (isMain(import.meta.url)) main();
