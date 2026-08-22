import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out is a POST: a GET would let any image tag or prefetch sign a person
 * out. The Supabase client clears the session cookies through the same cookie
 * adapter the rest of the app uses.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
}
