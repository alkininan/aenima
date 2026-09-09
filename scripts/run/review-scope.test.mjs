import { describe, expect, it } from "vitest";

import { namedTests, reviewScope, testsSection, touchedTests } from "./review-scope.mjs";

const ticket = `# T0.9 — Run fixes

## Criteria

AC1 the guard reads commands. AC2 the marker.

## Tests

TC1 → AC1 \`scripts/hooks/guard.test.mjs\`, the five cases.
TC2 → AC2 \`scripts/run/claim.test.mjs\` and, for the stale half, scripts/run/stale.test.mjs.
TC5 → AC5 \`src/app/sign-in/SignInForm.dom.test.tsx\` 20 runs alone.

## Done

\`pnpm lint && pnpm typecheck && pnpm test\` — the whole suite is the gate's, not here.
`;

const diff =
  (lines, status = 0) =>
  () => ({ status, stdout: `${lines.join("\n")}\n` });

describe("review scope", () => {
  it("takes the Tests section and nothing after it", () => {
    expect(testsSection(ticket)).toContain("TC1");
    expect(testsSection(ticket)).not.toContain("pnpm test");
    expect(testsSection("no such section")).toBe("");
  });

  it("names the test files the Tests section cites, once each, in order", () => {
    expect(namedTests(ticket)).toEqual([
      "scripts/hooks/guard.test.mjs",
      "scripts/run/claim.test.mjs",
      "scripts/run/stale.test.mjs",
      "src/app/sign-in/SignInForm.dom.test.tsx",
    ]);
  });

  it("takes only test files from the diff, and nothing when git cannot diff", () => {
    const run = diff(["scripts/run/stale.mjs", "scripts/run/stale.test.mjs", "docs/x.md"]);
    expect(touchedTests(run)).toEqual(["scripts/run/stale.test.mjs"]);
    expect(touchedTests(diff(["a.test.mjs"], 128))).toEqual([]);
  });

  it("is named ∪ touched, existing files only, with what the ticket cites and lacks", () => {
    const run = diff(["src/components/ui/Input.dom.test.tsx", "scripts/run/stale.test.mjs"]);
    const exists = (file) => file !== "scripts/run/claim.test.mjs";
    const scope = reviewScope({ ticketText: ticket, run, exists });
    expect(scope.files).toEqual([
      "scripts/hooks/guard.test.mjs",
      "scripts/run/stale.test.mjs",
      "src/app/sign-in/SignInForm.dom.test.tsx",
      "src/components/ui/Input.dom.test.tsx",
    ]);
    expect(scope.missing).toEqual(["scripts/run/claim.test.mjs"]);
  });

  it("asks git for the diff against the base it is given", () => {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    };
    reviewScope({ ticketText: ticket, run, base: "origin/t0-8", exists: () => true });
    expect(calls[0]).toContain("origin/t0-8...HEAD");
  });
});
