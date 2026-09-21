import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

// T0.25 TC1 → AC1. Over a real repository, because the defect is what git answers for a ref a
// worktree never moves: a scheduled run's local `main` is wherever the primary checkout was last
// left, and on T1.4's addendum round that was `c310b30` while `origin/main` was `ed0c5b8`.
describe("review scope with no base, in a worktree whose local main is behind origin/main", () => {
  let dir;

  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (name) => {
    writeFileSync(join(dir, name), "export {};\n");
    git("add", name);
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", name);
    return git("rev-parse", "HEAD");
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aenima-scope-"));
    git("init", "--quiet", "--initial-branch=main");
    const stale = commit("base.txt");
    // Another ticket's test, merged since the primary checkout last moved `main`.
    git("update-ref", "refs/remotes/origin/main", commit("other.test.mjs"));
    git("checkout", "--quiet", "-b", "t9-9");
    commit("mine.test.mjs");
    git("branch", "--force", "main", stale);
    writeFileSync(join(dir, "ticket.md"), "# T9.9\n\n## Tests\n\nTC1 → AC1.\n");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads only the branch's own test files", () => {
    const cli = spawnSync("node", [join(import.meta.dirname, "review-scope.mjs"), "ticket.md"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({
      touched: ["mine.test.mjs"],
      files: ["mine.test.mjs"],
    });
  });

  it("defaults to origin/main in the library too, for any caller that passes no base", () => {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    };
    touchedTests(run);
    reviewScope({ ticketText: ticket, run, exists: () => true });
    expect(calls.map((args) => args.at(-1))).toEqual(["origin/main...HEAD", "origin/main...HEAD"]);
  });
});

// T0.25 TC2 → AC2, TC3 → AC3. T1.4's Tests section as it was claimed: four test files under a
// dynamic route directory, and two precedents named in prose. The script read the first four as
// `/OpportunityHeader.dom.test.tsx` and the rest, and the last two as files the checkout lacked
// — six names in `missing`, every one of them on disk (docs/reviews/T1.4.md).
const t14 = `# T1.4 Opportunity page and key

## Tests

- \`src/db/opportunity-key.db.test.ts\` — the trigger, against a real Postgres, as
  \`item-key.db.test.ts\` holds \`item.key\`: per-product counters, no gaps, and a supplied key
  overwritten.
- \`src/db/queries/opportunity.test.ts\` — \`getOpportunityByKey\` against the recording PostgREST
  stand-in \`item.test.ts\` uses: one request, \`workspace_id\` and \`key\` both filtered.
- \`src/app/o/[key]/OpportunityHeader.dom.test.tsx\` — the header renders the summary when there is
  one and omits the line when there is not.
- \`src/app/o/[key]/ItemsSection.dom.test.tsx\` — the empty-state sentence when nothing is linked.
- \`src/app/o/[key]/ItemLine.dom.test.tsx\` — an item line links to \`/i/<key>\`.
- \`src/app/i/[key]/ItemHeader.dom.test.tsx\` — the opportunity line is a link to \`/o/<key>\`.
- \`e2e/item.spec.ts\` — the lineage assertion inverts with the thing it guarded.

## Done
`;

const T14_CITED = [
  "src/db/opportunity-key.db.test.ts",
  "src/db/queries/opportunity.test.ts",
  "src/app/o/[key]/OpportunityHeader.dom.test.tsx",
  "src/app/o/[key]/ItemsSection.dom.test.tsx",
  "src/app/o/[key]/ItemLine.dom.test.tsx",
  "src/app/i/[key]/ItemHeader.dom.test.tsx",
  "e2e/item.spec.ts",
];

describe("the paths a ticket cites", () => {
  it("keeps a dynamic route segment whole rather than cutting the path at its bracket", () => {
    expect(namedTests(t14).filter((file) => file.includes("["))).toEqual([
      "src/app/o/[key]/OpportunityHeader.dom.test.tsx",
      "src/app/o/[key]/ItemsSection.dom.test.tsx",
      "src/app/o/[key]/ItemLine.dom.test.tsx",
      "src/app/i/[key]/ItemHeader.dom.test.tsx",
    ]);
    expect(
      namedTests("## Tests\n\n`src/app/[[...slug]]/a.test.tsx`, `src/app/[...rest]/b.test.tsx`\n"),
    ).toEqual(["src/app/[[...slug]]/a.test.tsx", "src/app/[...rest]/b.test.tsx"]);
  });

  it("reports nothing missing when every cited file is on disk, T1.4's included", () => {
    const onDisk = new Set([
      ...T14_CITED,
      "src/db/item-key.db.test.ts",
      "src/db/queries/item.test.ts",
    ]);
    const scope = reviewScope({ ticketText: t14, run: diff([]), exists: (f) => onDisk.has(f) });
    expect(scope.missing).toEqual([]);
    expect(scope.files).toEqual([...T14_CITED].sort());
  });

  it("does not count a precedent named in prose as a cited file", () => {
    expect(namedTests(t14)).toEqual(T14_CITED);
    expect(namedTests(t14)).not.toContain("item-key.db.test.ts");
    expect(namedTests(t14)).not.toContain("item.test.ts");
  });
});

// T0.25 TC4 → AC4. T2.9's addendum round named its tests in the `## Addendum` section — TA2 ran
// `scripts/run/log-index.test.mjs` — and the reviewer, handed only `## Tests`, ran it by hand.
describe("the tests an addendum names", () => {
  const t29 = `# T2.9 Applicability stability

## Tests

- TC1 → AC1 — \`src/packs/feature-prd.test.ts\`

## Done

\`pnpm lint && pnpm typecheck && pnpm test\`

## Addendum

The three tests, as run:

- **TA2 → AA2** \`pnpm lint && pnpm typecheck && pnpm test\` on the merged tree;
  \`scripts/run/log-index.test.mjs\` passes, so the build-log list is the generated one.

## Addendum — renumber (2026-09-20)

- TA4 → AA4 \`src/db/migrations.test.ts\`

## Cited

### product-spec §4

\`src/never/cited.test.ts\`
`;

  it("reads every Addendum section as well as Tests, and nothing after them", () => {
    expect(namedTests(t29)).toEqual([
      "src/packs/feature-prd.test.ts",
      "scripts/run/log-index.test.mjs",
      "src/db/migrations.test.ts",
    ]);
  });

  it("puts an addendum's test in the reviewer's list", () => {
    const scope = reviewScope({ ticketText: t29, run: diff([]), exists: () => true });
    expect(scope.files).toContain("scripts/run/log-index.test.mjs");
  });
});
