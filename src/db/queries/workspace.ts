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
 */
export async function ensureWorkspace(name: string): Promise<WorkspaceSummary> {
  const existing = await getCurrentWorkspace();
  if (existing) return existing;

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_workspace", { p_name: name });

  if (error) {
    // Two tabs racing through first run: the function refuses the second, and
    // the first one's workspace is the right answer for both.
    const created = await getCurrentWorkspace();
    if (created) return created;
    throw new Error(`Could not create workspace: ${error.message}`);
  }

  const created = await getCurrentWorkspace();
  if (!created) throw new Error("Workspace was created but could not be read back");
  return created;
}
