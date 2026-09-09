#!/usr/bin/env node
/**
 * Step 8 — the build log's Tickets done section, generated from `docs/log/`.
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
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { emit, isMain } from "./cli.mjs";

export const LOG_DIR = join("docs", "log");
export const BUILD_LOG = join("docs", "build-log.md");
export const HEADING = "## Tickets done";

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
  const stamp = second.match(STAMP);
  if (!stamp) {
    throw new Error(`${name}: second line must be "_<UTC timestamp> · \`<commit>\`_"`);
  }
  return { id: basename(name, ".md"), title, when: stamp[1], commit: stamp[2] ?? null };
}

/** The list lines, oldest first, then by id. */
export function index(entries) {
  const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
  return [...entries]
    .sort((a, b) => a.when.localeCompare(b.when) || natural(a.id, b.id))
    .map(
      (e) =>
        `- [${e.title}](log/${e.id}.md) · ${e.when.slice(0, 10)}${e.commit ? ` · \`${e.commit}\`` : ""}`,
    );
}

/** The whole section body: intro, blank line, list. */
export function section(entries) {
  return `${INTRO}\n\n${index(entries).join("\n")}\n`;
}

/** Every `.md` under `dir`, read into entries. */
export function readDir(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => readEntry(name, readFileSync(join(dir, name), "utf8")));
}

/** `text` with the Tickets done section's body replaced by `body`, heading kept. */
export function replaceSection(text, body) {
  const start = text.indexOf(`${HEADING}\n`);
  if (start === -1) throw new Error(`${BUILD_LOG}: no "${HEADING}" heading`);
  const from = start + HEADING.length + 1;
  const next = text.indexOf("\n## ", from);
  const tail = next === -1 ? "" : `\n${text.slice(next + 1)}`;
  return `${text.slice(0, from)}\n${body}${tail}`;
}

/** The build log as it should read for the directory as it stands. */
export function generate({ dir = LOG_DIR, buildLog = readFileSync(BUILD_LOG, "utf8") } = {}) {
  return replaceSection(buildLog, section(readDir(dir)));
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
