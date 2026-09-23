import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseHeaderVersion } from "./version-drift.mjs";

import {
  BUILD_LOG,
  CURRENT_DOCS,
  CURRENT_HEADING,
  CURRENT_INTRO,
  currentState,
  generate,
  HEADING,
  index,
  INTRO,
  LOG_DIR,
  newest,
  readDir,
  readEntry,
  replaceSection,
  section,
  STANDING,
  versions,
} from "./log-index.mjs";

const root = join(import.meta.dirname, "..", "..");

// T0.8's TC2 → its AC2, and T0.32's TC3 → its AC3. Both generated sections of
// docs/build-log.md are a function of the repo: what the script would write from docs/log/
// and from the documents' own headers is what the file holds, so a hand edit to either
// block — a version, the newest entry, a standing line — turns this red.
describe("the committed build log is the generated one", () => {
  it("matches docs/log/ and the documents' own headers, section for section", () => {
    const current = readFileSync(join(root, BUILD_LOG), "utf8");
    expect(generate({ dir: join(root, LOG_DIR), buildLog: current, root })).toBe(current);
  });

  it("has one list line per file, and every migrated entry is a file", () => {
    const entries = readDir(join(root, LOG_DIR));
    const current = readFileSync(join(root, BUILD_LOG), "utf8");
    const lines = current.split("\n").filter((line) => /^- \[.+\]\(log\/.+\.md\)/.test(line));
    expect(lines).toHaveLength(entries.length);
    for (const id of ["T0.1", "T1.3", "T2.3", "T2.5", "T0.7", "T0.9", "T0.97", "deploy"]) {
      expect(entries.map((e) => e.id)).toContain(id);
    }
  });
});

describe("readEntry", () => {
  it("reads the title from line one and the stamp from line two", () => {
    expect(
      readEntry("T0.9.md", "# T0.9 — Run fixes\n_2026-09-09T17:02:23Z · `666f152`_\n\nbody\n"),
    ).toEqual({
      id: "T0.9",
      title: "T0.9 — Run fixes",
      when: "2026-09-09T17:02:23Z",
      commit: "666f152",
    });
  });

  it("allows a stamp with no commit", () => {
    expect(readEntry("deploy.md", "# Deploy\n_2026-08-23T18:40:12Z_\n").commit).toBeNull();
  });

  it("refuses a file missing either line, naming the file", () => {
    expect(() => readEntry("x.md", "no heading\n_2026-08-23T18:40:12Z_\n")).toThrow(
      /x\.md: first line/,
    );
    expect(() => readEntry("x.md", "# Title\n2026-08-23 · `abc`\n")).toThrow(/x\.md: second line/);
    expect(() => readEntry("x.md", "# Title\n")).toThrow(/x\.md: second line/);
  });
});

describe("index and section", () => {
  const entries = [
    { id: "T0.10", title: "T0.10 — Schedule", when: "2026-09-10T10:00:00Z", commit: "abc1234" },
    { id: "T0.9", title: "T0.9 — Run fixes", when: "2026-09-09T17:02:23Z", commit: "666f152" },
    { id: "T0.97", title: "T0.97 — Smoke C", when: "2026-09-09T17:24:50Z", commit: null },
    { id: "T0.2", title: "T0.2 — tokens", when: "2026-09-09T17:24:50Z", commit: "bdbaab6" },
  ];

  it("lists oldest first, ties by id in natural order, one line each", () => {
    expect(index(entries)).toEqual([
      "- [T0.9 — Run fixes](log/T0.9.md) · 2026-09-09 · `666f152`",
      "- [T0.2 — tokens](log/T0.2.md) · 2026-09-09 · `bdbaab6`",
      "- [T0.97 — Smoke C](log/T0.97.md) · 2026-09-09",
      "- [T0.10 — Schedule](log/T0.10.md) · 2026-09-10 · `abc1234`",
    ]);
  });

  it("puts the intro above the list", () => {
    expect(section(entries.slice(0, 1))).toBe(
      `${INTRO}\n\n- [T0.10 — Schedule](log/T0.10.md) · 2026-09-10 · \`abc1234\`\n`,
    );
  });
});

