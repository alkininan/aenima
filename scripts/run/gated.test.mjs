import { describe, expect, it } from "vitest";

import { gatedDiff, gatedPaths, isGatedPath } from "./gated.mjs";
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
