import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  consumedApplies,
  gatedDiff,
  gatedDiffOf,
  gatedPaths,
  isGatedPath,
  migrationTag,
} from "./gated.mjs";
import { migrationCheck, MIGRATIONS_DIR } from "./migration-check.mjs";

// T0.21 TC1 → AC1, TC2 → AC2 and TC5 → AC5. T0.16 gated whole paths; this replaces all but
// one of them with the measurement in loosening.mjs. What is left here is the migration: a
// schema change is the human's call, and a diff that adds one waits for the word either way.
describe("isGatedPath", () => {
  it("gates a migration and nothing else", () => {
    // TC5 → AC5
    for (const path of [
      "drizzle/0015_x.sql",
      "drizzle/meta/_journal.json",
      "drizzle/0001_policies.sql",
    ]) {
      expect(isGatedPath(path), path).toBe(true);
    }
  });

  it("lets the specs through — the human owns those upstream, in the ticket", () => {
    // TC1 → AC1
    for (const path of ["docs/product-spec.md", "docs/design-spec.md", "docs/schema.md"]) {
      expect(isGatedPath(path), path).toBe(false);
    }
  });

  it("lets a routine harness change through — gating is by what a diff does, not where", () => {
    // TC2 → AC2
    for (const path of [
      ".claude/settings.json",
      ".claude/skills/ticket/SKILL.md",
      "scripts/hooks/guard.mjs",
      "scripts/run/notion.mjs",
      "scripts/run/notion.test.mjs",
      ".worktreeinclude",
      ".gitignore",
      "package.json",
      "src/app/page.tsx",
      "docs/guidelines.md",
    ]) {
      expect(isGatedPath(path), path).toBe(false);
    }
  });

  it("does not read a name that merely contains the directory as gated", () => {
    expect(isGatedPath("src/drizzle/thing.ts")).toBe(false);
    expect(isGatedPath("drizzler/x.sql")).toBe(false);
    expect(MIGRATIONS_DIR).toBe("drizzle/");
  });

  // TC5 → AC5. Step 6 and step 9 ask about the same directory, so they read one constant:
  // a diff that adds a migration stops at Decision for `apply`, and the ticket that carries
  // it is still gated at Review. Two halves of one rule, and neither moved with T0.21.
  it("stops a migration at Decision and gates the same file at Review", () => {
    const diff = { status: 0, stdout: "A\tdrizzle/0022_x.sql\nM\tsrc/a.ts\n" };
    expect(migrationCheck("r", { run: () => diff })).toMatchObject({
      waiting: true,
      files: ["drizzle/0022_x.sql"],
    });
    expect(isGatedPath("drizzle/0022_x.sql")).toBe(true);
  });
});

describe("gatedPaths and gatedDiff", () => {
  it("lists the migrations of a diff, in the diff's order", () => {
    // TC5 → AC5
    const files = ["src/a.ts", "drizzle/0015.sql", "package.json", "drizzle/meta/_journal.json"];
    expect(gatedPaths(files)).toEqual(["drizzle/0015.sql", "drizzle/meta/_journal.json"]);
  });

  it("is ok when the diff adds no migration and weakens nothing", () => {
    // TC1 → AC1 and TC2 → AC2: a spec-only diff and a routine harness diff both self-merge.
    const result = gatedDiff({
      files: ["docs/product-spec.md", "scripts/run/health.mjs", "package.json"],
      weakened: [],
    });
    expect(result.ok).toBe(true);
    expect(result.gated).toEqual([]);
    expect(result.reasons).toEqual([]);
  });

  it("names the migration it adds, and what would ungate it", () => {
    // TC5 → AC5
    const result = gatedDiff({ files: ["drizzle/0022_x.sql"], weakened: [] });
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].rule).toBe("it adds the migration drizzle/0022_x.sql");
    expect(result.reasons[0].ungate).toMatch(/applied by hand/);
    expect(result.gated).toEqual(["it adds the migration drizzle/0022_x.sql"]);
  });

  it("carries a weakening through with its own reason, migrations first", () => {
    // TC3 → AC3: the measurement's reasons reach the caller that writes the comment.
    const result = gatedDiff({
      files: ["drizzle/0022_x.sql", "scripts/hooks/guard.mjs"],
      weakened: [{ rule: "the guard no longer refuses pnpm db:push", ungate: "restore the rule" }],
    });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual([
      "it adds the migration drizzle/0022_x.sql",
      "the guard no longer refuses pnpm db:push",
    ]);
  });
});

