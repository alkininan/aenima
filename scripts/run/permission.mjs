#!/usr/bin/env node
/**
 * The human's word, verified by the guard in code (docs/guidelines.md §4, §5).
 *
 * A migration apply is the one move a comment can trigger that has consequences outside the
 * board, and it is not allowed on the model's reading of the thread. Before the guard lets
 * `db:migrate` through it comes here, and this reads the board itself: the run marker names
 * the claimed task's page, the token in `.env.local` opens the API, and the thread must carry
 * the human's newest reply beginning with the word, newer than the pipeline's last comment.
 * The model cannot fabricate a permission because nothing here reads the transcript — and
 * the branch a task is on is derived from its name on the board, not from the branch the run
 * wrote into the marker (review pass 2).
 *
 * Since T0.17 the board grants `ready`: the human's go on a Backlog task, said on its thread.
 * The run sets Ready in the preflight, before anything is claimed, so that word is read on
 * the page the status write names rather than through the marker.
 *
 * Since T0.46 `merge` is no longer a word. The merge is decided by two files the guard reads
 * for itself (`reviewed`): the reviewer's PASS and the gatekeeper's MERGE or MERGE APPLY,
 * both for the pushed commit; and an additive migration applies on the gatekeeper's word
 * alone (`applyGranted`), the human's `apply` staying for a migration that destroys or
 * rewrites data.
 *
 * Since T0.20 the guard asks one more thing of a page's thread before a comment posts
 * (`postable`): whether a comment of that kind may post there now — the cap on clarifying
 * rounds, and one comment of a kind per claim — which `mayPost` in `comments.mjs` says for
 * the preflight as well.
 *
 * Every `why` is a plain sentence the guard puts in its refusal, so a session that is
 * refused knows which of the things it needs was missing.
 */

import { branchName } from "./branch.mjs";
import { readMarker } from "./claim.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { execFileSync } from "node:child_process";

import { STATE_FILE, treeFingerprint } from "../hooks/gate.mjs";
import { emit, isMain } from "./cli.mjs";
import { appliedMigrations, kindOf, mayPost, readThread, shapeOf } from "./comments.mjs";
import { gatedDiffOf } from "./gated.mjs";
import { ADDITIVE } from "./migration-safety.mjs";
import { commonDir } from "./repo.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";
import { idOf } from "./stale.mjs";

export const WORDS = ["apply", "ready"];

/** The state each word is for, as a refusal says it. */
const STATE = {
  apply: "a task at Decision waiting on a migration question",
  ready: "a task at Backlog",
};

/**
 * `{ ok, why, marker, comment, task, applied }` for `word` on the claimed task — or, for
 * `ready`, on `page`, the page the status write names. `task` is what the board says the page
 * is — `{ name, status, branch }`, the branch derived from the ID in the name, null when the
 * name carries none. `applied` is the migration tags the same thread says are already on the
 * shared database (T0.26), read off this one fetch so the guard's two doors never ask the
 * board twice; `[]` whenever the thread could not be read, which gates a migration as before.
 * Effects injected: `marker`, `token`, `board`, `comments` and `page` default to the real ones
 * for `dir`.
 */
export async function verify(word, { dir = process.cwd(), page = null, deps = {} } = {}) {
  if (!WORDS.includes(word)) {
    return { ok: false, why: `"${word}" is not a word the board grants`, applied: [] };
  }

  let marker = null;
  if (word === "ready") {
    if (!page) {
      return { ok: false, why: "no page was named, so there is no thread to read", applied: [] };
    }
  } else {
    marker = deps.marker ? deps.marker() : readMarker(dir);
    if (marker === null || !marker.page) {
      return {
        ok: false,
        why: "no run marker names a claimed task, so there is no thread to read",
        applied: [],
      };
    }
  }
  const target = word === "ready" ? page : marker.page;

  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return {
      ok: false,
      why: `${TOKEN_VAR} is not in .env.local, so the board cannot be read`,
      marker,
      applied: [],
    };
  }

  let board;
  try {
    board = deps.board ? deps.board() : readBoard(dir);
  } catch (error) {
    return {
      ok: false,
      why: `the board file could not be read (${error.message})`,
      marker,
      applied: [],
    };
  }

  const api = deps.comments && deps.page ? null : client(token, { fetch: deps.fetch });
  let comments;
  let row;
  try {
    comments = deps.comments ? await deps.comments(target) : await api.comments(target);
    row = deps.page ? await deps.page(target) : await api.page(target);
  } catch (error) {
    return {
      ok: false,
      why: `the thread could not be read: ${error.message}`,
      marker,
      applied: [],
    };
  }

  const id = idOf(row?.Name);
  const task = {
    name: row?.Name ?? "",
    status: row?.Status ?? null,
    branch: id === null ? null : branchName(id),
  };

  // The same test the preflight reads: the word, as the newest reply, at the state the word
  // is for — `merge` on a task at Review, `apply` on a Decision waiting on a migration,
  // `ready` on a task at Backlog. A "merge the two helpers" on a task In progress is a change
  // request, not a merge (review pass 3).
  const prefix = board.prefix ?? "⟡ ";
  const thread = readThread(comments, prefix);
  const shape = shapeOf(task.status, thread);
  const ok = shape === word;
  return {
    ok,
    why: ok
      ? null
      : `the guard read the thread of ${task.name || "the claimed task"} at ${task.status ?? "no status"} and did not find "${word}" as your newest reply since the run's last comment — "${word}" is the word for ${STATE[word]}`,
    marker,
    comment: ok ? thread.unanswered.at(-1) : null,
    task,
    applied: appliedMigrations(thread, prefix),
  };
}

