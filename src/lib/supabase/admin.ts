import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env.server";

/**
 * The service-role client. **Bypasses RLS entirely.**
 *
 * `import "server-only"` above makes it a build error to pull this module into
 * anything that reaches the browser — the rule is worth more as a compiler
 * error than as a comment. Reach for this only where a request has no user to
 * act as; anything acting on behalf of a signed-in human uses `server.ts`, so
 * that the database, not the caller, decides what is visible.
 *
 * Nothing in the request path uses it today: first-run workspace creation goes
 * through `public.bootstrap_workspace()`, which is SECURITY DEFINER precisely
 * so this key never has to be in play.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", serverEnv.serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
