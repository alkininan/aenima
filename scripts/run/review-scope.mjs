#!/usr/bin/env node
/**
 * Step 5 — what the reviewer runs.
 *
 * The reviewer used to run the whole suite while the Stop gate ran it too, and two parallel
 * suites on one machine reddened `SignInForm.dom.test.tsx` twice for a ticket that never
 * touched it (docs/reports/T0.98.md). The gate owns the full suite. The reviewer runs the
 * tests that speak to this ticket: the files its Tests section and any Addendum section name,
 * and every test file the diff touches. That is a list to compute, not to judge.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";

/**
 * What the diff is taken against when no base is given: `origin/main`, never the literal `main`.
 * A scheduled run works in a worktree branched from `origin/main`, and nothing moves a worktree's
 * local `main` — the primary checkout owns it — so `main` is wherever that checkout was last
 * left. On T1.4's addendum round it was `c310b30` while `origin/main` was `ed0c5b8`, and ten test
 * files that were T0.24's and T3.1's read as the ticket's. Every other script in `scripts/run/`
 * compares against `origin/main`, and `loosening.mjs` says why: the guard runs main's copy.
 */
export const BASE = "origin/main";

/** A path that vitest would collect. */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * One directory of a repo-relative path: a plain name, or a Next.js dynamic segment whole —
 * `[key]`, `[...rest]`, `[[...slug]]`. A path read up to its first bracket names a file that is
 * not there: T1.4's `src/app/o/[key]/ItemLine.dom.test.tsx` came back `/ItemLine.dom.test.tsx`.
 */
const SEGMENT = String.raw`(?:\[{1,2}(?:\.\.\.)?[A-Za-z0-9_-]+\]{1,2}|[A-Za-z0-9_@.-]+)`;

/**
 * A repo-relative path to a test file: at least one directory, then the file. A ticket cites a
 * test by its path; prose points at a precedent by its file name — "as `item-key.db.test.ts`
 * holds `item.key`" — and a bare name is not a file the checkout can be asked for, so it is not
 * a citation. That is a convention, and it is what every ticket under `docs/tickets/` follows:
 * T1.4's two precedents are the only bare names any Tests section holds. What it cannot see is a
 * precedent written out as a full path, which is read as cited and run — a test too many, never
 * one missed.
 */
const PATH_LIKE = new RegExp(
  String.raw`(?:${SEGMENT}/)+[A-Za-z0-9_@.-]+\.(?:test|spec)\.[cm]?[jt]sx?`,
  "g",
);

/** The sections of a ticket file whose `## ` heading matches `title`, each up to the next one. */
function sectionsOf(text, title) {
  const pattern = new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "gm");
  return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]);
}

/** The `## Tests` section of a ticket file, up to the next `## ` heading. */
export function testsSection(text) {
  return sectionsOf(text, "Tests\\s*$")[0] ?? "";
}

/**
 * Every `## Addendum…` section of a ticket file, in order. An addendum round names the tests it
 * builds there — T2.9's TA2 ran `scripts/run/log-index.test.mjs` — and a scope read from `## Tests`
 * alone left the reviewer to run it by hand.
 */
export function addendumSections(text) {
  return sectionsOf(text, "Addendum\\b");
}

/** Test files the ticket's Tests and Addendum sections name, in order of first mention. */
export function namedTests(text) {
  const sections = [testsSection(text), ...addendumSections(text)];
  return [...new Set(sections.flatMap((section) => section.match(PATH_LIKE) ?? []))];
}

/** Test files the diff against `base` adds or changes. */
export function touchedTests(run, base = BASE) {
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
export function reviewScope({ ticketText, run, base = BASE, exists = existsSync }) {
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
  emit(reviewScope({ ticketText, run, base: base ?? BASE }));
}

if (isMain(import.meta.url)) main();
