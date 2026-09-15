#!/usr/bin/env node
/**
 * The human's word, verified by the guard in code (docs/guidelines.md §4, §5).
 *
 * A merge and a migration apply are the two moves a comment can trigger that have
 * consequences, and neither is allowed on the model's reading of the thread. Before the
 * guard lets `gh pr merge` or `db:migrate` through it comes here, and this reads the board
 * itself: the run marker names the claimed task's page, the token in `.env.local` opens the
 * API, and the thread must carry the human's newest reply beginning with the word, newer
 * than the pipeline's last comment. The model cannot fabricate a permission because nothing
 * here reads the transcript — and the branch a merge must match is derived from the task's
 * name on the board, not from the branch the run wrote into the marker (review pass 2).
 *
 * Since T0.17 the board grants a third word, `ready`: the human's go on a Backlog task, said
 * on its thread. The run sets Ready in the preflight, before anything is claimed, so that word
 * is read on the page the status write names rather than through the marker.
 *
 * Every `why` is a plain sentence the guard puts in its refusal, so a session that is
 * refused knows which of the things it needs was missing.
 */

import { branchName } from "./branch.mjs";
import { readMarker } from "./claim.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STATE_FILE, treeFingerprint } from "../hooks/gate.mjs";
import { emit, isMain } from "./cli.mjs";
import { readThread, shapeOf } from "./comments.mjs";
import { gatedDiffOf } from "./gated.mjs";
import { commonDir } from "./repo.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";
import { idOf } from "./stale.mjs";

export const WORDS = ["merge", "apply", "ready"];

/** The state each word is for, as a refusal says it. */
const STATE = {
  merge: "a task at Review",
  apply: "a task at Decision waiting on a migration question",
  ready: "a task at Backlog",
};

/**
 * `{ ok, why, marker, comment, task }` for `word` on the claimed task — or, for `ready`, on
 * `page`, the page the status write names. `task` is what the board says the page is —
 * `{ name, status, branch }`, the branch derived from the ID in the name, null when the name
 * carries none. Effects injected: `marker`, `token`, `board`, `comments` and `page` default
 * to the real ones for `dir`.
 */
export async function verify(word, { dir = process.cwd(), page = null, deps = {} } = {}) {
  if (!WORDS.includes(word)) return { ok: false, why: `"${word}" is not a word the board grants` };

  let marker = null;
  if (word === "ready") {
    if (!page) {
      return { ok: false, why: "no page was named, so there is no thread to read" };
    }
  } else {
    marker = deps.marker ? deps.marker() : readMarker(dir);
    if (marker === null || !marker.page) {
      return {
        ok: false,
        why: "no run marker names a claimed task, so there is no thread to read",
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
    };
  }

  let board;
  try {
    board = deps.board ? deps.board() : readBoard(dir);
  } catch (error) {
    return { ok: false, why: `the board file could not be read (${error.message})`, marker };
  }

  const api = deps.comments && deps.page ? null : client(token, { fetch: deps.fetch });
  let comments;
  let row;
  try {
    comments = deps.comments ? await deps.comments(target) : await api.comments(target);
    row = deps.page ? await deps.page(target) : await api.page(target);
  } catch (error) {
    return { ok: false, why: `the thread could not be read: ${error.message}`, marker };
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
  const thread = readThread(comments, board.prefix ?? "⟡ ");
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
  };
}

/** Where the reviewer writes its verdict, one file per ticket (T0.16). */
export const REVIEWS_DIR = join("docs", "reviews");

/** The one word a verdict file ends in when the ticket may merge itself. */
export const VERDICT = "PASS";

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
 * The guard's second door for `merge` (T0.16): `{ ok, why, marker, task, gated }`. Open
 * when the claimed task's reviewer verdict, `docs/reviews/<id>.md`, ends in PASS, the diff
 * against origin/main touches no gated path (`gated.mjs`), and the Stop gate's last green is
 * this very tree (`gateState`). The task's branch comes from the marker's id — the file is
 * named by it, so the two cannot name different tickets. Effects injected: `marker`,
 * `verdict(id)` (the file's text, or null), `diff()`, `gate()`.
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

  const diff = deps.diff ? deps.diff() : gatedDiffOf({ cwd: dir });
  if (!diff.ok) {
    return {
      ok: false,
      why: `the diff touches ${diff.gated.join(", ")}, which only your word merges`,
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

  return { ok: true, why: null, marker, task: { name: id, branch: branchName(id) }, gated: [] };
}

/**
 * CLI: `node permission.mjs merge`, or `node permission.mjs ready <page id>` — what the guard
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
