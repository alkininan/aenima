import { defineConfig, devices } from "@playwright/test";

// Derived, not assumed: CI and preview deploys are not on localhost. The
// default keeps `pnpm e2e` a no-setup command on a dev machine.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Only boot a dev server when the target is the local default. Pointed at a
// deployed URL, starting one would serve nothing the tests visit and leave a
// stray process behind.
const startsOwnServer = !process.env.PLAYWRIGHT_BASE_URL;

/**
 * The production checks need a real `next build`, on a port of their own.
 *
 * They exist for one thing the dev server structurally cannot show: `/dev` is
 * gated on the build mode, so it is *only* in a production build that the gate
 * is even active. A unit test covers `devOnly()` in isolation; this covers the
 * segment actually answering 404 over HTTP, which is what keeps the design
 * system and its fixtures off the public internet.
 *
 * Pointed at a deployed URL these run against it directly, which makes the same
 * assertions a check on the real deployment.
 */
const PRODUCTION_PORT = 3100;
const productionBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PRODUCTION_PORT}`;

const PRODUCTION_SPEC = /production\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial on CI, Playwright's default local concurrency otherwise.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Everything else drives the dev server, which is the only place `/dev`
      // is reachable at all.
      testIgnore: PRODUCTION_SPEC,
    },
    {
      name: "production",
      use: { ...devices["Desktop Chrome"], baseURL: productionBaseURL },
      testMatch: PRODUCTION_SPEC,
    },
  ],
  ...(startsOwnServer
    ? {
        webServer: [
          {
            command: "pnpm dev",
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
          },
          {
            // Never reused, even locally. A server already listening on this
            // port is a build from before whatever is being tested, and a stale
            // build passing these checks is worse than not running them.
            command: `pnpm build && PORT=${PRODUCTION_PORT} pnpm start`,
            url: productionBaseURL,
            reuseExistingServer: false,
            timeout: 180 * 1000,
          },
        ],
      }
    : {}),
});
