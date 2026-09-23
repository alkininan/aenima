import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILD_LOG, generate } from "./log-index.mjs";
import { parseHeaderVersion } from "./version-drift.mjs";
import { confined, premerge, withoutGenerated } from "./premerge.mjs";

// T0.36 TC1 → AC1 and TC2 → AC2. Over a real repository: what conflicts, and what a
// resolution leaves behind, are git's to say, and a stubbed runner would only prove the stub
// agrees with itself — the same reason `conflicts.test.mjs` gives.

const BUILD_LOG_TEMPLATE = `# fixture — build log

## Current state

placeholder

## Stack

A hand-written section the generator never touches.

## Tickets done

placeholder

## Decisions made during the build

The passage two branches can genuinely disagree about.
`;

const doc = (name, version) => `<!-- ${name}.md · v${version} · in the repo -->\n\n# ${name}\n`;

describe("premerge over a temporary repository", () => {
  let dir;

  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const write = (name, text) => {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const buildLog = () => readFileSync(join(dir, BUILD_LOG), "utf8");
  /** The build log as a fresh generation would write it for the tree as it stands. */
  const regenerated = () =>
    generate({ dir: join(dir, "docs", "log"), buildLog: buildLog(), root: dir });

  /** A log entry, and the build log rewritten for it — what every ticket's step 8 does. */
  const entry = (id, when) => {
    write(join("docs", "log", `${id}.md`), `# ${id} — a ticket\n_${when}_\n\nIt happened.\n`);
    writeFileSync(join(dir, BUILD_LOG), regenerated());
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-premerge-"));
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "t");
    git("config", "user.email", "t@t");

    mkdirSync(join(dir, "docs", "log"), { recursive: true });
    write(join("docs", "product-spec.md"), doc("product-spec", "1.9"));
    write(join("docs", "design-spec.md"), doc("design-spec", "2.22"));
    write(join("docs", "guidelines.md"), doc("guidelines", "1.20"));
    write(BUILD_LOG, BUILD_LOG_TEMPLATE);
    entry("T0.1", "2026-09-01T10:00:00Z");
    commit("base");

    // Two tickets branch off the same main, and each one's step 8 regenerates the build log.
    git("checkout", "--quiet", "-b", "t9-1");
    entry("T9.1", "2026-09-02T10:00:00Z");
    commit("T9.1");

    git("checkout", "--quiet", "main");
    git("checkout", "--quiet", "-b", "t9-2");
    entry("T9.2", "2026-09-03T10:00:00Z");
    commit("T9.2");

    // The first of them lands. Now t9-2 is the ticket waiting at Review.
    git("checkout", "--quiet", "main");
    git("merge", "--quiet", "--no-ff", "--no-edit", "t9-1");
    git("checkout", "--quiet", "t9-2");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is the conflict this ticket exists for: the branch cannot merge main as it stands", () => {
    // Red without the step — asserted rather than assumed, so a fixture that stopped
    // reproducing the bug fails here instead of passing the tests below for the wrong reason.
    const merged = spawnSync("git", ["merge", "--no-ff", "--no-edit", "main"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(merged.status).not.toBe(0);
    expect(
      spawnSync("git", ["diff", "--name-only", "--diff-filter=U"], {
        cwd: dir,
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe(BUILD_LOG);
  });

  it("merges main in and rebuilds the list from both sides' entries", () => {
    const before = git("rev-parse", "HEAD");
    const result = premerge({ cwd: dir, base: "main", fetch: false });

    expect(result).toMatchObject({ ok: true, branch: "t9-2", merged: true, resolved: [BUILD_LOG] });
    expect(git("rev-parse", "HEAD")).not.toBe(before);
    // A merge commit, never a rebase: the branch's own commit is still in the history.
    expect(git("log", "-1", "--format=%P").split(/\s+/)).toHaveLength(2);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("leaves the build log equal to a fresh generation, holding both tickets", () => {
    premerge({ cwd: dir, base: "main", fetch: false });

    expect(buildLog()).toBe(regenerated());
    expect(buildLog()).toContain("log/T9.1.md");
    expect(buildLog()).toContain("log/T9.2.md");
    // The hand-written sections survive the resolution untouched.
    expect(buildLog()).toContain("The passage two branches can genuinely disagree about.");
  });

  it("does nothing to a branch that already carries main", () => {
    git("merge", "--quiet", "--no-ff", "--no-edit", "-X", "ours", "main");
    const head = git("rev-parse", "HEAD");

    expect(premerge({ cwd: dir, base: "main", fetch: false })).toMatchObject({
      ok: true,
      merged: false,
      resolved: [],
      head,
    });
  });

  it("refuses a conflict in a file nothing regenerates, and pushes nothing", () => {
    const head = git("rev-parse", "HEAD");
    write("notes.md", "what the ticket says\n");
    commit("t9-2 notes");
    git("checkout", "--quiet", "main");
    write("notes.md", "what main says\n");
    commit("main notes");
    git("checkout", "--quiet", "t9-2");
    const branchHead = git("rev-parse", "HEAD");

    const result = premerge({ cwd: dir, base: "main", fetch: false });

    expect(result.ok).toBe(false);
    expect(result.files).toContain("notes.md");
    expect(result.why).toContain("notes.md");
    // Nothing committed, nothing half-merged: the checkout is as it was found.
    expect(git("rev-parse", "HEAD")).toBe(branchHead);
    expect(git("rev-parse", "HEAD")).not.toBe(head);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("refuses a build log whose conflict is outside the generated sections", () => {
    const rewrite = (line) => {
      writeFileSync(
        join(dir, BUILD_LOG),
        buildLog().replace("The passage two branches can genuinely disagree about.", line),
      );
    };
    rewrite("What the ticket decided.");
    commit("t9-2 decision");
    git("checkout", "--quiet", "main");
    rewrite("What main decided.");
    commit("main decision");
    git("checkout", "--quiet", "t9-2");
    const branchHead = git("rev-parse", "HEAD");

    const result = premerge({ cwd: dir, base: "main", fetch: false });

    expect(result.ok).toBe(false);
    expect(result.files).toEqual([BUILD_LOG]);
    expect(result.why).toContain("outside its generated sections");
    expect(git("rev-parse", "HEAD")).toBe(branchHead);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("refuses a dirty checkout rather than merging over it", () => {
    write("notes.md", "unsaved\n");

    expect(premerge({ cwd: dir, base: "main", fetch: false })).toMatchObject({
      ok: false,
      merged: false,
    });
  });
});

describe("confined", () => {
  const log = (state, done, written) =>
    `# t\n\n## Current state\n\n${state}\n\n## Tickets done\n\n${done}\n\n## Decisions\n\n${written}\n`;

  it("reads two different generated lists over the same words as the same file", () => {
    expect(confined(log("a", "one", "same"), log("b", "two", "same"))).toBe(true);
  });

  it("reads a difference in the written part as a real one", () => {
    expect(confined(log("a", "one", "mine"), log("a", "one", "theirs"))).toBe(false);
  });

  it("reads a file missing its headings as not confined", () => {
    expect(confined("# t\n\nno headings here\n", log("a", "one", "same"))).toBe(false);
  });

  it("blanks every generated body and keeps the rest", () => {
    // Distinctive sentinels: "one" would be found inside the heading "Tickets done".
    const stripped = withoutGenerated(log("stamped-state", "listed-entry", "kept"));

    expect(stripped).not.toContain("listed-entry");
    expect(stripped).not.toContain("stamped-state");
    expect(stripped).toContain("kept");
    expect(stripped).toContain("## Tickets done");
  });
});

// T0.36 TC3 → AC3: the protocol says the step at 0 and 9, and the version is bumped. The
// guidelines are the record and the skill is what a run reads; a step in one and not the
// other is a protocol nobody follows or a run nobody wrote down.
describe("the protocol carries the step", () => {
  const root = join(import.meta.dirname, "..", "..");
  const guidelines = readFileSync(join(root, "docs", "guidelines.md"), "utf8");
  const skill = readFileSync(join(root, ".claude", "skills", "ticket", "SKILL.md"), "utf8");

  /** One row of §5's step table: from its number to the next step's. */
  const step = (number) =>
    guidelines
      .split(/^## 5\. Run protocol$/m)[1]
      ?.match(new RegExp(`^${number} {2}\\w[\\s\\S]*?(?=\\n\\d {2}\\w|\\n\`\`\`)`, "m"))?.[0] ?? "";

  it("names premerge.mjs in §5 step 0, where a merge word is assessed", () => {
    expect(step(0)).toContain("premerge.mjs");
  });

  it("names premerge.mjs in §5 step 9, where the run merges its own work", () => {
    expect(step(9)).toContain("premerge.mjs");
  });

  it("bumps the guidelines version past the one this ticket was cut against", () => {
    expect(parseHeaderVersion(guidelines)).toBe("1.24");
  });

  it("gives the skill the step at both places a merge happens", () => {
    const [preflight = "", close = ""] = skill.split(/^## 9 Close$/m);
    expect(preflight).toContain("node scripts/run/premerge.mjs");
    expect(close).toContain("node scripts/run/premerge.mjs");
  });
});