describe("replaceSection", () => {
  const log = `# log\n\n## Current state\n\nx\n\n${HEADING}\n\nold line\nold line 2\n\n## Decisions\n\ny\n`;

  it("replaces only the body between the heading and the next section", () => {
    expect(replaceSection(log, "new body\n")).toBe(
      `# log\n\n## Current state\n\nx\n\n${HEADING}\n\nnew body\n\n## Decisions\n\ny\n`,
    );
  });

  it("replaces to the end when the section is last", () => {
    expect(replaceSection(`a\n\n${HEADING}\n\nold\n`, "new\n")).toBe(`a\n\n${HEADING}\n\nnew\n`);
  });

  it("refuses a log with no Tickets done heading", () => {
    expect(() => replaceSection("# log\n", "x")).toThrow(/no "## Tickets done" heading/);
  });
});

describe("generate over a directory", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-log-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Headers in the two shapes the repo really uses, so the fixture exercises the parser.
  const readDoc = (path) =>
    ({
      "docs/product-spec.md": "# aenima — Product Specification v1.8\n",
      "docs/design-spec.md": "# aenima — Design Specification v2.22 (web)\n",
      "docs/guidelines.md": "<!-- guidelines.md · v1.20 · in the repo -->\n",
    })[path] ??
    (() => {
      throw new Error(`no such document: ${path}`);
    })();

  it("reads every .md, sorts it, and writes both sections into the log", () => {
    writeFileSync(
      join(dir, "T1.1.md"),
      "# T1.1 — later\n_2026-08-22T17:04:27Z · `19e55a8`_\n\nb\n",
    );
    writeFileSync(
      join(dir, "T0.5.md"),
      "# T0.5 — earlier\n_2026-08-22T14:11:32Z · `0cad302`_\n\na\n",
    );
    writeFileSync(join(dir, "notes.txt"), "not an entry\n");
    const out = generate({
      dir,
      readDoc,
      buildLog: `${CURRENT_HEADING}\n\nstale state\n\n${HEADING}\n\nstale\n\n## Next\n\nz\n`,
    });
    expect(out).toBe(
      `${CURRENT_HEADING}\n\n${CURRENT_INTRO}\n\n` +
        "**Specs:** product-spec v1.8 · design-spec v2.22 · guidelines v1.20\n" +
        "**Newest entry:** [T1.1 — later](log/T1.1.md) · 2026-08-22 · `19e55a8`\n" +
        `${STANDING.join("\n")}\n` +
        `\n${HEADING}\n\n${INTRO}\n\n` +
        "- [T0.5 — earlier](log/T0.5.md) · 2026-08-22 · `0cad302`\n" +
        "- [T1.1 — later](log/T1.1.md) · 2026-08-22 · `19e55a8`\n" +
        "\n## Next\n\nz\n",
    );
  });

  it("refuses the whole run when one file is malformed, rather than dropping it", () => {
    writeFileSync(join(dir, "T0.5.md"), "# T0.5 — fine\n_2026-08-22T14:11:32Z_\n");
    writeFileSync(join(dir, "T9.9.md"), "T9.9 — no heading\n");
    expect(() =>
      generate({ dir, readDoc, buildLog: `${CURRENT_HEADING}\n\n${HEADING}\n` }),
    ).toThrow(/T9\.9\.md/);
  });

  it("refuses a document whose header carries no version, by name", () => {
    writeFileSync(join(dir, "T0.5.md"), "# T0.5 — fine\n_2026-08-22T14:11:32Z_\n");
    const blind = (path) => (path === "docs/guidelines.md" ? "# no version\n" : readDoc(path));
    expect(() =>
      generate({ dir, readDoc: blind, buildLog: `${CURRENT_HEADING}\n\n${HEADING}\n` }),
    ).toThrow(/docs\/guidelines\.md: no version in its header/);
  });
});

