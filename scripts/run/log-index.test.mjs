import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BUILD_LOG,
  generate,
  HEADING,
  index,
  INTRO,
  LOG_DIR,
  readDir,
  readEntry,
  replaceSection,
  section,
} from "./log-index.mjs";

const root = join(import.meta.dirname, "..", "..");

// TC2 → AC2. The Tickets done list in docs/build-log.md is a function of docs/log/: what
// the script would write from the directory as it stands is what the file holds.
describe("the committed build log is the generated one", () => {
  it("matches docs/log/ entry for entry", () => {
    const current = readFileSync(join(root, BUILD_LOG), "utf8");
    expect(generate({ dir: join(root, LOG_DIR), buildLog: current })).toBe(current);
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

  it("reads every .md, sorts it, and writes the section into the log", () => {
    writeFileSync(
      join(dir, "T1.1.md"),
      "# T1.1 — later\n_2026-08-22T17:04:27Z · `19e55a8`_\n\nb\n",
    );
    writeFileSync(
      join(dir, "T0.5.md"),
      "# T0.5 — earlier\n_2026-08-22T14:11:32Z · `0cad302`_\n\na\n",
    );
    writeFileSync(join(dir, "notes.txt"), "not an entry\n");
    const out = generate({ dir, buildLog: `${HEADING}\n\nstale\n\n## Next\n\nz\n` });
    expect(out).toBe(
      `${HEADING}\n\n${INTRO}\n\n` +
        "- [T0.5 — earlier](log/T0.5.md) · 2026-08-22 · `0cad302`\n" +
        "- [T1.1 — later](log/T1.1.md) · 2026-08-22 · `19e55a8`\n" +
        "\n## Next\n\nz\n",
    );
  });

  it("refuses the whole run when one file is malformed, rather than dropping it", () => {
    writeFileSync(join(dir, "T0.5.md"), "# T0.5 — fine\n_2026-08-22T14:11:32Z_\n");
    writeFileSync(join(dir, "T9.9.md"), "T9.9 — no heading\n");
    expect(() => generate({ dir, buildLog: `${HEADING}\n` })).toThrow(/T9\.9\.md/);
  });
});
