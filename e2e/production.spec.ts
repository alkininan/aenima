import { expect, test } from "@playwright/test";

/**
 * What a production build serves, and what it refuses to.
 *
 * These run against a real `next build`, on their own port, because the one
 * thing they exist to check does not exist anywhere else: `/dev` is gated on the
 * build mode (`src/app/dev/dev-only.ts`), so the gate is inert under `next dev`
 * and every other browser test in this suite depends on it being inert.
 *
 * `devOnly()` has a unit test, but a unit test cannot say whether the segment is
 * wired to it — a page added later that forgets the call, a layout that stops
 * rendering it, a Next change to how `NODE_ENV` reaches a server component.
 * **That gate is what keeps the design system, its fixtures and the
 * server-boundary preview off the public internet**, so what matters is the
 * status code over HTTP, from the build that would actually ship.
 *
 * Statuses are read through `request` rather than `page.goto`, because a browser
 * follows redirects and `/app`'s answer *is* a redirect. Following it would turn
 * a 307 into whatever sign-in returns and assert nothing about the proxy.
 */
test.describe("a production build", () => {
  test("serves the public pages", async ({ request }) => {
    expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(200);
    expect((await request.get("/sign-in", { maxRedirects: 0 })).status()).toBe(200);
  });

  // The proxy turns anonymous traffic away before the page reads any user data.
  test("turns anonymous traffic away from the app", async ({ request }) => {
    const response = await request.get("/app", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/sign-in");
  });

  /**
   * The one these exist for. Both `/dev` pages are 200 under `next dev` — the
   * rest of the suite drives them — so a 404 here is the gate working, and a 200
   * would mean the previews are live on the internet.
   */
  test("refuses every /dev page", async ({ request }) => {
    for (const path of ["/dev/primitives", "/dev/list"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
    }
  });
});