/** A page id as the API and the marker may each write it: dashes and case aside. */
const pageKey = (id) =>
  String(id ?? "")
    .replaceAll("-", "")
    .toLowerCase();

/**
 * When the thread could not be read, a clarifying round waits — it is never urgent, and the cap
 * is what it would pass — and every other comment posts: a report the guard cannot check is
 * still a report the human should have (T0.20).
 */
export function unreadPost(kind, why) {
  return kind === "clarifying"
    ? { ok: false, why: `${why}, so the cap on clarifying rounds could not be read`, kind }
    : { ok: true, why: null, kind };
}

/**
 * `{ ok, why, kind }` for a comment of `text` on `page` (T0.20): the kind its words carry, read
 * against the page's thread by `mayPost` — the cap on clarifying rounds, one comment of a
 * kind per claim, the claim being the marker's when it names this page, and since T0.24 a
 * refusal the thread already carries word for word, which is why the text goes through too.
 * Never throws: a board it cannot read is `unreadPost`. Effects injected: `marker`, `token`,
 * `board`, `comments`.
 */
export async function postable(text, { dir = process.cwd(), page = null, deps = {} } = {}) {
  let board;
  try {
    board = deps.board ? deps.board() : readBoard(dir);
  } catch (error) {
    // The board's own prefix is unread too; the kind is read with the default one (pass 1, Should 5).
    return unreadPost(kindOf(text), `the board file could not be read (${error.message})`);
  }
  const prefix = board.prefix ?? "⟡ ";
  const kind = kindOf(text, prefix);
  if (!String(text ?? "").startsWith(prefix)) return { ok: true, why: null, kind };
  if (!page) return unreadPost(kind, "no page was named");

  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) return unreadPost(kind, `${TOKEN_VAR} is not in .env.local`);

  let comments;
  try {
    comments = deps.comments
      ? await deps.comments(page)
      : await client(token, { fetch: deps.fetch }).comments(page);
  } catch (error) {
    return unreadPost(kind, `the thread could not be read: ${error.message}`);
  }

  const marker = deps.marker ? deps.marker() : readMarker(dir);
  const since =
    marker !== null && pageKey(marker.page) === pageKey(page) ? (marker.started ?? null) : null;
  return { ...mayPost(readThread(comments, prefix), kind, { since, text }), kind };
}

/** Where the reviewer writes its verdict, one file per ticket (T0.16). */
export const REVIEWS_DIR = join("docs", "reviews");

/** The one word a verdict file ends in when the ticket may merge itself. */
export const VERDICT = "PASS";

/** Where the gatekeeper writes its verdict, one file per ticket (T0.46). */
export const GATES_DIR = join("docs", "gates");

/** The gatekeeper's three words: the last line of its file is one of them. */
export const GATE_MERGE = "MERGE";
export const GATE_MERGE_APPLY = "MERGE APPLY";
export const GATE_HOLD = "HOLD";
export const GATE_VERDICTS = [GATE_MERGE, GATE_MERGE_APPLY, GATE_HOLD];

/** A commit as the gatekeeper names it: `commit 3b9a890`, or the hash alone on its line. */
const COMMIT_LINE = /^(?:commit\s+)?([0-9a-f]{7,40})$/i;

/** A numbered reason, `1. …` — the shape a HOLD's reasons and a reviewer's findings take. */
const REASON_LINE = /^\d+\.\s+\S/;

/**
 * A gatekeeper's file, read: `{ verdict, last, commit, reasons }`. `verdict` is the last
 * non-blank line when it is one of the three words, else null; `last` is that line whatever it
 * says; `commit` the first line naming one; `reasons` the numbered lines above the verdict.
 * Null for no text at all.
 */
export function readGate(text) {
  if (text === null || text === undefined) return null;
  const lines = String(text)
    .split("\n")
    .map((line) => line.trim());
  const last = verdictOf(text);
  const commit = lines.map((line) => line.match(COMMIT_LINE)?.[1] ?? null).find(Boolean) ?? null;
  return {
    verdict: GATE_VERDICTS.includes(last) ? last : null,
    last,
    commit: commit === null ? null : commit.toLowerCase(),
    reasons: lines.filter((line) => REASON_LINE.test(line)),
  };
}

