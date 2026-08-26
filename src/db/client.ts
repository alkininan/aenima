import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { serverEnv } from "@/lib/env.server";

/**
 * Drizzle over a direct Postgres connection.
 *
 * **This connection bypasses RLS.** Anything acting on behalf of a signed-in
 * human goes through `src/lib/supabase/server.ts`, so the database decides what
 * is visible instead of the caller remembering to filter.
 *
 * Two things legitimately need the direct connection from the request path, and
 * both arrived with T2.2 — the note above used to say "not for the request
 * path" and no longer can:
 *
 * 1. Reading a workspace's AI key out of `vault.decrypted_secrets`, which
 *    `authenticated` holds no grant on. That is the point of keeping it there.
 * 2. Writing `ai_usage`, which deliberately has no INSERT policy: a client that
 *    could write its own meter row could under-report itself.
 *
 * Neither is a filter someone forgot; both are reads and writes no signed-in
 * role is permitted to make. Use `sharedDbClient()` for them.
 *
 * Each call to `createDbClient` opens its own connection and the caller must
 * end it. That suits a script; it does not suit a code path that runs on every
 * AI call.
 */
export function createDbClient() {
  const sql = postgres(serverEnv.databaseUrl(), { max: 1, prepare: false });
  return { db: drizzle(sql, { schema }), sql };
}

let shared: ReturnType<typeof createDbClient> | null = null;

/**
 * One direct connection, reused for the lifetime of the process.
 *
 * The AI layer touches the database twice per call — once to read the key, once
 * to write the meter row — and `createDbClient()` on each would mean two TLS
 * handshakes against the pooler per model call, then two teardowns, none of
 * which the caller is waiting on the database for.
 *
 * `max: 1` matches `createDbClient`'s pool, so the only thing that changes is
 * that the connection survives between calls: concurrent callers queue on it
 * exactly as they queue today. Raising it is the next lever if the meter ever
 * shows metering itself becoming the wait, and it is a one-line change with a
 * number behind it — which is why it is not being guessed at now.
 *
 * `idle_timeout` lets an idle instance drop its connection rather than holding
 * a pooler slot open forever; the next call reconnects.
 */
export function sharedDbClient() {
  if (!shared) {
    const sql = postgres(serverEnv.databaseUrl(), { max: 1, prepare: false, idle_timeout: 20 });
    shared = { db: drizzle(sql, { schema }), sql };
  }
  return shared;
}

/**
 * Closes the shared connection, if one was opened.
 *
 * A long-lived connection keeps Node's event loop alive, so any script that
 * reaches the AI layer has to call this or hang after its work is done. Servers
 * never call it — the connection outliving a request is the whole point.
 */
export async function closeSharedDbClient(): Promise<void> {
  if (!shared) return;
  const { sql } = shared;
  shared = null;
  await sql.end();
}
