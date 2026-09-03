#!/usr/bin/env node
/**
 * Step 6 — does this diff add a migration?
 *
 * If it does, the run stops: a migration is a schema change against a shared database and a
 * human applies it (docs/guidelines.md §5 step 6). The guard hook already refuses
 * `db:migrate`, so this is not the enforcement — it is the run noticing in time to set
 * Decision and say what it is waiting for, instead of closing a ticket whose schema half
 * never happened.
 *
 * Added files only. Editing prose in an applied migration is not a schema change, which is
 * the one exception build-guide §1 records.
 */

import { spawnSync } from "node:child_process";

import { emit, isMain } from "./cli.mjs";

/** Where migrations live. Hand-written since 0002; the DSL cannot express the RLS policies. */
export const MIGRATIONS_DIR = "drizzle/";

/** Added `.sql` files under the migrations directory, from `git diff --name-status`. */
export function addedMigrations(nameStatus) {
  return String(nameStatus ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => line.split(/\s+/))
    .filter(
      ([status, path]) =>
        status === "A" && path?.startsWith(MIGRATIONS_DIR) && path.endsWith(".sql"),
    )
    .map(([, path]) => path);
}

/** `{ waiting, files }` for the range given. Injected `run` keeps a test off this repo. */
export function migrationCheck(range = "origin/main...HEAD", { cwd = process.cwd(), run } = {}) {
  const g = run ?? ((args) => spawnSync("git", args, { cwd, encoding: "utf8" }));
  const diff = g(["diff", "--name-status", range]);
  const files = diff.status === 0 ? addedMigrations(diff.stdout) : [];
  return { waiting: files.length > 0, files, range };
}

/** CLI: `node migration-check.mjs [range]`. */
function main() {
  emit(migrationCheck(process.argv[2] ?? "origin/main...HEAD"));
}

if (isMain(import.meta.url)) main();
