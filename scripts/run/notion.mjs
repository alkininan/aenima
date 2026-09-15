#!/usr/bin/env node
/**
 * The board over the Notion API, with an integration token.
 *
 * Two readers need the board without a model in the loop: the guard, which allows a merge or
 * a migration only when it has itself seen the human's word on the thread (`permission.mjs`),
 * and the preflight, which reads every task's comments in one command instead of one
 * connector call per task (`threads.mjs`). Both go through here. The token is an internal
 * integration's, shared with the `dev` teamspace, and lives in `.env.local` as `NOTION_TOKEN`
 * — a file the guard refuses to write and `.worktreeinclude` carries into every worktree
 * (docs/guidelines.md §5, the capability boundary).
 *
 * The token is read and never printed: an error carries the endpoint and the status, not
 * the header that was sent with it. `fetch` is injected so a test drives the client against
 * canned responses and never reaches the network.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const NOTION_VERSION = "2025-09-03";
export const API = "https://api.notion.com/v1";
export const TOKEN_VAR = "NOTION_TOKEN";
export const ENV_FILE = ".env.local";
export const BOARD_FILE = join(".claude", "board.json");

/**
 * The value of `name` in `.env`-style text: `KEY=value`, quotes stripped, first match wins,
 * comments and other keys ignored. Null when the line is absent or empty.
 */
export function envValue(text, name) {
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || match[1] !== name) continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    return value === "" ? null : value;
  }
  return null;
}

/** `NOTION_TOKEN` from `<dir>/.env.local`, or null when the file or the line is absent. */
export function readToken(dir = process.cwd()) {
  try {
    return envValue(readFileSync(join(dir, ENV_FILE), "utf8"), TOKEN_VAR);
  } catch {
    return null;
  }
}

/** `.claude/board.json` — the board's ids and the comment prefix (docs/guidelines.md §1). */
export function readBoard(dir = process.cwd()) {
  return JSON.parse(readFileSync(join(dir, BOARD_FILE), "utf8"));
}

/** The plain text of a rich-text array. */
export const plain = (richText) =>
  (Array.isArray(richText) ? richText : []).map((part) => part?.plain_text ?? "").join("");

/** One comment as the run reads it: `{ id, text, created_time, created_by, discussion_id }`. */
export function comment(raw) {
  return {
    id: raw?.id ?? null,
    text: plain(raw?.rich_text),
    created_time: raw?.created_time ?? "",
    created_by: raw?.created_by ?? null,
    discussion_id: raw?.discussion_id ?? null,
  };
}

/** The page ids a relation property holds, in the order the API lists them. */
const related = (property) =>
  (Array.isArray(property?.relation) ? property.relation : []).map((page) => page?.id);

/**
 * One Tasks row as the run reads it: `{ id, url, Name, Status, Priority, Epic, Blockers,
 * created }`.
 *
 * The Tasks data source holds Status as a select property, not a status property, and the
 * API returns it under `select` (T0.15, T0.16). That shape alone is read: a status-typed
 * property is not the board's and reads null, which the guard then refuses at "no status".
 * Priority is a select too; Epic and Blockers are relations, read as the page ids they hold,
 * which is what the picker orders and sequences by (T0.17). A relation lists its first 25
 * pages inline — far more Blockers than any task carries.
 */
export function task(raw) {
  const props = raw?.properties ?? {};
  return {
    id: raw?.id ?? null,
    url: raw?.url ?? null,
    Name: plain(props.Name?.title),
    Status: props.Status?.select?.name ?? null,
    Priority: props.Priority?.select?.name ?? null,
    Epic: related(props.Epic),
    Blockers: related(props.Blockers),
    created: raw?.created_time ?? null,
  };
}

/** How long one request may take, and the most a 429 may hold a call. */
export const TIMEOUT_MS = 4000;
export const RETRY_CAP_MS = 2000;

/**
 * A client bound to one token. Every call returns parsed JSON or throws an error naming the
 * endpoint and the status — never the token. A `429` is retried once after the `Retry-After`
 * the API asks for, capped; the board is read at the API's ~3 requests a second and nothing
 * here needs more. Every request carries an abort signal: the guard runs under a hook
 * timeout, and a call that hangs past it would let the command through with nothing having
 * read the thread (review pass 2). A slow board fails closed, never open.
 */
export function client(
  token,
  {
    fetch: doFetch = globalThis.fetch,
    sleep = wait,
    timeoutMs = TIMEOUT_MS,
    retryCapMs = RETRY_CAP_MS,
  } = {},
) {
  if (!token) throw new Error(`${TOKEN_VAR} is not set`);

  async function call(method, path, body, retried = false) {
    const response = await doFetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 429 && !retried) {
      const after = Number(response.headers?.get?.("retry-after") ?? 1);
      await sleep(Math.min(Number.isFinite(after) ? after * 1000 : 1000, retryCapMs));
      return call(method, path, body, true);
    }
    if (!response.ok) {
      throw new Error(`Notion API ${method} ${path.split("?")[0]} answered ${response.status}`);
    }
    return response.json();
  }

  /** Every page of a paginated list, `results` concatenated. */
  async function all(next) {
    const results = [];
    let cursor = undefined;
    do {
      const page = await next(cursor);
      results.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }

  return {
    /** The unresolved comments on a page, oldest first as the API lists them. */
    async comments(pageId) {
      const id = String(pageId).replaceAll("-", "");
      const raw = await all((cursor) =>
        call(
          "GET",
          `/comments?block_id=${id}&page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
        ),
      );
      return raw.map(comment);
    },

    /** One Tasks row by page id — its Name and Status as the board holds them. */
    async page(pageId) {
      return task(await call("GET", `/pages/${String(pageId).replaceAll("-", "")}`));
    },

    /** Every row of a data source, every status. */
    async tasks(dataSourceId) {
      const raw = await all((cursor) =>
        call("POST", `/data_sources/${dataSourceId}/query`, {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      );
      return raw.map(task);
    },
  };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
