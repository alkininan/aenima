import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next 16 renamed `middleware` to `proxy` and pinned it to the Node runtime.
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
