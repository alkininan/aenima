#!/usr/bin/env node
/**
 * Step 0a — applying the migration your `apply` granted, from wherever the run is standing.
 *
 * T0.10's capability boundary keeps the admin URL in one file in one place: `.env.migrate`,
 * in the primary checkout, never carried into a worktree (`.worktreeinclude`). T0.11 made
 * `apply` a word the guard reads off the board. The two met badly: the schedule runs every
 * ticket in a worktree, a worktree has no admin URL, so every run that read a granted `apply`
 * handed it on to "a run in the primary checkout" — which the schedule never starts. T3.1's
 * `apply` sat granted with nothing able to act on it, and every migration after it would have
 * queued behind it (T0.24).
 *
 * The boundary is right and does not move. What moves is where the work happens: the run
 * stays in its worktree, and the apply is one child process whose working directory is the
 * primary checkout and whose `--env-file` is the primary checkout's `.env.migrate`. The
 * credential is read there, by node, into that child and nowhere else — never copied into the
 * worktree, never put on the run's own environment, and never printed: the child's own output
 * and anything this script surfaces of it go through `scrub` first.
 *
 * The migrations, though, come from the *worktree*: the ticket's branch is what carries the
 * new file, and the primary checkout sits on `main`. So the child is handed the run's own
 * `drizzle/` and drizzle-orm's migrator reads it there. Credential from where it lives,
 * migrations from where the ticket is.
 *
 * The guard still stands in front of all of it: `scripts/hooks/guard.mjs` rule (b) reads this
 * script — and any command handed `.env.migrate` — as an apply, and refuses it until it has
 * itself read your word on the claimed task's thread. This script grants nothing.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emit, isMain } from "./cli.mjs";
import { commonDir } from "./repo.mjs";

/** The file holding the admin URL. It exists in the primary checkout and nowhere else. */
export const ADMIN_ENV = ".env.migrate";

/** Where migrations live, in whichever checkout is being applied from. */
export const MIGRATIONS = "drizzle";

/** What a scrubbed connection string reads as. */
export const SCRUBBED = "[a connection string]";

/** A postgres URL wherever one appears in text, which is the one secret this path handles. */
const CONNECTION_STRING = /\bpostgres(?:ql)?:\/\/\S+/gi;

/**
 * Any connection string taken out of text the run will read or post. The child scrubs its own
 * error first, because it is the only side that knows the URL exactly; this is the second
 * layer, over whatever the child did not write itself — node's own startup errors, a stack
 * from a dependency — and it is why nothing here ever prints `process.env.DATABASE_URL`.
 */
export function scrub(text) {
  return String(text ?? "").replace(CONNECTION_STRING, SCRUBBED);
}

/**
 * The primary checkout of the repository containing `cwd`: the directory the shared `.git`
 * sits in. Null when `cwd` is in no repository, or when that `.git` is bare — neither has a
 * working tree with an `.env.migrate` in it.
 */
export function primaryCheckout(cwd = process.cwd()) {
  const common = commonDir(cwd);
  if (common === null) return null;
  const parent = dirname(common);
  return parent === common ? null : parent;
}

/** This file, the child runs the worker half of it. */
const SELF = fileURLToPath(import.meta.url);

/**
 * The child that does the applying: node, the primary checkout's env file, this script in its
 * worker half, and the migrations folder of the checkout the run is in. `DATABASE_URL` is
 * deleted from the environment it inherits so the env file is its only source — a stale one on
 * the run's own environment would otherwise silently win or lose depending on node's order.
 */
export function workerSpec({
  primary,
  folder,
  script = SELF,
  env = {},
  execPath = process.execPath,
}) {
  const { DATABASE_URL: _dropped, ...inherited } = env;
  return {
    command: execPath,
    args: [`--env-file=${join(primary, ADMIN_ENV)}`, script, "--worker", "--folder", folder],
    cwd: primary,
    env: inherited,
  };
}

