import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/proxy";

/**
 * Route protection. The redirect itself needs a request and a Supabase client;
 * what is worth testing in isolation is the decision — which paths an anonymous
 * visitor may reach — because getting that wrong either locks everyone out or
 * leaves the workspace open.
 */
describe("isPublicPath", () => {
  // One real route per public prefix. Keep them real: a sample for a route
  // that was never built reads as evidence the route exists.
  it.each(["/", "/sign-in", "/auth/sign-out", "/dev/primitives"])(
    "leaves %s reachable without a session",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/app", "/app/anything", "/products", "/items/123"])("protects %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  // "/sign-in-somewhere-else" is not "/sign-in": prefix matching has to respect
  // the segment boundary or a crafted path walks straight past the check.
  it("matches whole segments, not string prefixes", () => {
    expect(isPublicPath("/sign-in-not-really")).toBe(false);
    expect(isPublicPath("/authorised")).toBe(false);
    expect(isPublicPath("/devious")).toBe(false);
  });
});
