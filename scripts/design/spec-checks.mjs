import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * T0.38. design-spec §17's four checks on the document itself — "run at every version bump":
 *
 *   C-01 The version in the title, the last changelog line and the footer agree, and the
 *        changelog comment closes on its last line.
 *   C-02 Outside §1, no line carries `~`, `≈`, "about", "roughly" or "a few" before a number.
 *   C-03 Every custom property named in prose is declared in a CSS block of §2, §3, §5 or §6
 *        — `--morph-r0` and `--a` excepted; the changelog comment is not read.
 *   C-04 Every bare section reference points at a section or a numbered block that exists;
 *        `product-spec §n` points into the other half of the pair and is not resolved.
 *
 * Each check takes the document's text and returns the offenders it found, so the test can
 * run it over the real file and over a copy with one offender planted. Run as a script it
 * checks `docs/design-spec.md` and exits 1 on any offender.
 */

export const SPEC = "docs/design-spec.md";

/** The leading `<!-- … -->` changelog comment, and where it sits. */
export function changelog(text) {
  const open = text.indexOf("<!--");
  const close = text.indexOf("-->", open);
  if (open === -1 || close === -1) return null;
  return { start: open, end: close + 3, body: text.slice(open + 4, close) };
}

/** The text with the changelog comment blanked out, line count kept so line numbers hold. */
function withoutChangelog(text) {
  const log = changelog(text);
  if (log === null) return text;
  const blank = text.slice(log.start, log.end).replace(/[^\n]/g, "");
  return text.slice(0, log.start) + blank + text.slice(log.end);
}

/** `## N. Title` sections, each running to the next `## ` heading: number, start, end lines. */
export function sections(text) {
  const lines = text.split("\n");
  const found = [];
  let open = null;
  lines.forEach((line, index) => {
    if (!/^## /.test(line)) return;
    if (open) open.end = index;
    const match = /^## (\d+)\. /.exec(line);
    open = match ? { number: match[1], start: index, end: lines.length } : null;
    if (open) found.push(open);
  });
  return found;
}

export function checkC01(text) {
  const offenders = [];
  const title = /^# .*? v(\d+\.\d+)\b/m.exec(text)?.[1] ?? null;
  const log = changelog(text);
  const logLines = log ? log.body.split("\n").filter((line) => line.trim() !== "") : [];
  const lastLine = logLines.at(-1) ?? "";
  const last = /^v(\d+\.\d+):/.exec(lastLine.trim())?.[1] ?? null;
  const footer = /^\*v(\d+\.\d+) — [^\n]*\*\s*$/m.exec(text.trimEnd().split("\n").at(-1) ?? "");
  const foot = footer?.[1] ?? null;

  if (title === null) offenders.push("the title carries no version");
  if (log === null) offenders.push("there is no changelog comment");
  if (last === null) offenders.push("the changelog's last line is not a version line");
  if (foot === null) offenders.push("the last line is not the version footer");
  if (title && last && title !== last) offenders.push(`title v${title}, changelog v${last}`);
  if (title && foot && title !== foot) offenders.push(`title v${title}, footer v${foot}`);

  // "closes on its last line": the `-->` sits on the line of the last entry, not below it.
  if (log !== null) {
    const closingLine = text.slice(0, log.end).split("\n").at(-1) ?? "";
    if (!/^v\d+\.\d+:/.test(closingLine.trim()))
      offenders.push("the changelog comment does not close on its last line");
  }
  return offenders;
}

const HEDGE = /(?:~|≈|\babout\b|\broughly\b|\ba few\b)\s*[−-]?\d/i;

export function checkC02(text) {
  const lines = text.split("\n");
  const one = sections(text).find((section) => section.number === "1");
  const offenders = [];
  lines.forEach((line, index) => {
    if (one && index >= one.start && index < one.end) return;
    if (HEDGE.test(line)) offenders.push(`line ${index + 1}: ${line.trim().slice(0, 100)}`);
  });
  return offenders;
}

/** Every fenced css block inside the sections named. */
function cssBlocks(text, numbers) {
  const lines = text.split("\n");
  return sections(text)
    .filter((section) => numbers.includes(section.number))
    .flatMap((section) => {
      const body = lines.slice(section.start, section.end).join("\n");
      return [...body.matchAll(/```css\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
    });
}

export const C03_EXCEPTED = new Set(["--morph-r0", "--a"]);

const PROPERTY = /(?<![\w-])--[a-z][\w-]*[a-z0-9]/gi;

export function checkC03(text) {
  const declared = new Set();
  for (const block of cssBlocks(text, ["2", "3", "5", "6"])) {
    for (const match of block.matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1]);
  }
  const offenders = new Set();
  for (const match of withoutChangelog(text).matchAll(PROPERTY)) {
    const name = match[0];
    if (!declared.has(name) && !C03_EXCEPTED.has(name)) offenders.add(name);
  }
  return [...offenders].sort();
}

/**
 * The targets a bare reference may name: every `## N.` section and every `### N.M` numbered
 * block. A reference into the other half of the pair is written `product-spec §n` and is
 * skipped; so is the reference's own ranges' second end, which is read as a reference too.
 */
export function checkC04(text) {
  const targets = new Set();
  for (const match of text.matchAll(/^## (\d+)\. /gm)) targets.add(match[1]);
  for (const match of text.matchAll(/^### (\d+\.\d+) /gm)) targets.add(match[1]);

  const offenders = new Set();
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/§(\d+(?:\.\d+)?)/g)) {
      const before = line.slice(0, match.index);
      if (/product-spec\s*$/.test(before)) continue;
      if (!targets.has(match[1])) offenders.add(`line ${index + 1}: §${match[1]}`);
    }
  });
  return [...offenders];
}

export const CHECKS = { "C-01": checkC01, "C-02": checkC02, "C-03": checkC03, "C-04": checkC04 };

export function run(text) {
  return Object.fromEntries(Object.entries(CHECKS).map(([id, check]) => [id, check(text)]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = readFileSync(join(process.cwd(), SPEC), "utf8");
  const results = run(text);
  const failed = Object.values(results).some((offenders) => offenders.length > 0);
  console.log(JSON.stringify({ ok: !failed, ...results }, null, 2));
  process.exit(failed ? 1 : 0);
}
