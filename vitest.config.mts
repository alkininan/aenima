import { defineConfig } from "vitest/config";

// Resolves the `@/*` alias straight from tsconfig.json.
const resolve = { tsconfigPaths: true } as const;

export default defineConfig({
  resolve,
  test: {
    // Two projects rather than one jsdom for everything: the interaction rules
    // in src/lib are pure logic and are tested as such, which is the point of
    // keeping them out of the components. Only files named `*.dom.test.*` get a
    // DOM, and those are the ones exercising §11's keyboard and focus rules.
    projects: [
      {
        resolve,
        test: {
          name: "node",
          // scripts/ is in here for the hook guards: they are pure decision functions with
          // no DOM and no database, and they are the only logic in the repo that lives
          // outside src/.
          include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,mts,mjs}"],
          exclude: ["src/**/*.dom.{test,spec}.{ts,tsx}", "src/**/*.db.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        resolve,
        test: {
          // Hits a real Postgres, so it reads DATABASE_URL from .env.local and
          // skips loudly when there is none. See src/db/rls.db.test.ts.
          name: "db",
          include: ["src/**/*.db.{test,spec}.{ts,tsx}"],
          environment: "node",
          setupFiles: ["./src/test/setup-db.ts"],
          // Every one of these tests seeds two workspaces over a dozen-odd
          // sequential round trips against a hosted Postgres. At the ~270ms
          // RTT of a remote region that is comfortably past the 5s default,
          // and a timeout there says nothing about the invariant under test.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        resolve,
        test: {
          name: "dom",
          include: ["src/**/*.dom.{test,spec}.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
