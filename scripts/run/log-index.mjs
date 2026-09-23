#!/usr/bin/env node
/**
 * Step 8 — the build log's two generated sections: Current state, and Tickets done.
 *
 * Each ticket's entry is its own file, `docs/log/<id>.md`, so two open pull requests never
 * edit the same lines of one document: a ticket adds a file, and this script rewrites the
 * list in `docs/build-log.md` from the directory. A merge can still meet two new list lines
 * at the same spot; the resolution is running this script again, never a hand edit.
 *
 * A file's first line is `# <title>` and its second `_<UTC timestamp> · \`<commit>\`_`, the
 * commit optional. The list is oldest first by that timestamp, then by file name. A file
 * missing either line is refused with its name, so a run that writes one wrong finds out
 * from `log-index.test.mjs` before the list silently drops it.
 *
 * Current state is the same kind of thing, for the same reason: it was four versions and a
 * finished phase out of date when this was written, because a person had to remember to
 * move it. So it too is a function of the repo — the version each document carries in its
 * own header, read through the parser `version-drift.mjs` already uses, and the newest entry
 * under `docs/log/`. Phase and next ticket are not in it at all: the board owns the queue
 * and the roadmap owns the phases, and a copy here could only ever disagree with them.
 * Two lines nothing in the repo derives, the remote and the deploy, stand as `STANDING`.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import { DOCS, parseHeaderVersion } from "./version-drift.mjs";

export const LOG_DIR = join("docs", "log");
export const BUILD_LOG = join("docs", "build-log.md");
export const HEADING = "## Tickets done";
export const CURRENT_HEADING = "## Current state";

/** The documents Current state stamps, in the order it prints them. */
export const CURRENT_DOCS = ["product-spec", "design-spec", "guidelines"];

/** The lines nothing in the repo derives, kept as they were. */
export const STANDING = [
  "**Repo:** github.com/alkininan/aenima",
  "**Deployed:** yes — **aeni.ma** on Vercel",
];

export const CURRENT_INTRO =
  "Written from the repo by `node scripts/run/log-index.mjs`, like the Tickets done list " +
  "below, and its test refuses a stale copy: edit the documents and the log entries, never " +
  "this block. No phase and no next ticket here — the board owns the queue and the roadmap " +
  "owns the phases, and a stamp a human maintains is a stamp that is eventually wrong.";

export const INTRO =
  "One file per ticket under `docs/log/`, oldest first. This list is written by " +
  "`node scripts/run/log-index.mjs` from that directory and its test refuses a stale copy: " +
  "edit the files, never the list.";

const TITLE = /^# (.+)$/;
const STAMP = /^_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)(?: · `([0-9a-f]{7,40})`)?_$/;

/** The index fields of one log file, or a thrown error naming what the file lacks. */
export function readEntry(name, text) {
  const [first = "", second = ""] = text.split("\n");
  const title = first.match(TITLE)?.[1]?.trim();
  if (!title) throw new Error(`${name}: first line must be "# <title>"`);
  const stamped = second.match(STAMP);
  if (!stamped) {
    throw new Error(`${name}: second line must be "_<UTC timestamp> · \`<commit>\`_"`);
  }
  return { id: basename(name, ".md"), title, when: stamped[1], commit: stamped[2] ?? null };
}

/** The entries oldest first, ties by id in natural order. */
export function ordered(entries) {
  const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
  return [...entries].sort((a, b) => a.when.localeCompare(b.when) || natural(a.id, b.id));
}

/** One entry as a link to its file. */
export function link(entry) {
  return `[${entry.title}](log/${entry.id}.md)`;
}

/** One entry's date, and its commit where it has one. */
export function stamp(entry) {
  return `${entry.when.slice(0, 10)}${entry.commit ? ` · \`${entry.commit}\`` : ""}`;
}

/** The newest entry, or null for an empty directory. */
export function newest(entries) {
  return ordered(entries).at(-1) ?? null;
}

/** The list lines, oldest first, then by id. */
export function index(entries) {
  return ordered(entries).map((e) => `- ${link(e)} · ${stamp(e)}`);
}

/** The whole section body: intro, blank line, list. */
export function section(entries) {
  return `${INTRO}\n\n${index(entries).join("\n")}\n`;
}

/**
 * The version each of Current state's documents carries in its own header.
 *
 * `parseHeaderVersion` is `version-drift.mjs`'s, not a second copy: the two scripts answer
 * the same question about the same headers, and two parsers is two answers that can differ.
 * A document whose header carries no version is refused by name rather than printed as a
 * blank, the way `readEntry` refuses a log file missing its stamp.
 */
export function versions(readDoc, docs = CURRENT_DOCS) {
  return docs.map((doc) => {
    const version = parseHeaderVersion(readDoc(DOCS[doc]));
    if (!version) throw new Error(`${DOCS[doc]}: no version in its header`);
    return { doc, version };
  });
}

/** The whole Current state body: intro, blank line, the stamps. */
export function currentState({ entries, versions: read }) {
  const specs = read.map(({ doc, version }) => `${doc} v${version}`).join(" · ");
  const top = newest(entries);
  const lines = [
    `**Specs:** ${specs}`,
    `**Newest entry:** ${top ? `${link(top)} · ${stamp(top)}` : "none yet"}`,
    ...STANDING,
  ];
  return `${CURRENT_INTRO}\n\n${lines.join("\n")}\n`;
}

/** Every `.md` under `dir`, read into entries. */
export function readDir(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => readEntry(name, readFileSync(join(dir, name), "utf8")));
}

/** `text` with `heading`'s section body replaced by `body`, the heading itself kept. */
export function replaceSection(text, body, heading = HEADING) {
  const start = text.indexOf(`${heading}\n`);
  if (start === -1) throw new Error(`${BUILD_LOG}: no "${heading}" heading`);
  const from = start + heading.length + 1;
  const next = text.indexOf("\n## ", from);
  const tail = next === -1 ? "" : `\n${text.slice(next + 1)}`;
  return `${text.slice(0, from)}\n${body}${tail}`;
}

/** The build log as it should read for the repo as it stands. */
export function generate({
  dir = LOG_DIR,
  buildLog = readFileSync(BUILD_LOG, "utf8"),
  root = ".",
  readDoc = (path) => readFileSync(join(root, path), "utf8"),
} = {}) {
  const entries = readDir(dir);
  const listed = replaceSection(buildLog, section(entries));
  const state = currentState({ entries, versions: versions(readDoc) });
  return replaceSection(listed, state, CURRENT_HEADING);
}

/** CLI: `node log-index.mjs` writes the build log; `--check` exits 1 when it would change. */
function main() {
  const current = readFileSync(BUILD_LOG, "utf8");
  const wanted = generate({ buildLog: current });
  const stale = wanted !== current;
  if (process.argv.includes("--check")) {
    emit({ stale });
    process.exit(stale ? 1 : 0);
  }
  if (stale) writeFileSync(BUILD_LOG, wanted);
  emit({ written: stale, entries: readDir(LOG_DIR).length });
}

if (isMain(import.meta.url)) main();
