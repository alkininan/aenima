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
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["src/**/*.dom.{test,spec}.{ts,tsx}"],
          environment: "node",
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
