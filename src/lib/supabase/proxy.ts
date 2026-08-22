import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/db/database.types";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

/** Routes reachable without a session. Everything else redirects to sign-in. */
const PUBLIC_PREFIXES = ["/sign-in", "/auth", "/dev"] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the session cookie on every request and turns anonymous traffic
 * away from protected routes.
 *
 * Next 16 renamed `middleware` to `proxy`; this is the body of that, kept in
 * `src/lib` so the root `proxy.ts` stays the three lines the convention wants.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl(), publicEnv.supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between createServerClient and getClaims(): anything that
  // touches cookies in between makes sessions expire at random.
  // getClaims() verifies the token; getSession() does not, and is not safe here.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // Returned as-is on purpose: rebuilding the response drops the refreshed
  // cookies and logs people out at random.
  return supabaseResponse;
}
