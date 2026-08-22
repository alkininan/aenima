import "server-only";

import { required } from "./env";

/**
 * Secrets. Separate module, and `server-only` above, so importing any of this
 * from client code is a build error rather than a review comment.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. Next would not inline it
 * into a client bundle anyway — it only inlines `NEXT_PUBLIC_*` — but relying
 * on that is relying on a bundler detail to hold a security boundary.
 */
export const serverEnv = {
  serviceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),
};
