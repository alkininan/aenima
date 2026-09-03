#!/usr/bin/env node
/**
 * Step 1 — has a document moved since this ticket was cut?
 *
 * A task's `Spec` property cites documents at versions: `product-spec v1.6 §8, §11 ·
 * design-spec v2.15 §4`. The repo is the record. If a cited document is now at a different
 * version, the ticket was written against text that has since changed, and the report says
 * so under "changed since this ticket was cut" rather than the run quietly building the old
 * reading.
 *
 * Two header shapes, both real in this repo and neither negotiable:
 *   product-spec.md   `# aenima — Product Specification v1.6`
 *   guidelines.md     `<!-- guidelines.md · v1.2 · in the repo · … -->`
 * so the version is the first `vN.N` in the opening lines, whatever carries it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emit, isMain } from "./cli.mjs";

/** Documents a Spec line may cite, and the file each names. */
export const DOCS = {
  "product-spec": "docs/product-spec.md",
  "design-spec": "docs/design-spec.md",
  "build-guide": "docs/build-guide.md",
  guidelines: "docs/guidelines.md",
  schema: "docs/schema.md",
};

/** How many opening lines count as the header. */
const HEADER_LINES = 6;

/** The version a document declares, or null when its header carries none. */
export function parseHeaderVersion(text) {
  const header = String(text ?? "")
    .split("\n")
    .slice(0, HEADER_LINES)
    .join("\n");
  const match = /\bv(\d+\.\d+)\b/.exec(header);
  return match ? match[1] : null;
}

/**
 * The documents and versions a `Spec` string cites.
 *
 * Sections are captured for the report but never compared: a ticket citing §8 of a document
 * that has not moved is not drift, and §-renumbering shows up as a version change anyway.
 */
export function parseSpec(spec) {
  const cited = [];
  for (const name of Object.keys(DOCS)) {
    const pattern = new RegExp(`${name}\\s+v(\\d+\\.\\d+)((?:\\s*§[\\d.]+,?)*)`, "g");
    for (const match of String(spec ?? "").matchAll(pattern)) {
      const sections = [...match[2].matchAll(/§([\d.]+)/g)].map((s) => s[1]);
      cited.push({ doc: name, version: match[1], sections });
    }
  }
  return cited;
}

/**
 * Drift between what a ticket cites and what the repo holds.
 *
 * `readDoc(path)` is injected so a test never needs the real files. Returns one row per
 * citation with `drifted` true when the versions differ; a document the repo cannot supply
 * is reported as `repo: null`, not silently treated as matching.
 */
export function versionDrift(spec, readDoc) {
  return parseSpec(spec).map(({ doc, version, sections }) => {
    let repo = null;
    try {
      repo = parseHeaderVersion(readDoc(DOCS[doc]));
    } catch {
      repo = null;
    }
    return { doc, cited: version, repo, sections, drifted: repo !== version };
  });
}

/** CLI: `node version-drift.mjs "<spec string>" [repo-root]`. */
function main() {
  const spec = process.argv[2] ?? "";
  const root = process.argv[3] ?? process.cwd();
  const rows = versionDrift(spec, (path) => readFileSync(join(root, path), "utf8"));
  emit({ cited: rows, drifted: rows.some((r) => r.drifted) });
}

if (isMain(import.meta.url)) main();