/**
 * The migrations of `ref`, unpacked into a directory of their own.
 *
 * The branch that carries a migration was cut before the script that applies it: `origin/t3-1`
 * has no `apply.mjs`, and checking it out to reach its `drizzle/` would take the machinery away
 * with it — the deadlock this ticket ends, one step later (review pass 1, Must 1). So the ref is
 * read rather than entered, the way the hooks read `scripts/` from `origin/main`. Machinery from
 * the checkout the run stands in, migrations from the ref, credential from the primary checkout;
 * no two of the three have to be the same tree.
 *
 * Returns `{ ok, folder, dir, why }`. `dir` is the caller's to remove, whatever `ok` says.
 */
export function exportMigrations(ref, { cwd = process.cwd(), git, dir } = {}) {
  const out = dir ?? mkdtempSync(join(tmpdir(), "aenima-apply-"));
  const run =
    git ?? ((argv) => spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", stdio: "pipe" }));
  const tar = join(out, "migrations.tar");

  const archived = run(["git", "archive", "--format=tar", "-o", tar, ref, MIGRATIONS]);
  if (archived?.status !== 0) {
    return { ok: false, folder: null, dir: out, why: said(`git archive ${ref}`, archived) };
  }

  const extracted = run(["tar", "-xf", tar, "-C", out]);
  if (extracted?.status !== 0) {
    return { ok: false, folder: null, dir: out, why: said("tar -xf", extracted) };
  }

  return { ok: true, folder: join(out, MIGRATIONS), dir: out, why: null };
}

/** What a failed command said, for a sentence the run can put on the board. */
const said = (what, result) =>
  `${what} failed: ${scrub(`${result?.stderr ?? ""}${result?.stdout ?? ""}`.trim()) || "no output"}`;

/** The journal's entries, oldest first: `{ idx, tag, when }` and nothing else. */
export function journalEntries(text) {
  const journal = JSON.parse(String(text ?? "{}"));
  return (journal.entries ?? [])
    .map((entry) => ({ idx: entry.idx, tag: entry.tag, when: entry.when }))
    .sort((a, b) => a.when - b.when);
}

/**
 * The ledger's `created_at` values as a set. drizzle writes the journal's `when` there, one row
 * per migration (node_modules/drizzle-orm/pg-core/dialect.js → `migrate()`), so a journal entry
 * is applied exactly when its `when` is among them — asked of the rows themselves rather than of
 * the newest one, which is what review pass 2's Must 1 turns on.
 */
const stampSet = (stamps = []) => new Set(stamps.map(Number));

/** The entries the ledger gained a row for between `before` and `after`. */
export function appliedBetween(entries = [], before = [], after = []) {
  const was = stampSet(before);
  const now = stampSet(after);
  return entries
    .filter((entry) => !was.has(Number(entry.when)) && now.has(Number(entry.when)))
    .map((entry) => ({ idx: entry.idx, tag: entry.tag }));
}

/** The entries the ledger has no row for, whatever their age. */
export function pendingOf(entries = [], stamps = []) {
  const recorded = stampSet(stamps);
  return entries
    .filter((entry) => !recorded.has(Number(entry.when)))
    .map((entry) => ({ idx: entry.idx, tag: entry.tag, when: entry.when }));
}

/**
 * The pending entries drizzle's migrator will pass over in silence.
 *
 * It applies a migration only when the ledger's newest `created_at` is *less* than the entry's
 * `when` — not when the entry is absent. So a migration generated on one branch while another
 * branch's later-stamped migration reached the database first is skipped for ever, with no
 * error: `migrate()` returns cleanly having done nothing. Both branches waiting on this
 * pipeline are in exactly that position — T1.4's 0015 is stamped 1788982026724 and T3.1's
 * 1789644802697 — so whichever lands second would have been reported applied and never have
 * been (review pass 2, Must 1). Nothing here fixes drizzle; it refuses to be silent about it.
 */
export function blockedOf(entries = [], stamps = []) {
  if (stamps.length === 0) return [];
  const newest = Math.max(...stamps.map(Number));
  return pendingOf(entries, stamps).filter((entry) => Number(entry.when) <= newest);
}

/**
 * The worker's answer, read back off its stdout. `emit` pretty-prints across lines, so the
 * object is taken from the last *line-initial* `{` to the end — never the last `{` anywhere,
 * which is an element of whatever array the answer ends with (observed red first).
 */
export function readAnswer(stdout) {
  const text = String(stdout ?? "").trim();
  if (text === "") return null;
  const starts = text.startsWith("{") ? [0] : [];
  for (let i = text.indexOf("\n{"); i !== -1; i = text.indexOf("\n{", i + 1)) starts.push(i + 1);
  for (const start of starts.reverse()) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      // Not the start of the answer; try the one before it.
    }
  }
  return null;
}

