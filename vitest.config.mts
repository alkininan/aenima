import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the `@/*` alias straight from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    // Unit tests live next to the code they cover, under src/.
    // `e2e/` belongs to Playwright and must never be picked up here.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});
