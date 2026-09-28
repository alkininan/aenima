import { describe, expect, it } from "vitest";

import { nextAfterGate } from "./gate-cap.mjs";

/**
 * T0.46 TC4 → AC4 (and TC3 → AC3 for the destructive case): what the run does after the
 * gatekeeper's verdict, counted in code. MERGE and MERGE APPLY go to the merge leg; a HOLD is
 * findings, fixed and re-gated, each round counted toward the three-corrections rule by the
 * reviewer's pass; the third stops at Decision; a destructive migration that waits is Decision
 * with the migration question whatever the verdict said.
 */

const gate = (verdict, reasons = [], commit = "commit abc1234") =>
  ["# T0.46 — gate", "", commit, "", ...reasons, "", verdict, ""].join("\n");
const review = (pass, last = "PASS") =>
  ["# T0.46 — review", "", "abc1234", "", `pass ${pass}`, "", last, ""].join("\n");
const clean = { ok: true, reasons: [], migrations: [] };
const held = {
  ok: false,
  reasons: [
    {
      rule: "it adds the destructive migration drizzle/0022_x.sql",
      ungate: "UPDATE rewrites rows; say apply",
    },
  ],
  migrations: [{ path: "drizzle/0022_x.sql", safety: "destructive", waits: true }],
};
const REASONS = [
  "1. The diff renames a route the ticket did not ask for.",
  "2. Rule (c) is loosened by nobody's sentence.",
];

describe("the gate cap", () => {
  it("goes to the merge leg on MERGE, and to the apply leg on MERGE APPLY", () => {
    expect(nextAfterGate({ gate: gate("MERGE"), review: review(1), diff: clean })).toMatchObject({
      next: "merge",
      verdict: "MERGE",
      commit: "abc1234",
    });
    expect(
      nextAfterGate({ gate: gate("MERGE APPLY"), review: review(2), diff: clean }),
    ).toMatchObject({ next: "apply", verdict: "MERGE APPLY" });
  });

  // TC4 → AC4: a HOLD is fixed and re-gated; the reviewer reads the fixes as the next pass.
  it("builds on a HOLD while a pass is left, carrying the reasons and naming the next pass", () => {
    const first = nextAfterGate({ gate: gate("HOLD", REASONS), review: review(1), diff: clean });
    expect(first).toMatchObject({ next: "build", verdict: "HOLD", reasons: REASONS });
    expect(first.why).toContain("pass 2");
    expect(
      nextAfterGate({ gate: gate("HOLD", REASONS), review: review(2), diff: clean }).next,
    ).toBe("build");
  });

  // TC4 → AC4: the third HOLD on one claim stops at Decision — the reviewer's pass is 3, and
  // there is no pass 4 to read the fixes.
  it("stops at Decision on a HOLD after the third pass, quoting the reasons", () => {
    const third = nextAfterGate({ gate: gate("HOLD", REASONS), review: review(3), diff: clean });
    expect(third).toMatchObject({ next: "decision", reasons: REASONS });
    expect(third.why).toContain("pass 3");
  });

  // TC3 → AC3, review pass 1 Must 1: a MERGE over a migration that waits would land code
  // reading a column nobody created — the script found a migration the gatekeeper's word did
  // not, and only MERGE APPLY opens the apply door — so it is a verdict the run cannot act on.
  it("stops at Decision on a MERGE over an additive migration that waits, naming it", () => {
    const additive = {
      ok: true,
      reasons: [],
      migrations: [
        { path: "drizzle/0022_x.sql", safety: "additive", waits: true },
        { path: "drizzle/0021_y.sql", safety: "additive", waits: false, applied: true },
      ],
    };
    const result = nextAfterGate({ gate: gate("MERGE"), review: review(1), diff: additive });
    expect(result).toMatchObject({ next: "decision", verdict: "MERGE", commit: "abc1234" });
    expect(result.why).toContain("drizzle/0022_x.sql");
    expect(result.why).not.toContain("drizzle/0021_y.sql");
    expect(result.why).toContain("MERGE APPLY");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("drizzle/0022_x.sql");
    // The same diff under MERGE APPLY is the apply leg, and once applied a MERGE is a merge.
    expect(
      nextAfterGate({ gate: gate("MERGE APPLY"), review: review(1), diff: additive }).next,
    ).toBe("apply");
    const applied = {
      ...additive,
      migrations: additive.migrations.map((m) => ({ ...m, waits: false })),
    };
    expect(nextAfterGate({ gate: gate("MERGE"), review: review(1), diff: applied }).next).toBe(
      "merge",
    );
  });

  // TC3 → AC3: a destructive migration that waits is the human's apply, whatever the verdict.
  it("goes to Decision with the migration question when a destructive migration waits", () => {
    for (const verdict of ["HOLD", "MERGE", "MERGE APPLY"]) {
      const result = nextAfterGate({ gate: gate(verdict), review: review(1), diff: held });
      expect(result, verdict).toMatchObject({ next: "migration", reasons: held.reasons });
      expect(result.why, verdict).toContain("drizzle/0022_x.sql");
    }
  });

  it("stops at Decision on a file it cannot read as a verdict, and on none", () => {
    expect(nextAfterGate({ gate: null, review: review(1), diff: clean })).toMatchObject({
      next: "decision",
      why: "no gatekeeper verdict was written",
    });
    expect(nextAfterGate({ gate: gate("MERGED"), review: review(1), diff: clean }).next).toBe(
      "decision",
    );
    expect(
      nextAfterGate({ gate: gate("MERGE", [], ""), review: review(1), diff: clean }),
    ).toMatchObject({
      next: "decision",
      why: expect.stringContaining("names no commit"),
    });
  });

  it("stops at Decision on a HOLD whose round it cannot count", () => {
    expect(nextAfterGate({ gate: gate("HOLD", REASONS), review: null, diff: clean }).next).toBe(
      "decision",
    );
    const unnumbered = ["# T0.46 — review", "", "PASS", ""].join("\n");
    expect(
      nextAfterGate({ gate: gate("HOLD", REASONS), review: unnumbered, diff: clean }).next,
    ).toBe("decision");
  });
});
