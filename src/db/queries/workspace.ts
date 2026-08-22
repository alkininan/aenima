import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Workspace reads and first-run creation.
 *
 * CLAUDE.md puts all database access here. These go through the *user's*
 * Supabase client, not Drizzle with a service key: every statement is then
 * subject to RLS as that user, so product isolation is enforced by the
 * database rather than by remembering a `where workspace_id = …`. Drizzle owns
 * the schema and the migrations; the request path owns none of the trust.
 */

export type WorkspaceSummary = {
  id: string;
  name: string;
  timezone: string;
  locale: string;
};

/** The caller's workspace, or null if they have none yet. */
export async function getCurrentWorkspace(): Promise<WorkspaceSummary | null> {
  const supabase = await createClient();

  // RLS restricts this to workspaces the caller is a member of, so there is
  // deliberately no filter here to forget.
  const { data, error } = await supabase
    .from("workspace")
    .select("id, name, timezone, locale")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not read workspace: ${error.message}`);
  return data;
}

/**
 * First run: a signed-in human with no workspace gets one and becomes Owner.
 *
 * The work happens inside `bootstrap_workspace`, a SECURITY DEFINER function,
 * for two reasons: a user with no membership can satisfy no INSERT policy on
 * `workspace`, and doing it in one statement keeps workspace, membership and
 * the activity row in a single transaction. No service-role key is involved.
 *
 * **The function returns the workspace row, and this must keep using it rather
 * than re-reading.** A read-after-write here is not merely wasteful, it is
 * wrong: Next memoizes identical GET fetches for a whole render pass, so a
 * second `getCurrentWorkspace()` in this function does not reach PostgREST at
 * all — it replays the response from the call above, taken *before* the write,
 * which is empty. That is what made first run throw while every later request
 * succeeded: a fresh render pass starts with an empty memo cache, so the early
 * return on line 1 hides it. The read below the write is the only one that
 * ever sees a stale answer, and no amount of retrying inside one pass will
 * change it. Both reads are GETs on the same URL with the same headers, which
 * is exactly the key `createDedupeFetch` dedupes on.
 *
 * `bootstrap_workspace` is idempotent, so concurrent first-run render passes
 * all get the same workspace back instead of one winning and the rest erroring.
 */
export async function ensureWorkspace(name: string): Promise<WorkspaceSummary> {
  const existing = await getCurrentWorkspace();
  if (existing) return existing;

  const supabase = await createClient();

  // An RPC is a POST, which is never memoized — the write and the row it
  // returns come back on the one request that cannot be served from the cache.
  const { data, error } = await supabase
    .rpc("bootstrap_workspace", { p_name: name })
    .select("id, name, timezone, locale")
    .single();

  if (error) throw new Error(`Could not create workspace: ${error.message}`);
  return data;
}
