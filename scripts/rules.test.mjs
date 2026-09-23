import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BUILD_LOG,
  check,
  flatten,
  matchTracked,
  readDir,
  readPaths,
  readSource,
  RULES_DIR,
  ruleLines,
  splitFrontmatter,
  toNodeGlob,
} from "./rules.mjs";

const root = join(import.meta.dirname, "..");
const tracked = new Set(
  execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean),
);
const buildLog = readFileSync(join(root, BUILD_LOG), "utf8");
const over = (options) => check({ root, tracked, buildLog, ...options });

// TC1 → AC1 and TC2 → AC2. The committed rule files, read the way Claude Code reads them:
// every one carries a paths: list, every glob still reaches a tracked file, and every rule
// line ends in a source that resolves.
describe("the committed rules under .claude/rules/", () => {
  it("every file carries a paths: list whose globs all reach tracked files", () => {
    expect(over()).toEqual([]);
  });

  it("is not empty — the index exists", () => {
    expect(readDir(join(root, RULES_DIR)).length).toBeGreaterThan(0);
  });

  it("imports nothing: an @-import would load its whole target at launch", () => {
    for (const file of readDir(join(root, RULES_DIR))) {
      const body = readFileSync(join(root, RULES_DIR, file), "utf8");
      expect(body, file).not.toMatch(/(^|\s)@[\w./~-]+\.md/);
    }
  });
});

// TC3 → AC3. The eight rules the ticket names, each in the file for the code it governs.
// A grep per rule, because AC3 is a claim about where a rule is readable and not about how
// many lines a directory holds.
describe("the rules the build log paid for reach the code they are about", () => {
  const file = (name) => readFileSync(join(root, RULES_DIR, name), "utf8");

  it("migrations carries the enum rule and the NULL-passes-a-CHECK rule", () => {
    const text = file("migrations.md");
    expect(text).toContain("Extending an enum and using the new value cannot happen");
    expect(text).toContain("A CHECK constraint rejects a row only when its expression is FALSE");
  });

  it("database carries ::text::jsonb and the Date on the drizzle-wrapped raw client", () => {
    const text = file("database.md");
    expect(text).toContain("::text::jsonb");
    expect(text).toContain("drizzle()");
  });

  it("scoring carries NFC-never-NFKC and the computed protocol version", () => {
    const text = file("scoring.md");
    expect(text).toContain("NFC, never NFKC");
    expect(text).toContain("the version is computed rather than typed");
  });

  it("tests carries the fixture rule and the row-ordering rule", () => {
    const text = file("tests.md");
    expect(text).toContain("A fixture that skips the wiring cannot test the wiring");
    expect(text).toContain("order by something the database guarantees");
  });
});

// TC4 → AC4. The four defects, each planted in a temp directory and each reddening on its
// own. `root` and `tracked` stay the repo's, so the real matcher runs against the real
// tracked set and only the rule file under test is a fixture.
describe("check refuses", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-rules-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const plant = (text) => {
    writeFileSync(join(dir, "area.md"), text);
    return over({ dir });
  };

  const sound =
    '---\npaths:\n  - "src/db/**/*.ts"\n---\n\n' +
    '# Area\n\n- A rule. — "NFC, never NFKC."\n- Another. — `docs/log/T2.3.md`\n';

  it("nothing, when the file is sound", () => {
    expect(plant(sound)).toEqual([]);
  });

  it("a rules file with no paths: list", () => {
    expect(plant('# Area\n\n- A rule. — "NFC, never NFKC."\n')).toEqual([
      "area.md: no paths: list, so it would load at every launch",
    ]);
  });

  it("a glob that matches nothing", () => {
    expect(plant(sound.replace("src/db/**/*.ts", "src/nowhere/**/*.ts"))).toEqual([
      "area.md: paths: src/nowhere/**/*.ts matches no tracked file",
    ]);
  });

  it("a source path that does not exist", () => {
    expect(plant(sound.replace("docs/log/T2.3.md", "docs/log/T9.9.md"))).toEqual([
      "area.md: docs/log/T9.9.md does not exist",
    ]);
  });

  it("a quoted phrase the build log no longer carries", () => {
    expect(plant(sound.replace("NFC, never NFKC.", "NFKC, never NFC."))).toEqual([
      'area.md: "NFKC, never NFC." is not in docs/build-log.md',
    ]);
  });

  it("a rule line ending in neither a path nor a quote", () => {
    expect(plant('---\npaths:\n  - "src/db/**/*.ts"\n---\n\n- A rule with no source.\n')).toEqual([
      'area.md: no source on "- A rule with no source."',
    ]);
  });

  it("a file with a paths: list and no rules at all", () => {
    expect(plant('---\npaths:\n  - "src/db/**/*.ts"\n---\n\n# Area\n')).toEqual([
      "area.md: no rule lines",
    ]);
  });
});