// Review pass 1, Should 5: `gatedDiffOf` is the function the guard's second door and the
// skill's step 9 both call, and it is where the diff, the migrations and the measurement
// meet. The repository below is the same shape as a ticket branch: `main`, then one commit.
describe("gatedDiffOf over a repository", () => {
  const made = [];
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });

  const git = (args, cwd) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  function branchWith(write) {
    const root = join(import.meta.dirname, "..", "..");
    const dir = mkdtempSync(join(tmpdir(), "aenima-gated-test-"));
    made.push(dir);
    cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
    mkdirSync(join(dir, ".claude"), { recursive: true });
    cpSync(join(root, ".claude", "settings.json"), join(dir, ".claude", "settings.json"));
    cpSync(join(root, "package.json"), join(dir, "package.json"));
    git(["init", "-q", "-b", "main"], dir);
    git(["config", "user.email", "t@example.com"], dir);
    git(["config", "user.name", "T"], dir);
    git(["add", "-A"], dir);
    git(["commit", "-qm", "before"], dir);
    git(["checkout", "-qb", "work"], dir);
    write(dir);
    git(["add", "-A"], dir);
    git(["commit", "-qm", "after"], dir);
    return dir;
  }

  it(
    "reads a diff that adds no migration and weakens nothing as the run's own",
    { timeout: 60_000 },
    () => {
      // TC1 → AC1 and TC2 → AC2, end to end through the function the guard calls: a spec change
      // beside a routine harness change, and neither waits for the word.
      const dir = branchWith((at) => {
        mkdirSync(join(at, "docs"), { recursive: true });
        writeFileSync(join(at, "docs/product-spec.md"), "# a spec the human owns upstream\n");
        writeFileSync(join(at, "scripts/run/notes.md"), "a new file\n");
      });
      const result = gatedDiffOf({ cwd: dir, range: "main...HEAD" });
      expect(result.files).toEqual(["docs/product-spec.md", "scripts/run/notes.md"]);
      expect(result.ok).toBe(true);
      expect(result.gated).toEqual([]);
    },
  );

  // T0.26 TC1 → AC1, end to end: the tags the thread answered with reach the judgement, so a
  // migration the human has already applied is not a second word to ask for.
  it("lets a migration through on the tag its thread says is applied", { timeout: 60_000 }, () => {
    const dir = branchWith((at) => {
      mkdirSync(join(at, "drizzle", "meta"), { recursive: true });
      writeFileSync(join(at, "drizzle/0022_x.sql"), "select 1;\n");
      writeFileSync(join(at, "drizzle/meta/_journal.json"), '{"entries":[]}\n');
    });
    const waiting = gatedDiffOf({ cwd: dir, range: "main...HEAD" });
    expect(waiting.ok).toBe(false);
    expect(waiting.gated).toHaveLength(2);

    const spent = gatedDiffOf({ cwd: dir, range: "main...HEAD", applied: ["0022_x"] });
    expect(spent.ok).toBe(true);
    expect(spent.gated).toEqual([]);
  });

  it("names the migration a diff adds, from the diff itself", { timeout: 60_000 }, () => {
    // TC5 → AC5, end to end.
    const dir = branchWith((at) => {
      mkdirSync(join(at, "drizzle"), { recursive: true });
      writeFileSync(join(at, "drizzle/0022_x.sql"), "select 1;\n");
    });
    const result = gatedDiffOf({ cwd: dir, range: "main...HEAD" });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual(["it adds the migration drizzle/0022_x.sql"]);
  });
});

