#!/usr/bin/env node
/**
 * Step 9 — which diffs a run may merge on its own.
 *
 * A finished ticket merges itself (T0.16): the reviewer's PASS is on file and the gate is
 * green, so the human's word adds nothing — except where it still does. T0.16 kept three
 * places: a migration, the product spec, and the pipeline's own guard, gate, skill and run
 * scripts. T0.21 keeps one and a half. The human owns the documents upstream, in the
 * conversation that cuts the ticket, so re-approving a spec diff adds nothing; and a harness
 * diff is not dangerous because of where it lands but because of what it does. So:
 *
 *   - a diff adding a migration waits for `apply`: the schema is shared, and applying one is
 *     the human's call. Since T0.26 that is the whole of it — once the word has been spent on
 *     the task's thread the ticket merges itself, and until then the diff waits, because code
 *     that reads a column nobody has created is code main should not carry (§4);
 *   - a diff that **weakens a restraint** waits for `merge`, measured by running the
 *     restraints on both sides of it (`scripts/run/loosening.mjs`) rather than read off the
 *     paths it touches;
 *   - everything else lands on main at close.
 *
 * The answer is read in two places and lives in one: the guard's second door
 * (`scripts/hooks/guard.mjs`, rule (f)) refuses `gh pr merge` on the reviewer's PASS while
 * this says the diff is gated, and the skill's step 9 asks the same question before it
 * tries. `gatedDiff` is pure over injected inputs; `gatedDiffOf` reads the diff and both
 * sides of the restraints.
 */

import { execFileSync } from "node:child_process";

import { readMarker } from "./claim.mjs";
import { emit, isMain } from "./cli.mjs";
import { appliedMigrations, readThread } from "./comments.mjs";
import { loosenedBy } from "./loosening.mjs";
import { MIGRATIONS_DIR } from "./migration-check.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";

/**
 * True when a repo-relative path is one only the human's word merges on its own account —
 * which since T0.21 is a migration and nothing else. Everything the harness used to gate by
 * name is gated by measurement instead.
 */
export function isGatedPath(path) {
  return String(path ?? "").startsWith(MIGRATIONS_DIR);
}

/** The migrations among `files`, in the diff's order. */
export function gatedPaths(files = []) {
  return files.filter(isGatedPath);
}

/** The journal, which is the record of the migrations rather than a migration of its own. */
export const JOURNAL = `${MIGRATIONS_DIR}meta/_journal.json`;

/**
 * A gated path that is a migration's bookkeeping rather than a migration: the journal, which
 * decides what runs, and the snapshots `pnpm db:generate` writes beside it. Neither carries a
 * tag an `applied` note could name, and neither is a schema change of its own — they are the
 * record of the migrations in the same diff, so they answer to those.
 */
export function isBookkeeping(path) {
  const name = String(path ?? "");
  return name === JOURNAL || new RegExp(`^${MIGRATIONS_DIR}meta/[^/]+_snapshot\\.json$`).test(name);
}

/**
 * A migration's tag — the basename the journal names it with, and the name an `applied` note
 * carries — or null for anything else under `drizzle/`: the journal, a snapshot, a directory
 * deeper down.
 */
export function migrationTag(path) {
  const name = String(path ?? "");
  if (!name.startsWith(MIGRATIONS_DIR) || !name.endsWith(".sql")) return null;
  const tag = name.slice(MIGRATIONS_DIR.length, -".sql".length);
  return tag === "" || tag.includes("/") ? null : tag;
}

/**
 * The gated paths of `files` that `applied` — the migration tags a thread says are already on
 * the shared database (`appliedMigrations`) — answers for (T0.26).
 *
 * A migration goes when its own tag is among them, and never on another's: T3.1's `0015` was
 * applied days before T1.4's `0016`, on another thread, and a gate that read "some apply" would
 * have landed the second on the first. The bookkeeping beside them — the journal, and the
 * snapshots `db:generate` writes, which is the way CLAUDE.md says to make a migration — goes
 * only when every migration in the diff has, because it is their record and nothing else's; and
 * never on its own, where there is no migration an apply could have been for.
 */