/**
 * True when `named` — a commit as a verdict file names it, seven to forty hex digits — is
 * `full` or a prefix of it, case aside. Anything shorter than seven names nothing.
 */
export function commitMatches(named, full) {
  const short = String(named ?? "")
    .trim()
    .toLowerCase();
  const whole = String(full ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(short) || !/^[0-9a-f]{7,40}$/.test(whole)) return false;
  return whole.startsWith(short);
}

/** The text of a file under `dir`, or null. */
function readAt(dir, file) {
  try {
    return readFileSync(join(dir, file), "utf8");
  } catch {
    return null;
  }
}

/** `git rev-parse HEAD` at `dir`, or null. */
function headAt(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The gatekeeper's verdict for the claimed task, or the reason there is none:
 * `{ ok, why, id, file, gate }`. Read by both doors below.
 */
function gatekeeperOf(id, { dir, deps }) {
  const file = join(GATES_DIR, `${id}.md`);
  const text = deps.gatekeeper ? deps.gatekeeper(id) : readAt(dir, file);
  if (text === null)
    return { ok: false, why: `no gatekeeper verdict at ${file}`, file, gate: null };
  const gate = readGate(text);
  if (gate.verdict === null) {
    const ends = gate.last === null ? "nothing" : `"${gate.last}"`;
    return {
      ok: false,
      why: `${file} ends in ${ends} rather than ${GATE_VERDICTS.join(", ")}`,
      file,
      gate,
    };
  }
  if (gate.commit === null) {
    return {
      ok: false,
      why: `${file} names no commit, so nothing says which commit its ${gate.verdict} was written for`,
      file,
      gate,
    };
  }
  return { ok: true, why: null, file, gate };
}

/** The last non-blank line of a verdict file, trimmed; null for an empty file. */
export function verdictOf(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? null;
}

/**
 * The Stop gate's last green fingerprint, from `aenima-gate-count` beside the run marker, and
 * this tree's own — the same hash the gate computes (`scripts/hooks/gate.mjs`). Equal means
 * the suite passed exactly this tree; the run gets the green on record by running the gate
 * before it merges (skill step 9).
 */
export function gateState(dir = process.cwd()) {
  const common = commonDir(dir);
  let green = null;
  try {
    const file =
      common === null ? null : JSON.parse(readFileSync(join(common, STATE_FILE), "utf8"));
    green = file?.greenHash ?? null;
  } catch {
    green = null;
  }
  return { green, tree: treeFingerprint(dir) };
}

/**
 * The guard's second door for a merge — since T0.46 the only door (T0.16, T0.46): `{ ok, why,
 * marker, task, gated, gatekeeper }`. Open when the claimed task's reviewer verdict,
 * `docs/reviews/<id>.md`, ends in PASS; its gatekeeper verdict, `docs/gates/<id>.md`, ends in
 * MERGE or MERGE APPLY and names the commit it was written for — the guard binds that commit
 * to the pull request's head, so a verdict for another commit merges nothing; the diff
 * against origin/main adds no destructive migration nobody has applied (`gated.mjs`, which
 * reports a weakening for the gatekeeper's reading and no longer gates on it); and the Stop
 * gate's last green is this very tree (`gateState`). The task's branch comes from the
 * marker's id — both files are named by it, so the three cannot name different tickets.
 *
 * `deps.applied` is the migration tags the claimed task's thread says are already on the shared
 * database, read off the thread by `consumedApplies`; since T0.26 they are what takes a
 * migration off the gated list. Absent — every caller that has read no thread, the loosening
 * detector's own corpus among them — every destructive migration is gated, as before.
 *
 * Effects injected: `marker`, `verdict(id)` (the reviewer's text, or null), `gatekeeper(id)`
 * (the gatekeeper's text, or null), `diff(applied)`, `gate()`.
 */
export function reviewed({ dir = process.cwd(), deps = {} } = {}) {
  const marker = deps.marker ? deps.marker() : readMarker(dir);
  if (marker === null || !marker.task) {
    return {
      ok: false,
      why: "no run marker names a claimed task, so there is no reviewer verdict to read",
    };
  }
  const id = String(marker.task).trim();
  const file = join(REVIEWS_DIR, `${id}.md`);

  let text = null;
  try {
    text = deps.verdict ? deps.verdict(id) : readFileSync(join(dir, file), "utf8");
  } catch {
    text = null;
  }
  if (text === null) return { ok: false, why: `no reviewer verdict at ${file}`, marker };

  const last = verdictOf(text);
  if (last !== VERDICT) {
    const ends = last === null ? "nothing" : `"${last}"`;
    return { ok: false, why: `${file} ends in ${ends} rather than ${VERDICT}`, marker };
  }

  const kept = gatekeeperOf(id, { dir, deps });
  if (!kept.ok) return { ok: false, why: kept.why, marker };
  if (kept.gate.verdict === GATE_HOLD) {
    return {
      ok: false,
      why: `${kept.file} ends in ${GATE_HOLD} rather than ${GATE_MERGE} or ${GATE_MERGE_APPLY} — the gatekeeper holds this commit`,
      marker,
    };
  }

  const applied = deps.applied ?? [];
  const diff = deps.diff ? deps.diff(applied) : gatedDiffOf({ cwd: dir, applied });
  if (!diff.ok) {
    return {
      ok: false,
      why: `the diff is one only your word merges: ${diff.gated.join("; ")}`,
      marker,
      gated: diff.gated,
    };
  }

  const gate = deps.gate ? deps.gate() : gateState(dir);
  if (gate.green === null || gate.green !== gate.tree) {
    const short = (hash) => (hash === null ? "none" : String(hash).slice(0, 7));
    return {
      ok: false,
      why: `the Stop gate has not passed this tree — its last green is ${short(gate.green)} and this tree is ${short(gate.tree)}; run the gate before the merge`,
      marker,
    };
  }

  return {
    ok: true,
    why: null,
    marker,
    task: { name: id, branch: branchName(id) },
    gated: [],
    gatekeeper: { verdict: kept.gate.verdict, commit: kept.gate.commit },
  };
}

/**
 * The guard's apply door on the gatekeeper's word (T0.46): `{ ok, why, marker, task,
 * migrations }`. Open when the claimed task's gatekeeper verdict ends in MERGE APPLY, names
 * this checkout's HEAD — the apply reads the checkout's `drizzle/`, so the commit judged must
 * be the commit applied — and `migration-safety.mjs` says additive for every migration the
 * diff adds and nobody has applied. The script's answer, never the model's: a MERGE APPLY
 * over a destructive migration opens nothing. The human's `apply` is the other door, read by
 * `verify`, and stays for a migration that destroys or rewrites data.
 *
 * Effects injected: `marker`, `gatekeeper(id)`, `localHead()`, `diff(applied)`, `applied`.
 */
export function applyGranted({ dir = process.cwd(), deps = {} } = {}) {
  const marker = deps.marker ? deps.marker() : readMarker(dir);
  if (marker === null || !marker.task) {
    return {
      ok: false,
      why: "no run marker names a claimed task, so there is no gatekeeper verdict to read",
    };
  }
  const id = String(marker.task).trim();
  const kept = gatekeeperOf(id, { dir, deps });
  if (!kept.ok) return { ok: false, why: kept.why, marker };
  if (kept.gate.verdict !== GATE_MERGE_APPLY) {
    return {
      ok: false,
      why: `${kept.file} ends in ${kept.gate.verdict} rather than ${GATE_MERGE_APPLY}, so the gatekeeper has not said apply`,
      marker,
    };
  }
  const local = deps.localHead ? deps.localHead() : headAt(dir);
  if (!commitMatches(kept.gate.commit, local)) {
    const at = (sha) => (sha === null || sha === undefined ? "unknown" : String(sha).slice(0, 7));
    return {
      ok: false,
      why: `${kept.file} was written for ${at(kept.gate.commit)} and this checkout's HEAD is ${at(local)}, so the migrations it judged are not the ones that would apply`,
      marker,
    };
  }
  const applied = deps.applied ?? [];
  const diff = deps.diff ? deps.diff(applied) : gatedDiffOf({ cwd: dir, applied });
  const waiting = (diff.migrations ?? []).filter((each) => each.waits);
  const held = waiting.filter((each) => each.safety !== ADDITIVE);
  if (held.length > 0) {
    const named = held.map((each) => `${each.path} (${each.why ?? "not read as additive"})`);
    return {
      ok: false,
      why: `migration-safety.mjs reads ${named.join("; ")} as destructive, and a migration that destroys or rewrites data is applied on your word alone, whatever the gatekeeper said`,
      marker,
    };
  }
  return {
    ok: true,
    why: null,
    marker,
    task: { name: id, branch: branchName(id) },
    migrations: waiting.map((each) => each.path),
  };
}

/**
 * CLI: `node permission.mjs apply`, or `node permission.mjs ready <page id>` — what the guard
 * would find, for a person to check.
 */
async function main() {
  const [word, page = null] = process.argv.slice(2);
  if (!word) {
    process.stderr.write(`usage: permission.mjs <${WORDS.join("|")}> [page id]\n`);
    process.exit(1);
  }
  const result = await verify(word, { page });
  emit({ ok: result.ok, why: result.why, task: result.task ?? null });
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) await main();