// T0.26 TC1 → AC1, TC2 → AC2, TC3 → AC3. The migration gate narrows: a file whose `apply`
// the thread has already granted and spent is a decision already made, so the code that uses
// it stops waiting for a second word about it. Everything else about the gate is unchanged.
describe("a consumed apply ungates its own migration", () => {
  const FILES = ["drizzle/0016_opportunity_keys.sql", "drizzle/meta/_journal.json"];

  it("reads a migration's tag off its path, and nothing else's", () => {
    expect(migrationTag("drizzle/0016_opportunity_keys.sql")).toBe("0016_opportunity_keys");
    expect(migrationTag("drizzle/meta/_journal.json")).toBe(null);
    expect(migrationTag("drizzle/meta/0001_snapshot.json")).toBe(null);
    expect(migrationTag("src/db/0016_opportunity_keys.sql")).toBe(null);
  });

  it("lets the migration and its journal entry through once the apply is spent", () => {
    // TC1 → AC1: T1.4's own diff, after `0016` was applied from the branch.
    const result = gatedDiff({ files: FILES, weakened: [], applied: ["0016_opportunity_keys"] });
    expect(result.ok).toBe(true);
    expect(result.gated).toEqual([]);
  });

  it("gates both files while no apply has been spent", () => {
    // TC2 → AC2: the shape T1.4 and T3.1 both sat in, unchanged.
    const result = gatedDiff({ files: FILES, weakened: [], applied: [] });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual([
      "it adds the migration drizzle/0016_opportunity_keys.sql",
      "it adds the migration drizzle/meta/_journal.json",
    ]);
  });

  it("defaults to gated when nothing says an apply was spent", () => {
    // TC2 → AC2: the field is absent on every caller that has not read a thread.
    expect(gatedDiff({ files: FILES, weakened: [] }).ok).toBe(false);
  });

  it("does not let one migration's apply through for another's", () => {
    // TC3 → AC3: T3.1's `0015` was applied days before T1.4's `0016`, on another thread and
    // another branch. A gate that read "some apply" would have merged this one on it.
    const result = gatedDiff({ files: FILES, weakened: [], applied: ["0015_refinement_round"] });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual([
      "it adds the migration drizzle/0016_opportunity_keys.sql",
      "it adds the migration drizzle/meta/_journal.json",
    ]);
  });

  it("keeps the journal gated while any migration beside it is still waiting", () => {
    // TC3 → AC3: the journal is the record of the diff's own migrations, so it goes only
    // when every one of them has.
    const result = gatedDiff({
      files: ["drizzle/0017_a.sql", "drizzle/0018_b.sql", "drizzle/meta/_journal.json"],
      weakened: [],
      applied: ["0017_a"],
    });
    expect(result.gated).toEqual([
      "it adds the migration drizzle/0018_b.sql",
      "it adds the migration drizzle/meta/_journal.json",
    ]);
  });

  it("lets a snapshot through with the migration it records", () => {
    // TC1 → AC1: `pnpm db:generate` is how CLAUDE.md says to make a migration, and it writes
    // a snapshot beside the journal. A diff that kept it gated would keep the whole ticket
    // waiting for a word its migration had already been given.
    const result = gatedDiff({
      files: [
        "drizzle/0022_x.sql",
        "drizzle/meta/_journal.json",
        "drizzle/meta/0022_snapshot.json",
      ],
      weakened: [],
      applied: ["0022_x"],
    });
    expect(result.ok).toBe(true);
    expect(result.gated).toEqual([]);
  });

  it("keeps a snapshot gated while its migration is still waiting", () => {
    // TC2 → AC2
    const result = gatedDiff({
      files: ["drizzle/0022_x.sql", "drizzle/meta/0022_snapshot.json"],
      weakened: [],
      applied: [],
    });
    expect(result.gated).toEqual([
      "it adds the migration drizzle/0022_x.sql",
      "it adds the migration drizzle/meta/0022_snapshot.json",
    ]);
  });

  it("does not ungate a journal that stands on its own", () => {
    // TC3 → AC3: with no migration in the diff there is nothing an apply could have been for.
    const result = gatedDiff({
      files: ["drizzle/meta/_journal.json"],
      weakened: [],
      applied: ["0016_opportunity_keys"],
    });
    expect(result.gated).toEqual(["it adds the migration drizzle/meta/_journal.json"]);
  });

  it("leaves a weakening gated whatever the thread says about migrations", () => {
    // TC2 → AC2: the apply answers the schema question and nothing else.
    const result = gatedDiff({
      files: FILES,
      weakened: [{ rule: "the guard no longer refuses pnpm db:push", ungate: "restore the rule" }],
      applied: ["0016_opportunity_keys"],
    });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual(["the guard no longer refuses pnpm db:push"]);
  });
});