export function coveredBy(files = [], applied = []) {
  const spent = new Set((applied ?? []).map(String));
  const gated = gatedPaths(files);
  const migrations = gated.filter((path) => migrationTag(path) !== null);
  const covered = new Set(migrations.filter((path) => spent.has(migrationTag(path))));
  if (migrations.length > 0 && covered.size === migrations.length) {
    for (const path of gated.filter(isBookkeeping)) covered.add(path);
  }
  return covered;
}

/** A reason a diff waits for the word: the rule it trips, and what would settle it. */
const reason = (rule, ungate) => ({ rule, ungate });

/**
 * `{ files, reasons, gated, ok }` for a diff whose restraint comparison has already been made.
 * `weakened` is `loosenedBy`'s reasons. `applied` is the migration tags the claimed task's
 * thread says have been applied, which since T0.26 is what takes a migration off the list;
 * absent, every migration is gated, so a caller that has read no thread gates as before.
 * `gated` is the reasons' rules, which is what a caller naming them in a sentence wants;
 * `reasons` carries what would ungate each.
 */
export function gatedDiff({ files = [], weakened = [], applied = [] } = {}) {
  const covered = coveredBy(files, applied);
  const reasons = [
    ...gatedPaths(files)
      .filter((file) => !covered.has(file))
      .map((file) =>
        reason(
          `it adds the migration ${file}`,
          'a migration is applied by hand, so this one waits for you either way — say "apply" on the thread and the run that applies it lands the ticket with it',
        ),
      ),
    ...weakened,
  ];
  return { files, reasons, gated: reasons.map((r) => r.rule), ok: reasons.length === 0 };
}

const git = (args, cwd) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * The migration tags the claimed task's thread says are already applied (T0.26), read over the
 * API with the board's token: `{ tags, why }`. Anything that cannot be read is `{ tags: [] }`
 * with the reason — a thread nobody can read ungates nothing, which is the gate as it was.
 *
 * The guard does not call this: `verify` has already read that thread for the word, and reads
 * the tags off the same fetch. This is for the skill's step 9, which asks the same question of
 * the same thread from a command line, so the two doors cannot disagree.
 */
export async function consumedApplies({ dir = process.cwd(), deps = {} } = {}) {
  const marker = deps.marker ? deps.marker() : readMarker(dir);
  if (marker === null || !marker.page) {
    return { tags: [], why: "no run marker names a claimed task, so there is no thread to read" };
  }

  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return { tags: [], why: `${TOKEN_VAR} is not in .env.local, so the board cannot be read` };
  }

  let board;
  try {
    board = deps.board ? deps.board() : readBoard(dir);
  } catch (error) {
    return { tags: [], why: `the board file could not be read (${error.message})` };
  }

  let comments;
  try {
    comments = deps.comments
      ? await deps.comments(marker.page)
      : await client(token, { fetch: deps.fetch }).comments(marker.page);
  } catch (error) {
    return { tags: [], why: `the thread could not be read: ${error.message}` };
  }

  const prefix = board.prefix ?? "⟡ ";
  return { tags: appliedMigrations(readThread(comments, prefix), prefix), why: null };
}

/**
 * The diff of `range` in the checkout at `cwd`, judged. `origin/main...HEAD` is what a pull
 * request from this branch merges, and it is both sides of the restraint comparison. `applied`
 * is `consumedApplies`' tags; absent, every migration is gated.
 */
export function gatedDiffOf({
  cwd = process.cwd(),
  range = "origin/main...HEAD",
  applied = [],
} = {}) {
  // `--no-renames`: without it git prints the destination alone, and a diff that renames
  // the detector would not list it — AC6 with a hole in it (review pass 2, Must 1).
  const names = git(["diff", "--name-only", "--no-renames", range], cwd);
  const files = String(names ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const weakened = loosenedBy({ cwd, range, files }).reasons;
  return { range, ...gatedDiff({ files, weakened, applied }) };
}

/** CLI: `node gated.mjs [range]`, run from the checkout. */
async function main() {
  const range = process.argv[2] ?? "origin/main...HEAD";
  const { tags, why } = await consumedApplies();
  emit({ applied: tags, appliedWhy: why, ...gatedDiffOf({ range, applied: tags }) });
}

if (isMain(import.meta.url)) await main();