// TC1 → AC1. Current state stamps the three documents at the versions their own headers
// carry, and names the newest entry under docs/log/ with its date.
describe("the committed Current state", () => {
  const current = () => readFileSync(join(root, BUILD_LOG), "utf8");
  // The same parser the script uses, for the reason AC5 gives: a copy of its regex and its
  // header window here would be the second parser, one file over, and would drift silently.
  const header = (path) => parseHeaderVersion(readFileSync(join(root, path), "utf8"));

  it("names product-spec, design-spec and guidelines at their header versions", () => {
    const specs = /^\*\*Specs:\*\* (.+)$/m.exec(current())?.[1];
    expect(specs).toBe(
      `product-spec v${header("docs/product-spec.md")} · ` +
        `design-spec v${header("docs/design-spec.md")} · ` +
        `guidelines v${header("docs/guidelines.md")}`,
    );
  });

  it("names the newest docs/log/ entry with its date and commit", () => {
    const entries = readDir(join(root, LOG_DIR));
    const top = [...entries].sort(
      (a, b) => a.when.localeCompare(b.when) || a.id.localeCompare(b.id, "en", { numeric: true }),
    )[entries.length - 1];
    const line = /^\*\*Newest entry:\*\* (.+)$/m.exec(current())?.[1];
    expect(line).toBe(
      `[${top.title}](log/${top.id}.md) · ${top.when.slice(0, 10)}` +
        (top.commit ? ` · \`${top.commit}\`` : ""),
    );
  });

  it("keeps the two lines the repo cannot derive", () => {
    expect(current()).toContain("**Repo:** github.com/alkininan/aenima");
    expect(current()).toContain("**Deployed:** yes — **aeni.ma** on Vercel");
  });

  // TC2 → AC2. The board owns the queue and the roadmap owns the phases.
  it("carries no Phase and no Next ticket line", () => {
    const block = current().slice(
      current().indexOf("## Current state"),
      current().indexOf("## Stack"),
    );
    expect(block).not.toMatch(/^\*\*Phase:/m);
    expect(block).not.toMatch(/^\*\*Next ticket:/m);
  });
});

// TC4 → AC4. Every narrative sentence that left Current state is held by a docs/log/ entry
// or by the document that made the claim. One assertion per sentence.
describe("the narrative that left Current state", () => {
  // Line wrapping is typesetting: a sentence that survived the move reads the same whether
  // the file broke it at column 90 or not, so both sides are compared on one line.
  const read = (path) => readFileSync(join(root, path), "utf8").replace(/\s+/g, " ");

  it("keeps v1.4's two rulings and where they landed", () => {
    expect(read("docs/log/T2.2.md")).toContain("product-spec v1.4, which landed just ahead of it");
    expect(read("docs/product-spec.md")).toContain("v1.4: The code node law");
  });

  it("keeps the form language having been settled over two runs against the sign-in flow", () => {
    expect(read("docs/log/design-spec-v2.7-v2.12.md")).toContain(
      "settled over two runs against real use of the sign-in flow",
    );
  });

  it("keeps every v2.3–v2.6 item across T0.5 and T0.6", () => {
    const both = read("docs/log/T0.5.md") + read("docs/log/T0.6.md");
    for (const item of [
      "48h fields",
      "floating labels bound at every moment",
      "label zone and helper line",
      "subtitle slot",
      "step header",
      "one-text fields",
      "the focus split",
      "flag-slow validation",
    ]) {
      expect(both).toContain(item);
    }
  });

  it("keeps the v2.7–v2.12 details the entry did not carry", () => {
    const entry = read("docs/log/design-spec-v2.7-v2.12.md");
    for (const item of [
      "#08090C base",
      "`--grad-primary`",
      "field sheen",
      "press squish",
      "a helper line carrying only its own field's errors",
    ]) {
      expect(entry).toContain(item);
    }
  });

  it("keeps v2.13–v2.15 coming out of the first surfaces rather than the sign-in flow", () => {
    expect(read("docs/log/design-spec-v2.13-v2.15.md")).toContain(
      "came out of the first surfaces rather than the sign-in flow",
    );
  });

  it("keeps the closed-and-matching claim, as a fact about the moment it stamped", () => {
    // The design spec says the closure half of itself, at its own current version. Nothing
    // in the repo has ever said it of the product spec, and nothing has ever said the code
    // matches either document — so the clause is recorded once, in this ticket's own entry.
    expect(read("docs/design-spec.md")).toContain("complete and closed: no open items");
    expect(read("docs/log/T0.32.md")).toContain(
      "both documents stood complete and closed and the code matched them",
    );
  });
});

