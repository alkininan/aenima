#!/usr/bin/env node
/**
 * Step 2 — inlining the sections a ticket cites.
 *
 * The reviewer reads `docs/tickets/<id>.md` and nothing else, so every section the ticket
 * cites has to be *in* it, verbatim. Quoting a section by number instead would hand the
 * reviewer a pointer into a document that may have moved since — which is the same failure
 * version drift exists to catch, one level down.
 *
 * Sections are `## N. Title` in these documents. The text runs to the next heading of the
 * same level, trailing blank lines trimmed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOCS } from "./version-drift.mjs";
import { emit, isMain, readStdin } from "./cli.mjs";

/**
 * A numbered heading. Both forms in this repo are real and neither is a typo:
 *   `## 7. Artifact packs`      a section, dot after the number
 *   `### 7.5 Backlog refinement`  a sub-section, no dot
 *   `## A. Seed baselines`      a lettered appendix
 * so the dot is optional and the label may be a letter.
 */
const HEADING = /^(#{2,4})\s+([0-9A-Z]+(?:\.[0-9]+)*)\.?\s+(.*)$/;

/** Every numbered section and sub-section in a document, in order. */
export function sectionsOf(text) {
  const lines = String(text ?? "").split("\n");
  const starts = [];

  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match) {
      starts.push({ level: match[1].length, number: match[2], title: match[3].trim(), index });
    }
  });

  return starts.map((start, i) => {
    // A section ends at the next heading of the same level or shallower. `## 7.` therefore
    // carries its own 7.1–7.5 sub-sections, and `### 7.5` stops at the next one.
    const next = starts.slice(i + 1).find((later) => later.level <= start.level);
    const end = next ? next.index : lines.length;
    return {
      number: start.number,
      title: start.title,
      level: start.level,
      body: lines.slice(start.index, end).join("\n").replace(/\s+$/, ""),
    };
  });
}

/**
 * The cited sections of one document, verbatim.
 *
 * A section the document does not contain comes back as `{ number, missing: true }` rather
 * than as an empty string: an inlined blank would read to the reviewer as a section that
 * says nothing, and the two are very different claims.
 */
export function inlineSections(text, numbers = []) {
  const all = sectionsOf(text);
  return numbers.map((number) => {
    const found = all.find((section) => section.number === String(number));
    return found ?? { number: String(number), missing: true };
  });
}

/** CLI: `{ "cited": [{ "doc": "product-spec", "sections": ["8","11"] }], "root": "." }`. */
async function main() {
  const input = JSON.parse(await readStdin());
  const root = input.root ?? process.cwd();
  emit(
    (input.cited ?? []).map(({ doc, sections }) => {
      const path = DOCS[doc];
      if (!path) return { doc, error: `unknown document: ${doc}` };
      try {
        return {
          doc,
          path,
          sections: inlineSections(readFileSync(join(root, path), "utf8"), sections),
        };
      } catch (error) {
        return { doc, path, error: String(error.message ?? error) };
      }
    }),
  );
}

if (isMain(import.meta.url)) await main();