// T0.26 TC1 → AC1 and TC2 → AC2, the run's own half. AC1 is the diff self-merging, and the
// self-merge is the run reading `ok: true` from this command at step 9 — the guard's door
// reads the tags off `verify`'s fetch, and nothing else reads them from a command line. Every
// path that cannot establish what the thread says answers with no tags, because a migration
// nobody could read a thread about is gated exactly as it was.
describe("consumedApplies", () => {
  const marker = () => ({ task: "T0.26", page: "page-1", branch: "t0-26" });
  const board = () => ({ prefix: "⟡ ", tasks_ds: "ds" });
  const spent = [
    {
      text: "⟡ This change adds a migration, drizzle/0016_opportunity_keys.sql, and applying it to the shared database is your call.",
      created_time: "2026-09-21T10:00:00Z",
    },
    { text: "apply", created_time: "2026-09-21T12:13:00Z" },
    {
      text: "⟡ Applied 0016_opportunity_keys (idx 16) to the shared database. The ticket picks up from where it stopped.",
      created_time: "2026-09-21T12:16:00Z",
    },
  ];
  const deps = (extra = {}) => ({
    marker,
    token: () => "t",
    board,
    comments: async () => spent,
    ...extra,
  });

  it("answers with the tags the claimed task's thread says are spent", async () => {
    // TC1 → AC1
    expect(await consumedApplies({ deps: deps() })).toEqual({
      tags: ["0016_opportunity_keys"],
      why: null,
    });
  });

  it("answers with nothing, and says why, when no marker names a claimed task", async () => {
    // TC2 → AC2
    const result = await consumedApplies({ deps: deps({ marker: () => null }) });
    expect(result.tags).toEqual([]);
    expect(result.why).toContain("no run marker");
  });

  it("answers with nothing when the marker names no page", async () => {
    // TC2 → AC2
    const result = await consumedApplies({ deps: deps({ marker: () => ({ task: "T0.26" }) }) });
    expect(result.tags).toEqual([]);
    expect(result.why).toContain("no run marker");
  });

  it("answers with nothing when the token is not there to read the board with", async () => {
    // TC2 → AC2
    const result = await consumedApplies({ deps: deps({ token: () => null }) });
    expect(result.tags).toEqual([]);
    expect(result.why).toContain("NOTION_TOKEN");
  });

  it("answers with nothing when the board file cannot be read", async () => {
    // TC2 → AC2
    const result = await consumedApplies({
      deps: deps({
        board: () => {
          throw new Error("no board.json");
        },
      }),
    });
    expect(result.tags).toEqual([]);
    expect(result.why).toContain("no board.json");
  });

  it("answers with nothing when the thread itself will not load", async () => {
    // TC2 → AC2: the API refusing is not a licence to merge.
    const result = await consumedApplies({
      deps: deps({
        comments: async () => {
          throw new Error("429 rate limited");
        },
      }),
    });
    expect(result.tags).toEqual([]);
    expect(result.why).toContain("429 rate limited");
  });

  it("answers with nothing when the thread carries no spent apply", async () => {
    // TC2 → AC2
    expect(await consumedApplies({ deps: deps({ comments: async () => [spent[0]] }) })).toEqual({
      tags: [],
      why: null,
    });
  });
});