describe("splitFrontmatter and readPaths", () => {
  it("takes the YAML between the first two markers and leaves the body", () => {
    expect(splitFrontmatter('---\npaths:\n  - "a"\n---\n# Body\n')).toEqual({
      frontmatter: 'paths:\n  - "a"',
      body: "# Body\n",
    });
  });

  it("says null for a file with no frontmatter, rather than reading the first line", () => {
    expect(splitFrontmatter("# Body\n").frontmatter).toBeNull();
    expect(readPaths(null)).toBeNull();
  });

  it("reads the YAML list form", () => {
    expect(readPaths('paths:\n  - "src/**/*.ts"\n  - "drizzle/**"')).toEqual([
      "src/**/*.ts",
      "drizzle/**",
    ]);
  });

  // Claude Code accepts either shape, so a future rule file using the other one is legal
  // and must not read as a file with no paths at all.
  it("reads the comma-separated string form", () => {
    expect(readPaths('paths: "src/**/*.ts, drizzle/**"')).toEqual(["src/**/*.ts", "drizzle/**"]);
  });

  it("stops at the end of the list rather than swallowing the next key", () => {
    expect(readPaths('paths:\n  - "a"\ndescription: not a path')).toEqual(["a"]);
  });

  it("says null when the frontmatter carries no paths key", () => {
    expect(readPaths("description: something")).toBeNull();
  });
});

describe("readSource", () => {
  it("reads a docs/log path", () => {
    expect(readSource("- A rule. — `docs/log/T2.3.md`")).toEqual({
      kind: "path",
      value: "docs/log/T2.3.md",
    });
  });

  it("reads a quoted phrase", () => {
    expect(readSource('- A rule. — "a phrase"')).toEqual({ kind: "quote", value: "a phrase" });
  });

  // A rule sentence may carry its own em dash, so the separator is the last one on the line.
  it("splits on the last em dash, not the first", () => {
    expect(readSource('- A rule — with an aside. — "a phrase"')).toEqual({
      kind: "quote",
      value: "a phrase",
    });
  });

  it("says null for a line ending in neither shape", () => {
    expect(readSource("- A rule with no source.")).toBeNull();
    expect(readSource("- A rule. — `src/db/client.ts`")).toBeNull();
  });

  it("reads only top-level list items as rules", () => {
    expect(ruleLines("# Head\n\n- one\n  - nested\ntext\n- two\n")).toEqual(["- one", "- two"]);
  });
});

describe("matchTracked", () => {
  it("answers the tracked files a pattern reaches", () => {
    expect(matchTracked("src/db/queries/*.ts", { root, tracked })).toContain(
      "src/db/queries/item.ts",
    );
  });

  it("counts no untracked file: a build artifact never answers for a glob", () => {
    expect(matchTracked("node_modules/**/*.ts", { root, tracked })).toEqual([]);
  });

  it("expands braces, as Claude Code does", () => {
    const hits = matchTracked("src/lib/*.{ts,tsx}", { root, tracked });
    expect(hits).toContain("src/lib/stage.ts");
  });

  // Claude Code escapes a literal bracket as `\[`; Node's glob wants `[[]`. A Next route
  // segment is the case that makes the difference real in this repo.
  it("reads Claude Code's bracket escape, which Node's glob spells differently", () => {
    expect(toNodeGlob("src/app/i/\\[key\\]/*.tsx")).toBe("src/app/i/[[]key[]]/*.tsx");
    expect(matchTracked("src/app/i/\\[key\\]/*.tsx", { root, tracked })).toContain(
      "src/app/i/[key]/CheckList.tsx",
    );
  });

  it("matches nothing for a pattern that cannot be read, rather than throwing", () => {
    expect(matchTracked("photos [2024/**", { root, tracked })).toEqual([]);
  });
});

describe("flatten", () => {
  it("folds a hard-wrapped phrase onto one line so it can be quoted", () => {
    expect(flatten("a phrase\n  broken by the wrap")).toBe("a phrase broken by the wrap");
  });
});

// TC5 → AC5. CLAUDE.md's References names the directory, and nothing else in that file moved.
describe("CLAUDE.md", () => {
  const claudeMd = () => readFileSync(join(root, "CLAUDE.md"), "utf8");

  it("names .claude/rules/ under References", () => {
    const section = claudeMd().slice(claudeMd().indexOf("## References"));
    expect(section).toContain(".claude/rules/");
  });

  it("still carries every heading and prohibition it had", () => {
    const text = claudeMd();
    for (const line of [
      "## Stack",
      "## Commands",
      "## Conventions",
      "## Prohibitions",
      "## Done means",
      "## References (read on demand)",
      "Never run `drizzle-kit push` on this project.",
      "Never extend scope beyond the ticket.",
      "@AGENTS.md",
    ]) {
      expect(text).toContain(line);
    }
  });

  // An @-import would load the rules at launch, which is the cost this ticket removes.
  it("does not import the rules", () => {
    expect(claudeMd()).not.toMatch(/@\.claude\/rules/);
  });
});

// TC6 → AC6. The Decisions section opens by pointing at the index.
describe("the build log's Decisions section", () => {
  it("opens with a line naming .claude/rules/", () => {
    const heading = "## Decisions made during the build";
    const body = buildLog.slice(buildLog.indexOf(heading) + heading.length);
    const first = body.split("\n").find((line) => line.trim() !== "");
    expect(first).toContain(".claude/rules/");
  });
});
