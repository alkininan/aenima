#!/usr/bin/env node
/**
 * The human's word, verified by the guard in code (docs/guidelines.md §4, §5).
 *
 * A merge and a migration apply are the two moves a comment can trigger that have
 * consequences, and neither is allowed on the model's reading of the thread. Before the
 * guard lets `gh pr merge` or `db:migrate` through it comes here, and this reads the board
 * itself: the run marker names the claimed task, the token in `.env.local` opens the API,
 * and the thread must carry a reply beginning with the word, newer than the pipeline's last
 * comment. The model cannot fabricate a permission because nothing here reads the transcript.
 *
 * Every `why` is a plain sentence the guard puts in its refusal, so a session that is
 * refused knows which of the four things was missing.
 */

import { readMarker } from "./claim.mjs";
import { emit, isMain } from "./cli.mjs";
import { permitted } from "./comments.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";

export const WORDS = ["merge", "apply"];

/**
 * `{ ok, why, marker, comment }` for `word` on the claimed task. Effects injected: `marker`,
 * `token`, `board` and `comments` default to the real ones for `dir`.
 */
export async function verify(word, { dir = process.cwd(), deps = {} } = {}) {
  if (!WORDS.includes(word)) return { ok: false, why: `"${word}" is not a word the board grants` };

  const marker = deps.marker ? deps.marker() : readMarker(dir);
  if (marker === null || !marker.page) {
    return { ok: false, why: "no run marker names a claimed task, so there is no thread to read" };
  }

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

  let comments;
  try {
    comments = deps.comments
      ? await deps.comments(marker.page)
      : await client(token, { fetch: deps.fetch }).comments(marker.page);
  } catch (error) {
    return { ok: false, why: `the thread could not be read: ${error.message}`, marker };
  }

  const found = permitted(word, comments, board.prefix ?? "⟡ ");
  return { ok: found.ok, why: found.why, marker, comment: found.comment };
}

/** CLI: `node permission.mjs merge` — what the guard would find, for a person to check. */
async function main() {
  const word = process.argv[2];
  if (!word) {
    process.stderr.write(`usage: permission.mjs <${WORDS.join("|")}>\n`);
    process.exit(1);
  }
  const result = await verify(word);
  emit({ ok: result.ok, why: result.why, task: result.marker?.task ?? null });
  process.exit(result.ok ? 0 : 1);
}

if (isMain(import.meta.url)) await main();
