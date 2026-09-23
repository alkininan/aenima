import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { gateOf, landedOnMain, migrationGate, MAIN } from "./migration-gate";

/**
 * T0.26 TC4 → AC4 and TC5 → AC5. Build-log open question 40, ruled: a database test may skip
 * while its migration is still on a branch waiting for the human's `apply`, and never once
 * that file is on `origin/main`. A skip on main is a failure hidden, so every case that is not
 * "the file has not landed yet" runs the tests.
 */

const args = {
  file: "drizzle/0016_opportunity_keys.sql",
  subject: "the key trigger and the per-product counter",
};

describe("gateOf", () => {
  it("skips only while the migration is not on origin/main", () => {
    const gate = gateOf({ ...args, present: false, landed: false });
    expect(gate.skip).toBe(true);
    expect(gate.why).toContain("drizzle/0016_opportunity_keys.sql");
    expect(gate.why).toContain(args.subject);
    expect(gate.why).toContain(MAIN);
  });

  it("does not skip once the migration is on origin/main and the schema is behind it", () => {
    // The half the rule exists for: on main, a missing column is a real failure.
    const gate = gateOf({ ...args, present: false, landed: true });
    expect(gate.skip).toBe(false);
    expect(gate.why).toContain("about to fail");
  });

  it("says nothing at all once the schema object is there", () => {
    expect(gateOf({ ...args, present: true, landed: false })).toEqual({ skip: false, why: null });
    expect(gateOf({ ...args, present: true, landed: true })).toEqual({ skip: false, why: null });
  });
});

describe("landedOnMain", () => {
  const run =
    (answers: Record<string, { status: number | null; error?: Error }>) => (argv: string[]) =>
      answers[argv[0] ?? ""] ?? { status: 1 };

  it("is true when the file is in origin/main's tree", () => {
    expect(
      landedOnMain(args.file, run({ "rev-parse": { status: 0 }, "cat-file": { status: 0 } })),
    ).toBe(true);
  });

  it("is false when origin/main resolves and does not carry the file", () => {
    expect(
      landedOnMain(args.file, run({ "rev-parse": { status: 0 }, "cat-file": { status: 1 } })),
    ).toBe(false);
  });

  it("is true when origin/main cannot be read at all — an unreadable ref hides no skip", () => {
    expect(landedOnMain(args.file, run({ "rev-parse": { status: 128 } }))).toBe(true);
    expect(
      landedOnMain(args.file, run({ "rev-parse": { status: null, error: new Error("no git") } })),
    ).toBe(true);
  });

  it("is true when git could not be run for the file itself", () => {
    expect(
      landedOnMain(
        args.file,
        run({
          "rev-parse": { status: 0 },
          "cat-file": { status: null, error: new Error("no git") },
        }),
      ),
    ).toBe(true);
  });
});

describe("migrationGate", () => {
  it("warns exactly once, with the sentence the gate decided on", () => {
    const said: string[] = [];
    const gate = migrationGate(
      { ...args, present: false },
      { landed: () => false, warn: (text) => said.push(text) },
    );
    expect(gate.skip).toBe(true);
    expect(said).toEqual([gate.why]);
  });

  it("says nothing when there is nothing to say", () => {
    const said: string[] = [];
    migrationGate(
      { ...args, present: true },
      { landed: () => false, warn: (text) => said.push(text) },
    );
    expect(said).toEqual([]);
  });
});

// TC5 → AC5. The banner is the helper's; a file that composes its own is a file that can
// drift from the rule, which is how both of these came to disagree about when to skip.
describe("the database tests that guard a migration", () => {
  const FILES = ["src/db/opportunity-key.db.test.ts", "src/db/refinement.db.test.ts"];

  /** Every `process.stderr.write(…)` call in a source file, as text. */
  function stderrWrites(source: string): string[] {
    const calls: string[] = [];
    const open = "process.stderr.write(";
    for (let at = source.indexOf(open); at !== -1; at = source.indexOf(open, at + 1)) {
      let depth = 0;
      for (let i = at + open.length - 1; i < source.length; i += 1) {
        if (source[i] === "(") depth += 1;
        else if (source[i] === ")") {
          depth -= 1;
          if (depth === 0) {
            calls.push(source.slice(at, i + 1));
            break;
          }
        }
      }
    }
    return calls;
  }

  it("leaves the unapplied-migration banner to the helper", () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("migrationGate(");
      const own = stderrWrites(source).filter((call) => call.includes("drizzle/00"));
      expect(own, file).toEqual([]);
    }
  });
});
