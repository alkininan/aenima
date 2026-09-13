#!/usr/bin/env node
/**
 * Step 0a — every task's thread, read in one command.
 *
 * A comment on the board is enough (T0.11): a reply on a task at Review changes what was
 * built or merges it, a reply anywhere becomes a new task, a reply on a migration question
 * applies it. So the preflight reads every task's comments, not only a Decision's, and it
 * reads them over the API with the integration token rather than one connector call per
 * task: forty tasks is forty requests here and forty model turns there.
 *
 * What comes back is the countable part: the tasks with a human reply newer than the
 * pipeline's last comment, each with its status, the replies, whether the two-round cap
 * still allows a post, and the shape the words settle — `merge`, `apply`, or `assess` for
 * the skill to read. Deciding change from new work from an answer is the skill's.
 */

import { emit, isMain } from "./cli.mjs";
import { awaitingMigration, readThread, shapeOf } from "./comments.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";

/**
 * Scan `tasks` — rows with `{ id, url, Name, Status }` — through `commentsOf(id)`. Returns
 * `{ scanned, threads }` where `threads` holds only the tasks with an unanswered reply.
 */
export async function scan(tasks, commentsOf, prefix = "⟡ ") {
  const threads = [];
  for (const task of tasks) {
    const thread = readThread(await commentsOf(task.id), prefix);
    if (thread.unanswered.length === 0) continue;
    threads.push({
      id: task.id,
      url: task.url,
      Name: task.Name,
      Status: task.Status,
      unanswered: thread.unanswered,
      lastPipeline: thread.pipeline.at(-1)?.text ?? null,
      migration: awaitingMigration(thread),
      mayPost: thread.mayPost,
      shape: shapeOf(task.Status, thread),
    });
  }
  return { scanned: tasks.length, threads };
}

/** The whole preflight read for `dir`: token, board, every task, every thread. */
export async function readBoardThreads({ dir = process.cwd(), deps = {} } = {}) {
  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return { token: false, why: `${TOKEN_VAR} is not in .env.local`, scanned: 0, threads: [] };
  }
  const board = deps.board ? deps.board() : readBoard(dir);
  const api = deps.client ?? client(token, { fetch: deps.fetch });
  const tasks = await api.tasks(board.tasks_ds);
  const result = await scan(tasks, (id) => api.comments(id), board.prefix ?? "⟡ ");
  return { token: true, ...result };
}

/** CLI: `node threads.mjs`, run from the checkout. */
async function main() {
  emit(await readBoardThreads());
}

if (isMain(import.meta.url)) await main();
