import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The migrations journal against the migration files.
 *
 * `drizzle/meta/_journal.json` is the only thing that decides what runs and in
 * what order: `migrate()` walks its entries and writes each `when` into the
 * ledger as a `created_at`. Nothing reads the directory listing, so a file and
 * its entry can disagree in four ways and every one of them is silent until a
 * migration is applied — which on this project happens by hand, on a human's
 * word, days after the run that wrote it (docs/guidelines.md §5 step 6).
 *
 * Two branches proved it. T1.4 and T3.1 both stopped on a migration, both
 * generated an `0015`, and both waited: `0015_opportunity_keys` at `idx: 15`
 * stamped 1788982026724, `0015_refinement_round` at `idx: 15` stamped
 * 1789644802697. Whichever landed second would have put two tags on one index,
 * and — worse, because it fails without failing — the *older* stamp under the
 * newer one. `scripts/run/apply.mjs`'s `blockedOf` exists because drizzle
 * applies only what is stamped later than its ledger's newest row: a migration
 * stamped behind one already applied is skipped for ever and `migrate()` still
 * returns cleanly. So renumbering is not renaming. The file moves, the index
 * moves, and the stamp moves with them.
 *
 * These are file-and-JSON assertions, so they hold with no database and in
 * every worktree — which is the point. The failure they catch is one nobody
 * sees until a schema change silently does not happen.
 */

const DIR = "drizzle";

type Entry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };

const journal = (): Entry[] => {
  const raw: unknown = JSON.parse(readFileSync(join(DIR, "meta", "_journal.json"), "utf8"));
  const entries = (raw as { entries?: Entry[] }).entries;
  if (!Array.isArray(entries)) throw new Error("the journal carries no entries array");
  return entries;
};

/** Every `.sql` file in `drizzle/`, by its tag — the basename the journal names it with. */
const tags = (): string[] =>
  readdirSync(DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, -".sql".length))
    .sort();

describe("the migrations journal", () => {
  it("names every migration file, and every entry has a file", () => {
    const named = journal()
      .map((entry) => entry.tag)
      .sort();
    expect(named).toEqual(tags());
  });

  it("gives each entry the index its tag already carries, contiguously from zero", () => {
    const entries = journal();
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, i) => i));
    for (const entry of entries) {
      expect(`${String(entry.idx).padStart(4, "0")}_`).toBe(entry.tag.slice(0, 5));
    }
  });

  it("stamps them in index order, so none is passed over in silence", () => {
    // `apply.mjs`'s `blockedOf`: drizzle applies only what is stamped later than the
    // newest row in its ledger, so an entry stamped behind its predecessor can never run.
    const stamps = journal().map((entry) => entry.when);
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i]).toBeGreaterThan(stamps[i - 1] as number);
    }
  });

  it("keeps 0015 as T3.1's and 0016 as T1.4's, the collision as it was settled", () => {
    // The two branches' answer, from T1.4's addendum: T3.1's `apply` was granted first
    // and Phase 3 is blocked on its table, so it keeps 0015 and the opportunity keys move
    // to 0016. Renumbering the other way silently re-points an applied ledger row.
    const byTag = new Map(journal().map((entry) => [entry.tag, entry]));
    expect(byTag.get("0015_refinement_round")?.idx).toBe(15);
    expect(byTag.get("0015_refinement_round")?.when).toBe(1789644802697);
    expect(byTag.get("0016_opportunity_keys")?.idx).toBe(16);
  });
});
