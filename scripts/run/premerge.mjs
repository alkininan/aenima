#!/usr/bin/env node
/**
 * Steps 0 and 9 — main merged into the ticket branch before the branch merges (T0.36).
 *
 * Since T0.32 `docs/build-log.md` carries two sections generated from `docs/log/`, and every
 * branch regenerates both. Two branches therefore never agree on that file, and the second to
 * reach main is refused on it alone: GitHub turned down T0.26's and T0.34's merges that way,
 * and the refusal's promise that "the next run makes it again once the branch merges cleanly"
 * could never come true, because nothing was going to make it merge cleanly. A ticket that
 * merges itself at close escapes only because nothing lands between its push and its merge.
 *
 * So the branch takes main first. A clean merge is just a merge commit. A conflict is read
 * before it is touched: every conflicted path must be a generated file, and the two sides of
 * that file must differ *only* inside the generated sections — a hand-written passage of the
 * build log that both sides changed is a real disagreement, and taking main's copy would drop
 * the branch's words without saying so. Confined, it resolves the way the file is meant to be
 * resolved: main's copy, then `log-index.mjs` run again over `docs/log/`, which after the merge
 * holds both sides' entries. Anything else aborts and names the files, and the task stays at
 * Review — the same refusal as before, now only for the conflicts that deserve it.
 *
 * Like `revert.mjs`, this prepares a commit and stops. The push is the skill's own command, so
 * the guard reads it, and the gate runs on the result before anything merges.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import {
  BUILD_LOG,
  CURRENT_HEADING,
  HEADING,
  LOG_DIR,
  generate,
  replaceSection,
} from "./log-index.mjs";

/** The files a run never hand-resolves: a script writes them, so a script settles them. */
export const GENERATED = [BUILD_LOG];

/** The headings whose bodies `log-index.mjs` owns. */
export const SECTIONS = [HEADING, CURRENT_HEADING];

const out = (result) => String(result?.stdout ?? "").trim();
const said = (result) => `${result?.stdout ?? ""}${result?.stderr ?? ""}`.trim();

/**
 * `text` with every generated body blanked, leaving what a human wrote.
 *
 * Throws when a heading is missing: a build log without them is not a file this resolution
 * understands, and the caller reads that as "not confined" rather than as nothing to keep.
 */
export function withoutGenerated(text) {
  return SECTIONS.reduce((acc, heading) => replaceSection(acc, "", heading), String(text ?? ""));
}

/**
 * True when two sides of a generated file differ only inside the generated sections.
 *
 * This is the whole of the judgment. `git` says the file conflicts; it cannot say whether the
 * conflict is the generated list disagreeing with itself — which is expected and meaningless —
 * or two people writing different sentences in "Decisions made during the build", which is
 * neither.
 */
export function confined(ours, theirs) {
  try {
    return withoutGenerated(ours) === withoutGenerated(theirs);
  } catch {
    return false;
  }
}

/** Rewrite `dir`'s build log from `dir`'s own log entries and document headers. */
export function regenerateAt(dir) {
  const buildLog = readFileSync(join(dir, BUILD_LOG), "utf8");
  writeFileSync(join(dir, BUILD_LOG), generate({ dir: join(dir, LOG_DIR), buildLog, root: dir }));
}

const refuse = (why, files = []) => ({ ok: false, merged: false, files, resolved: [], why });

/**
 * Merge `base` into the branch this checkout is on, settling a generated-file conflict.
 *
 * Returns `{ ok, branch, base, merged, resolved, files, head, why }`. `merged` false with
 * `ok` true is a branch that already carries `base` — nothing to do, and the caller goes
 * straight on to the merge. `ok` false leaves the checkout exactly as it was found: the merge
 * is aborted, nothing is committed, and `files` names what stands in the way.
 */
export function premerge({
  cwd = process.cwd(),
  run,
  base = "origin/main",
  fetch = true,
  regenerate = regenerateAt,
} = {}) {
  const g = run ?? ((args) => spawnSync("git", args, { cwd, encoding: "utf8" }));

  if (fetch) g(["fetch", "--quiet", "origin"]);

  const branch = out(g(["rev-parse", "--abbrev-ref", "HEAD"]));
  if (branch === "" || branch === "HEAD") {
    return refuse("the checkout is not on a branch, and a merge needs one to land on");
  }
  if (branch === "main") {
    return refuse("main is checked out; a ticket branch takes main, never the other way round");
  }
  if (out(g(["status", "--porcelain"])) !== "") {
    return refuse("the checkout has uncommitted work, and a merge needs a clean tree");
  }

  const tip = out(g(["rev-parse", "--verify", "--quiet", base]));
  if (tip === "") return refuse(`${base} cannot be resolved`);

  if (g(["merge-base", "--is-ancestor", tip, "HEAD"]).status === 0) {
    return {
      ok: true,
      branch,
      base,
      merged: false,
      resolved: [],
      files: [],
      head: out(g(["rev-parse", "HEAD"])),
      why: null,
    };
  }

  const merged = g(["merge", "--no-ff", "--no-edit", base]);
  const done = (resolved) => ({
    ok: true,
    branch,
    base,
    merged: true,
    resolved,
    files: [],
    head: out(g(["rev-parse", "HEAD"])),
    why: null,
  });
  if (merged.status === 0) return done([]);

  const files = out(g(["diff", "--name-only", "--diff-filter=U"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();

  const abort = (why) => {
    g(["merge", "--abort"]);
    return { ...refuse(why, files), branch, base };
  };

  if (files.length === 0) {
    return abort(`git merge ${base} failed without naming a conflict: ${said(merged)}`);
  }

  const ungenerated = files.filter((file) => !GENERATED.includes(file));
  if (ungenerated.length > 0) {
    return abort(
      `the conflict reaches ${ungenerated.join(", ")}, which nothing regenerates — a run resolves a generated file and never a written one`,
    );
  }

  for (const file of files) {
    const ours = out(g(["show", `:2:${file}`]));
    const theirs = out(g(["show", `:3:${file}`]));
    if (!confined(ours, theirs)) {
      return abort(
        `${file} conflicts outside its generated sections, where both sides wrote different words — that is a disagreement to settle, not a list to rebuild`,
      );
    }
    // Main's copy, then the list rebuilt over the entries the merge just brought in.
    const taken = g(["checkout", "--theirs", "--", file]);
    if (taken.status !== 0)
      return abort(`main's copy of ${file} could not be taken: ${said(taken)}`);
  }

  try {
    regenerate(cwd);
  } catch (error) {
    return abort(`the build log could not be regenerated after the merge: ${error.message}`);
  }

  const staged = g(["add", "--", ...files]);
  if (staged.status !== 0) return abort(`the resolved files could not be staged: ${said(staged)}`);

  const committed = g(["commit", "--no-edit"]);
  if (committed.status !== 0) return abort(`the merge could not be committed: ${said(committed)}`);

  return done(files);
}

/** CLI: `node premerge.mjs [base]`, run from the checkout that is on the ticket branch. */
if (isMain(import.meta.url)) {
  const result = premerge({ base: process.argv[2] || "origin/main" });
  emit(result);
  process.exit(result.ok ? 0 : 1);
}
