import { defineConfig, devices } from "@playwright/test";

// Derived, not assumed: CI and preview deploys are not on localhost. The
// default keeps `pnpm e2e` a no-setup command on a dev machine.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Only boot a dev server when the target is the local default. Pointed at a
// deployed URL, starting one would serve nothing the tests visit and leave a
// stray process behind.
const startsOwnServer = !process.env.PLAYWRIGHT_BASE_URL;

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
    },
  ],
  ...(startsOwnServer
    ? {
        webServer: {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }
    : {}),
});
