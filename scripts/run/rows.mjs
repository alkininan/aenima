#!/usr/bin/env node
/**
 * Step 0 — the board's rows over the token, when the connector's query quota is spent.
 *
 * The preflight asks the board a few questions through the connector's query: the tasks In
 * progress (step 0a), the tasks at Review with their commits and the newest Releases row (0c),
 * the task a revert names (0e). That query draws on the workspace's shared quota, and on
 * 2026-09-16 a run met it spent — "Your workspace has reached the usage limit for Query Data
 * Source" — and read the same rows over the integration token instead, the way `threads.mjs`
 * reads every thread (T0.23). This is that read, so a run meeting the limit runs a command
 * rather than improvising one, and its report line says the board was read over the token.
 */

import { emit, isMain } from "./cli.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";
import { idOf } from "./stale.mjs";

/** Releases rows newest first, by the time each was created. */
const newestFirst = (rows) =>
  [...rows].sort((a, b) => String(b.created ?? "").localeCompare(String(a.created ?? "")));

/**
 * The rows for one question: `releases` the Releases rows newest first; otherwise the Tasks rows,
 * those at `status` when it is given, the one `id` names when that is. Returns `{ token, source,
 * status, id, rows }`, each Tasks row as `notion.mjs` reads it. Effects injected: `token`,
 * `board`, `client`.
 */
export async function readRows({
  status = null,
  id = null,
  releases = false,
  dir = process.cwd(),
  deps = {},
} = {}) {
  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) return { token: false, why: `${TOKEN_VAR} is not in .env.local`, rows: [] };
  const board = deps.board ? deps.board() : readBoard(dir);
  const api = deps.client ?? client(token, { fetch: deps.fetch });

  if (releases) {
    return {
      token: true,
      source: "releases",
      rows: newestFirst(await api.tasks(board.releases_ds)),
    };
  }
  const rows = (await api.tasks(board.tasks_ds))
    .filter((row) => status === null || row.Status === status)
    .filter((row) => id === null || idOf(row.Name) === id);
  return { token: true, source: "tasks", status, id, rows };
}

/** CLI: `node rows.mjs --status "Review"`, `node rows.mjs --id T0.23`, `node rows.mjs --releases`. */
async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  emit(
    await readRows({
      status: value("--status"),
      id: value("--id"),
      releases: args.includes("--releases"),
    }),
  );
}

if (isMain(import.meta.url)) await main();