/**
 * Apply migrations through a child in the primary checkout: `ref`'s, read out of git without
 * checking it out, or the checkout at `cwd`'s when there is no ref. Returns
 * `{ ok, applied, pending, folder, primary, why }`; `applied` and `pending` are `{ idx, tag }`
 * per migration, which is what the report names. Effects injected: `primary`, `exists`, `env`,
 * `archive`, `cleanup` and `run`, so a test stays off git and off the database.
 */
export function apply({ cwd = process.cwd(), ref = null, deps = {} } = {}) {
  const exists = deps.exists ?? existsSync;
  const primary = deps.primary ? deps.primary() : primaryCheckout(cwd);
  if (primary === null) {
    return {
      ok: false,
      applied: [],
      pending: [],
      folder: null,
      primary: null,
      why: `${cwd} is in no repository with a working tree, so there is no primary checkout to apply from`,
    };
  }

  const adminEnv = join(primary, ADMIN_ENV);
  if (!exists(adminEnv)) {
    return {
      ok: false,
      applied: [],
      pending: [],
      folder: null,
      primary,
      why: `the primary checkout ${primary} has no ${ADMIN_ENV}, which is the only place the admin URL lives — nothing else is looked at`,
    };
  }

  let folder = resolve(cwd, MIGRATIONS);
  let exported = null;
  if (ref !== null) {
    exported = deps.archive ? deps.archive(ref, cwd) : exportMigrations(ref, { cwd });
    if (!exported.ok) {
      if (exported.dir) (deps.cleanup ?? remove)(exported.dir);
      return { ok: false, applied: [], pending: [], folder: null, primary, why: exported.why };
    }
    folder = exported.folder;
  }

  try {
    if (!exists(join(folder, "meta", "_journal.json"))) {
      return {
        ok: false,
        applied: [],
        pending: [],
        folder,
        primary,
        why: `${folder} has no meta/_journal.json, so there is no migrations journal to apply`,
      };
    }

    const spec = workerSpec({ primary, folder, env: deps.env ?? process.env });
    const run =
      deps.run ??
      ((child) =>
        spawnSync(child.command, child.args, {
          cwd: child.cwd,
          env: child.env,
          encoding: "utf8",
        }));

    const result = run(spec);
    const answer = readAnswer(result?.stdout);
    if (answer === null) {
      const noise = scrub(`${result?.stderr ?? ""}`.trim());
      return {
        ok: false,
        applied: [],
        pending: [],
        folder,
        primary,
        why: `the apply produced no answer${noise === "" ? "" : `: ${noise}`}`,
      };
    }

    return {
      ok: Boolean(answer.ok),
      applied: answer.applied ?? [],
      pending: answer.pending ?? [],
      folder,
      primary,
      why: answer.ok ? null : scrub(answer.why ?? "the apply failed and said nothing"),
    };
  } finally {
    // The export is this call's, however it ends: an unapplied migration left in /tmp is a
    // copy of the schema nobody is watching.
    if (exported !== null && exported.dir) (deps.cleanup ?? remove)(exported.dir);
  }
}

