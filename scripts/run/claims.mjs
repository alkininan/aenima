#!/usr/bin/env node
/**
 * Step 2 — do the names this ticket mentions still exist?
 *
 * A ticket is cut in chat, away from the code, so the paths and identifiers it names are
 * claims about a repository nobody looked at while writing them. `spec-sections.mjs` catches
 * a cited *section* that has moved; nothing caught a cited *name*, and a stale one surfaces
 * in review or not at all. This reports them before a line of the build is written.
 *
 * **The script finds names; the skill decides what a missing one means** (product-spec §12's
 * code node law). An absent name is either something the ticket is about to create or drift,
 * and only a reader of the ticket can tell those apart — so nothing here is called an error.
 *
 * The reference is `origin/main`, never the working tree: a worktree can be behind, and a
 * name this branch has already added is not evidence that main has it.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { emit, isMain } from "./cli.mjs";

/** Where the ticket's own words stop and the sections it quotes begin. */
export const CITED_HEADING = /^##\s+Cited\s*$/m;

/** Last segments this repo writes files with. A token ending in one is a file name. */
const EXTENSIONS = new Set([
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".sql",
  ".css",
  ".yml",
  ".yaml",
  ".sh",
  ".txt",
  ".html",
  ".svg",
]);

/**
 * The ticket's own sections — everything before `## Cited`.
 *
 * The Cited section is spec text quoted verbatim, so its names are the document's claims and
 * not the ticket's. Checking them would report `.env.migrate`, which is deliberately in no
 * commit, as drift on every ticket that cites guidelines §5.
 */
export function ownSections(text) {
  const body = String(text ?? "");
  const cited = CITED_HEADING.exec(body);
  return cited ? body.slice(0, cited.index) : body;
}

/**
 * Inline code spans, in order, fenced blocks dropped.
 *
 * A fenced block is an example — a command someone will type, a snippet of a file — and not a
 * claim that a name is there. A fence closes only on a run at least as long as the one that
 * opened it, so a ```` ```` ```` block quoting ``` ``` ``` blocks stays one block.
 */
export function codeSpans(text) {
  const lines = String(text ?? "").split("\n");
  const kept = [];
  let fence = null;

  for (const line of lines) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (mark && mark[1][0] === fence.char && mark[1].length >= fence.length) fence = null;
      continue;
    }
    if (mark) {
      fence = { char: mark[1][0], length: mark[1].length };
      continue;
    }
    kept.push(line);
  }

  return [...kept.join("\n").matchAll(/(`+)([\s\S]*?)\1/g)].map((match) => match[2].trim());
}

/**
 * What a code span is: a `path` to look up as a file, an `identifier` to look up with
 * `git grep`, or a `skip` with the reason in `why`.
 *
 * `tops` is the top level of the reference, and it is what tells a path from a git ref:
 * `src/packs` names a directory of this repository and `origin/main` names a branch, and
 * nothing in the two strings themselves says which is which.
 */
export function classify(token, { tops = [] } = {}) {
  const name = String(token ?? "").trim();
  const skip = (why) => ({ kind: "skip", name, why });

  if (name === "") return skip("empty");
  if (/\s/.test(name)) return skip("a command or a phrase");
  if (name.startsWith("-")) return skip("a flag");
  if (/[<>]/.test(name)) return skip("a placeholder");
  if (/^(?:https?|file|mailto):/i.test(name)) return skip("a url");
  if (/[*?]/.test(name)) return skip("a glob");
  if (/[(){}[\]=;"'`|&!,@#§~^\\+]/.test(name)) return skip("a code fragment");
  if (/^[\d.,%:+-]+$/.test(name) || /^v\d+(?:\.\d+)*$/.test(name)) return skip("a number");
  if (/^[./]+$/.test(name)) return skip("separators and nothing else");

  const segments = name.split("/");
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf(".");
  const looksLikeFile = dot > 0 && EXTENSIONS.has(last.slice(dot));
  if (name.endsWith("/") || looksLikeFile || (segments.length > 1 && tops.includes(segments[0]))) {
    return { kind: "path", name };
  }

  if (/^[A-Za-z_$][A-Za-z0-9_$.:-]*$/.test(name) && name.length > 1) {
    return { kind: "identifier", name };
  }

  return skip("not a path or an identifier");
}

/**
 * Every name the ticket's own sections claim, sorted into what the reference lacks, what it
 * has, and what was never looked up. One entry per name however often the ticket repeats it.
 */
export function claims(text, look) {
  const seen = new Map();
  for (const span of codeSpans(ownSections(text))) {
    const entry = classify(span, look);
    if (!seen.has(entry.name)) seen.set(entry.name, entry);
  }

  const absent = [];
  const present = [];
  const skipped = [];
  for (const entry of seen.values()) {
    if (entry.kind === "skip") {
      skipped.push(entry);
      continue;
    }
    const there = entry.kind === "path" ? look.file(entry.name) : look.identifier(entry.name);
    (there ? present : absent).push(entry);
  }
  return { absent, present, skipped };
}

/** The last segment of a path — `scripts/run/claims.mjs` is named `claims.mjs`. */
export function basename(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Lookups against one git reference. Arguments are an array and never a shell line, so a
 * name out of a ticket is an argument and can be nothing else.
 *
 * A token with no slash is matched on the reference's file *names* as well as at the root,
 * because a ticket says `log-index.mjs` and means the one file of that name in the tree —
 * looking it up at the root alone reported 41 files main tracks as missing from it.
 *
 * `git grep` runs word-bounded: a substring search answers `unScorer` with the line holding
 * `runScorer`, so a function renamed one letter reads as present and the drift this exists
 * to catch is exactly what it misses. A name that appears only in a document is still in the
 * repository and still counts, so nothing narrows the search to code.
 *
 * `readable` is false when the reference itself could not be read — a bad ref, a fetch that
 * has not happened. Every name is then unfindable and reporting them all as drift would be a
 * claim about the ticket made from a fact about the checkout.
 */
export function gitLook({ ref = "origin/main", cwd = process.cwd(), run } = {}) {
  const g =
    run ??
    ((args) =>
      spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const tree = g(["ls-tree", "-r", "--name-only", ref]);
  const paths = tree.status === 0 ? tree.stdout.split("\n").filter(Boolean) : [];
  const names = new Set(paths.map(basename));
  return {
    ref,
    readable: tree.status === 0,
    tops: [...new Set(paths.map((path) => path.split("/")[0]))],
    file: (name) =>
      g(["cat-file", "-e", `${ref}:${name}`]).status === 0 ||
      (!name.includes("/") && names.has(name)),
    identifier: (name) =>
      g(["grep", "--quiet", "--word-regexp", "--fixed-strings", "-e", name, ref]).status === 0,
  };
}

/**
 * `{ ticket, ref, absent, present, skipped }` for one ticket file, or `{ error }` when the
 * reference could not be read.
 */
export function readClaims(path, options = {}) {
  const look = options.look ?? gitLook(options);
  if (look.readable === false) {
    return { ticket: path, ref: look.ref ?? null, error: `cannot read ${look.ref}` };
  }
  return { ticket: path, ref: look.ref ?? null, ...claims(readFileSync(path, "utf8"), look) };
}

/** CLI: `node claims.mjs docs/tickets/T0.34.md [ref]`. */
function main() {
  const path = process.argv[2];
  if (!path) {
    emit({ error: "usage: claims.mjs docs/tickets/<id>.md [ref]" });
    process.exitCode = 1;
    return;
  }
  emit(readClaims(path, { ref: process.argv[3] ?? "origin/main" }));
}

if (isMain(import.meta.url)) main();
