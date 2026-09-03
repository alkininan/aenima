import { describe, expect, it } from "vitest";

import { addedMigrations, migrationCheck } from "./migration-check.mjs";

describe("addedMigrations", () => {
  it("finds an added migration", () => {
    expect(addedMigrations("A\tdrizzle/0013_add_runs.sql")).toEqual(["drizzle/0013_add_runs.sql"]);
  });

  it("ignores a modified one — editing prose in an applied migration is not a schema change", () => {
    expect(addedMigrations("M\tdrizzle/0001_policies.sql")).toEqual([]);
  });

  it("ignores a deleted one", () => {
    expect(addedMigrations("D\tdrizzle/0001_policies.sql")).toEqual([]);
  });

  it("ignores an added file elsewhere in the tree", () => {
    expect(addedMigrations("A\tsrc/db/queries/runs.ts")).toEqual([]);
  });

  it("ignores an added non-sql file inside the migrations directory", () => {
    expect(addedMigrations("A\tdrizzle/meta/_journal.json")).toEqual([]);
  });

  it("picks the migrations out of a mixed diff", () => {
    const diff = [
      "M\tsrc/db/schema/tables.ts",
      "A\tdrizzle/0013_add_runs.sql",
      "A\tdrizzle/0014_backfill.sql",
      "A\tdocs/reports/T9.1.md",
    ].join("\n");
    expect(addedMigrations(diff)).toEqual([
      "drizzle/0013_add_runs.sql",
      "drizzle/0014_backfill.sql",
    ]);
  });

  it("reads an empty diff as no migrations", () => {
    expect(addedMigrations("")).toEqual([]);
    expect(addedMigrations(null)).toEqual([]);
  });
});

describe("migrationCheck", () => {
  it("waits when the diff adds one", () => {
    const run = () => ({ status: 0, stdout: "A\tdrizzle/0013_add_runs.sql" });
    expect(migrationCheck("origin/main...HEAD", { run })).toMatchObject({
      waiting: true,
      files: ["drizzle/0013_add_runs.sql"],
    });
  });

  it("does not wait when it does not", () => {
    const run = () => ({ status: 0, stdout: "M\tsrc/app/page.tsx" });
    expect(migrationCheck("origin/main...HEAD", { run }).waiting).toBe(false);
  });

  it("does not claim a migration when git could not produce the diff", () => {
    const run = () => ({ status: 128, stdout: "" });
    expect(migrationCheck("bad...range", { run })).toMatchObject({ waiting: false, files: [] });
  });
});
