import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * T0.33. Claude Code loads a file under `.claude/rules/` only when the session reads a file
 * its `paths:` frontmatter matches — product-spec §9's "loaded only when the agent works
 * there", applied to this repo. That mechanism is only worth anything while the files stay
 * true, so this module answers one question: does every rule file still resolve?
 *
 * Four ways one stops resolving, and `check` reports all four:
 *   - no `paths:` list, which would load the file at every launch like CLAUDE.md
 *   - a glob that matches no tracked file, so the rule reaches nobody
 *   - a source path under docs/log/ that no longer exists
 *   - a quoted phrase the build log no longer carries
 */

export const RULES_DIR = ".claude/rules";
export const BUILD_LOG = "docs/build-log.md";

/** Splitting a rule line from its source. Greedy, so the last " — " on the line wins. */
const SOURCE = /^- (.+) — (?:`(docs\/log\/[^`]+\.md)`|"([^"]+)")$/;

/**
 * Line wrapping is typesetting: a phrase reads the same whether the log broke it at column
 * 98 or not, so both sides are compared on one line. This is the fold T2.3's evidence guard
 * already makes for the same reason, and nothing narrower would let a rule quote a sentence
 * out of a hard-wrapped document.
 */
export function flatten(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** The YAML block between the first two `---` markers, and the body after it. */
export function splitFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { frontmatter: null, body: text };
  return { frontmatter: match[1], body: text.slice(match[0].length) };
}

/**
 * The `paths` field, which Claude Code accepts as a YAML list or a comma-separated string
 * (memory.md, rule frontmatter reference). Null means the field is absent — which is a
 * rule that loads unconditionally, and the thing AC1 refuses.
 */
export function readPaths(frontmatter) {
  if (frontmatter === null) return null;
  const lines = frontmatter.split("\n");
  const start = lines.findIndex((line) => /^paths\s*:/.test(line));
  if (start === -1) return null;

  const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");
  // Three legal shapes for one field: a block list below, a comma-separated string, and a
  // YAML flow list. The brackets come off first, or the flow list splits into two patterns
  // that match nothing and the report names the wrong cause.
  const inline = lines[start]
    .replace(/^paths\s*:/, "")
    .trim()
    .replace(/^\[|\]$/g, "");
  if (unquote(inline) !== "") return inline.split(",").map(unquote).filter(Boolean);

  const list = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (!item) break;
    list.push(unquote(item[1]));
  }
  return list;
}

/** Every top-level list item in the body. One line per rule, so one line per item. */
export function ruleLines(body) {
  return body.split("\n").filter((line) => line.startsWith("- "));
}

/** The source a rule line ends in, or null when it ends in neither shape. */
export function readSource(line) {
  const match = SOURCE.exec(line);
  if (!match) return null;
  return match[2] ? { kind: "path", value: match[2] } : { kind: "quote", value: match[3] };
}

/**
 * Node's glob reads a literal `[` as `[[]`; Claude Code's reads it as `\[` (memory.md,
 * path-specific rules). The two disagree on exactly that escape and agree everywhere else,
 * so a pattern written the way the mechanism documents is translated here rather than being
 * reported as matching nothing — a test that reddens the escape its own ticket prescribes
 * would send the next rule-writer toward a pattern Claude Code cannot read.
 */
export function toNodeGlob(pattern) {
  return pattern.replace(/\\\[/g, "[[]").replace(/\\\]/g, "[]]");
}

/** The tracked files a pattern reaches. Tracked, so a build artifact can never answer for one. */
export function matchTracked(pattern, { root, tracked }) {
  const hits = globSync(toNodeGlob(pattern), {
    cwd: root,
    exclude: (name) => name === "node_modules" || name === ".next" || name === ".git",
  });
  return hits.map((hit) => hit.split(sep).join("/")).filter((hit) => tracked.has(hit));
}

/** Every `.md` under the rules directory, recursively, named relative to it. */
export function readDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

/**
 * Every problem, named by file and by line. A list rather than a throw: one stale glob
 * should not hide the three beside it.
 */
export function check({
  root,
  dir = join(root, RULES_DIR),
  tracked,
  buildLog,
  readFile = (name) => readFileSync(join(dir, name), "utf8"),
  exists = (path) => existsSync(join(root, path)),
} = {}) {
  const log = flatten(buildLog);
  const problems = [];

  for (const file of readDir(dir)) {
    const { frontmatter, body } = splitFrontmatter(readFile(file));
    const paths = readPaths(frontmatter);

    if (paths === null) {
      problems.push(`${file}: no paths: list, so it would load at every launch`);
    } else if (paths.length === 0) {
      problems.push(`${file}: paths: is empty`);
    } else {
      for (const pattern of paths) {
        if (matchTracked(pattern, { root, tracked }).length === 0) {
          problems.push(`${file}: paths: ${pattern} matches no tracked file`);
        }
      }
    }

    const lines = ruleLines(body);
    if (lines.length === 0) problems.push(`${file}: no rule lines`);

    for (const line of lines) {
      const source = readSource(line);
      if (!source) {
        problems.push(`${file}: no source on "${flatten(line).slice(0, 60)}"`);
        continue;
      }
      if (source.kind === "path" && !exists(source.value)) {
        problems.push(`${file}: ${source.value} does not exist`);
      }
      if (source.kind === "quote" && !log.includes(flatten(source.value))) {
        problems.push(`${file}: "${source.value}" is not in ${BUILD_LOG}`);
      }
    }
  }

  return problems;
}
