import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { serverEnv } from "@/lib/env.server";

/**
 * Drizzle over a direct Postgres connection.
 *
 * **This connection bypasses RLS.** It exists for schema work and for the seed
 * script, not for the request path: anything acting on behalf of a signed-in
 * human goes through `src/lib/supabase/server.ts`, so the database decides what
 * is visible instead of the caller remembering to filter.
 */
export function createDbClient() {
  const sql = postgres(serverEnv.databaseUrl(), { max: 1, prepare: false });
  return { db: drizzle(sql, { schema }), sql };
}
