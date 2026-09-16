import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { gatedDiff, gatedDiffOf, gatedPaths, isGatedPath } from "./gated.mjs";
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
