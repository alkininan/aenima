#!/usr/bin/env node
/**
 * Step 9 — which diffs a run may merge on its own.
 *
 * A finished ticket merges itself (T0.16): the reviewer's PASS is on file and the gate is
 * green, so the human's word adds nothing — except where it still does. A migration, a
 * product-spec change and a change to the pipeline's own guard, gate, skill or run scripts
 * are the three places a human still decides, and a run must never loosen its own boundary
 * unattended. Those paths are gated: a diff that touches one stays at Review and waits for
 * the word `merge`; every other diff lands on main at close.
 *
 * The list is read in two places and lives in one: the guard's second door
 * (`scripts/hooks/guard.mjs`, rule (f)) refuses `gh pr merge` on the reviewer's PASS while
 * the diff touches a gated path, and the skill's step 9 asks the same question before it
 * tries. Pure over injected inputs; the CLI reads the diff and the two package.json files.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";

/** Directories whose every file is gated. */
export const GATED_DIRS = ["drizzle/", ".claude/", "scripts/hooks/", "scripts/run/"];

/** Files gated by name. `package.json` is gated only when its scripts change (`scriptsChanged`). */
export const GATED_FILES = ["docs/product-spec.md", ".worktreeinclude", ".gitignore"];

/** True when a repo-relative path is one only the human's word merges. */
export function isGatedPath(path) {
  const p = String(path ?? "");
  return GATED_FILES.includes(p) || GATED_DIRS.some((dir) => p.startsWith(dir));
}

/** The `scripts` of a package.json text, keys sorted; null when the text does not parse. */
function scriptsOf(text) {
  try {
    const scripts = JSON.parse(String(text ?? "")).scripts ?? {};
    return JSON.stringify(Object.fromEntries(Object.entries(scripts).sort()));
  } catch {
    return null;
  }
}

/**
 * True when the `scripts` object of package.json differs between the two texts. A side
 * that does not parse reads as changed: a package.json the run cannot read is not one it
 * can vouch for.
 */
export function scriptsChanged(mainText, headText) {
  const main = scriptsOf(mainText);
  const head = scriptsOf(headText);
  return main === null || head === null || main !== head;
}

/** The gated paths among `files`, in the diff's order. */
export function gatedPaths(files = [], { packageScriptsChanged = false } = {}) {
  return files.filter(
    (file) => isGatedPath(file) || (file === "package.json" && packageScriptsChanged),
  );
}

/**
 * `{ files, gated, ok }` for a diff. `files` are the paths the diff touches; the two package
 * texts are consulted only when `package.json` is among them.
 */
export function gatedDiff({ files = [], mainPackage = null, headPackage = null } = {}) {
  const packageScriptsChanged =
    files.includes("package.json") && scriptsChanged(mainPackage, headPackage);
  const gated = gatedPaths(files, { packageScriptsChanged });
  return { files, gated, ok: gated.length === 0 };
}

const git = (args, cwd) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * The diff of `range` in the checkout at `cwd`, judged. `origin/main...HEAD` is what a pull
 * request from this branch merges; the head side's package.json is the working tree's.
 */
export function gatedDiffOf({ cwd = process.cwd(), range = "origin/main...HEAD" } = {}) {
  const names = git(["diff", "--name-only", range], cwd);
  const files = String(names ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const base = range.split("...")[0] ?? "origin/main";
  let headPackage = null;
  try {
    headPackage = readFileSync(join(cwd, "package.json"), "utf8");
  } catch {
    headPackage = null;
  }
  return {
    range,
    ...gatedDiff({ files, mainPackage: git(["show", `${base}:package.json`], cwd), headPackage }),
  };
}

/** CLI: `node gated.mjs [range]`, run from the checkout. */
if (isMain(import.meta.url)) emit(gatedDiffOf({ range: process.argv[2] ?? "origin/main...HEAD" }));
