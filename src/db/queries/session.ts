import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * The signed-in user, or null.
 *
 * `getClaims()` verifies the token's signature; `getSession()` reads the cookie
 * without verifying it and must never be trusted on the server. The proxy has
 * already redirected anonymous traffic, but a page that reads user data checks
 * again rather than trusting that it ran.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  const claims = data.claims as { sub?: string; email?: string };
  if (!claims.sub) return null;

  return { id: claims.sub, email: claims.email ?? "" };
}