// TC5 → AC5. One parser, not a second: the versions Current state prints are whatever
// `version-drift.mjs`'s `parseHeaderVersion` answers for the same header text, so a mutation
// of that function moves both scripts. The source assertion is what keeps a second regex
// from growing here later — behaviour alone cannot see a copy that currently agrees.
describe("versions reads through version-drift's parser", () => {
  it("answers exactly what parseHeaderVersion answers, header shape for header shape", () => {
    const headers = {
      "docs/product-spec.md": "# aenima — Product Specification v1.8\n",
      "docs/design-spec.md": "# aenima — Design Specification v2.22 (web)\n",
      // The comment shape, and one that names a later version as history below the first.
      "docs/guidelines.md": "<!-- guidelines.md · v1.20 · in the repo\n     v1.19 was … -->\n",
    };
    // Literal, not `parseHeaderVersion(...)` on the other side: comparing the function to
    // itself moves both sides together and answers nothing about the parser.
    expect(versions((path) => headers[path])).toEqual([
      { doc: "product-spec", version: "1.8" },
      { doc: "design-spec", version: "2.22" },
      { doc: "guidelines", version: "1.20" },
    ]);
    expect(CURRENT_DOCS).toEqual(["product-spec", "design-spec", "guidelines"]);
  });

  it("defines no version pattern of its own", () => {
    const source = readFileSync(join(import.meta.dirname, "log-index.mjs"), "utf8");
    expect(source).toContain('import { DOCS, parseHeaderVersion } from "./version-drift.mjs"');
    // A second parser needs a version-shaped pattern. The regexes here read a log file's
    // own two lines and nothing else, so this string appearing means a copy has grown.
    expect(source).not.toContain("\\d+\\.\\d+");
  });
});

describe("currentState and newest", () => {
  const entries = [
    { id: "T0.9", title: "T0.9 — Run fixes", when: "2026-09-09T17:02:23Z", commit: "666f152" },
    { id: "T0.97", title: "T0.97 — Smoke C", when: "2026-09-09T17:24:50Z", commit: null },
    { id: "T0.2", title: "T0.2 — tokens", when: "2026-09-09T17:24:50Z", commit: "bdbaab6" },
  ];

  it("takes the newest by stamp, ties by id in natural order", () => {
    expect(newest(entries).id).toBe("T0.97");
  });

  it("says null for an empty directory rather than guessing", () => {
    expect(newest([])).toBeNull();
  });

  it("prints the intro, the specs, the newest entry and the standing lines", () => {
    expect(currentState({ entries, versions: [{ doc: "product-spec", version: "1.8" }] })).toBe(
      `${CURRENT_INTRO}\n\n` +
        "**Specs:** product-spec v1.8\n" +
        "**Newest entry:** [T0.97 — Smoke C](log/T0.97.md) · 2026-09-09\n" +
        `${STANDING.join("\n")}\n`,
    );
  });

  it("says so rather than inventing an entry when the directory is empty", () => {
    expect(currentState({ entries: [], versions: [] })).toContain("**Newest entry:** none yet");
  });
});