/** Remove a directory this call made, never one it was handed. */
const remove = (dir) => rmSync(dir, { recursive: true, force: true });

/** The first line of an error, which is the database's own sentence about what went wrong. */
const firstLine = (text) =>
  String(text ?? "")
    .split("\n")[0]
    .trim();

/**
 * The worker half: the only code here that holds the URL, and it never prints it. Runs in the
 * primary checkout with `--env-file` already loaded by node, against the migrations folder it
 * was handed. Applies through drizzle-orm's own migrator — the library owns what a migration
 * is — and brackets it with the ledger's newest `created_at` to say what ran.
 */
export async function work({ folder, url, deps = {} } = {}) {
  if (!url) {
    return {
      ok: false,
      applied: [],
      why: `DATABASE_URL is not set — it is read from ${ADMIN_ENV} in the primary checkout`,
    };
  }

  let entries;
  try {
    entries = journalEntries(readFileSync(join(folder, "meta", "_journal.json"), "utf8"));
  } catch (error) {
    return { ok: false, applied: [], why: scrub(firstLine(error.message)) };
  }

  const postgres = deps.postgres ?? (await import("postgres")).default;
  const drizzle = deps.drizzle ?? (await import("drizzle-orm/postgres-js")).drizzle;
  const migrate = deps.migrate ?? (await import("drizzle-orm/postgres-js/migrator")).migrate;

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const before = await ledgerStamps(sql);
    // `when` is `blockedOf`'s to read; what the run reports is the tag and the index.
    const pending = pendingOf(entries, before).map(({ idx, tag }) => ({ idx, tag }));
    const blocked = blockedOf(entries, before);
    if (blocked.length > 0) {
      const named = blocked.map((entry) => `${entry.tag} (journal ${entry.idx})`).join(", ");
      return {
        ok: false,
        applied: [],
        pending,
        why: `${named} would be passed over in silence: drizzle applies only what is stamped later than the newest row in its ledger, and another branch's migration got there first. Regenerate it on the branch — pnpm db:generate restamps it — and say apply again.`,
      };
    }
    await migrate(drizzle(sql), { migrationsFolder: folder });
    const after = await ledgerStamps(sql);
    return { ok: true, applied: appliedBetween(entries, before, after), pending, why: null };
  } catch (error) {
    // The database's own sentence, scrubbed: postgres.js attaches what it was given to an
    // error, and what it was given here is the admin URL (CLAUDE.md › Prohibitions).
    return { ok: false, applied: [], why: scrub(firstLine(error.message)) };
  } finally {
    await sql.end();
  }
}

/**
 * Every `created_at` drizzle's ledger holds, oldest first — empty when there is no ledger yet,
 * which means the same to the migrator as an empty one: nothing has been applied.
 */
async function ledgerStamps(sql) {
  const [present] = await sql`
    select exists (
      select 1 from information_schema.tables
       where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as present`;
  if (!present?.present) return [];
  const rows = await sql`
    select created_at from "drizzle"."__drizzle_migrations" order by created_at`;
  return rows.map((row) => Number(row.created_at)).filter((stamp) => Number.isFinite(stamp));
}

/**
 * CLI: `node apply.mjs [--ref <ref>]` from the run's checkout — the ref being the ticket's
 * branch, whose migrations are read without checking it out — or `--worker --folder <path>`
 * as the child it spawns in the primary checkout.
 */
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--worker")) {
    const r = args.indexOf("--ref");
    emit(apply({ ref: r === -1 ? null : (args[r + 1] ?? null) }));
    return;
  }
  const i = args.indexOf("--folder");
  const folder = i === -1 ? resolve(MIGRATIONS) : args[i + 1];
  emit(await work({ folder, url: process.env.DATABASE_URL }));
}

if (isMain(import.meta.url)) await main();
