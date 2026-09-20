import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ADMIN_ENV,
  appliedBetween,
  apply,
  journalEntries,
  MIGRATIONS,
  pendingAfter,
  scrub,
} from "./apply.mjs";
import { readThread, shapeOf } from "./comments.mjs";

const JOURNAL = {
  version: "7",
  dialect: "postgresql",
  entries: [
    { idx: 13, version: "7", when: 1300, tag: "0013_add_runs", breakpoints: true },
    { idx: 14, version: "7", when: 1400, tag: "0014_test_users", breakpoints: true },
    { idx: 15, version: "7", when: 1500, tag: "0015_refinement_round", breakpoints: true },
  ],
};

/** A repository laid out as the schedule lays it out: the primary checkout and a worktree. */
function fixture({ adminEnv = true, decoy = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "aenima-apply-"));
  const primary = join(root, "aenima");
  const worktree = join(primary, ".claude", "worktrees", "w1");
  mkdirSync(join(worktree, MIGRATIONS, "meta"), { recursive: true });
  writeFileSync(join(worktree, MIGRATIONS, "meta", "_journal.json"), JSON.stringify(JOURNAL));
  if (adminEnv) writeFileSync(join(primary, ADMIN_ENV), "DATABASE_URL=postgresql://a:b@h/db\n");
  if (decoy) writeFileSync(join(worktree, ADMIN_ENV), "DATABASE_URL=postgresql://x:y@decoy/db\n");
  return { root, primary, worktree };
}

let fx;
afterEach(() => {
  if (fx) rmSync(fx.root, { recursive: true, force: true });
  fx = null;
});

/** A worker that answers with `payload` as the run reads it: JSON on stdout. */
const worker = (payload, status = 0) => ({
  status,
  stdout: `${JSON.stringify(payload)}\n`,
  stderr: "",
});

describe("apply — TC1 · AC1 a granted apply reaches the database from a worktree", () => {
  beforeEach(() => {
    fx = fixture();
  });

  it("runs the worker and reports what it applied", () => {
    const seen = [];
    const result = apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: (spec) => {
          seen.push(spec);
          return worker({ ok: true, applied: [{ idx: 15, tag: "0015_refinement_round" }] });
        },
      },
    });

    expect(seen).toHaveLength(1);
    expect(result).toMatchObject({
      ok: true,
      applied: [{ idx: 15, tag: "0015_refinement_round" }],
    });
  });

  it("applies the migrations of the checkout it was run from, not the primary's", () => {
    let spec = null;
    apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: (s) => {
          spec = s;
          return worker({ ok: true, applied: [] });
        },
      },
    });

    expect(spec.args).toContain(join(fx.worktree, MIGRATIONS));
    expect(spec.args).not.toContain(join(fx.primary, MIGRATIONS));
  });

  it("refuses rather than guessing when the checkout has no journal", () => {
    rmSync(join(fx.worktree, MIGRATIONS), { recursive: true, force: true });
    const result = apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: () => {
          throw new Error("the worker must not run");
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/journal/i);
  });
});

describe("apply — TC2 · AC2 the worktree session never reads the admin env file", () => {
  it("points the worker at the primary checkout's copy and runs it there", () => {
    fx = fixture({ decoy: true });
    let spec = null;
    apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        env: { PATH: "/usr/bin", DATABASE_URL: "postgresql://stale:pw@old/db" },
        run: (s) => {
          spec = s;
          return worker({ ok: true, applied: [] });
        },
      },
    });

    expect(spec.cwd).toBe(fx.primary);
    expect(spec.args).toContain(`--env-file=${join(fx.primary, ADMIN_ENV)}`);
    // The decoy inside the worktree is never the file the credential comes from.
    expect(spec.args.join(" ")).not.toContain(join(fx.worktree, ADMIN_ENV));
  });

  it("hands the child no DATABASE_URL of its own, so the file is its only source", () => {
    fx = fixture();
    let spec = null;
    apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        env: { PATH: "/usr/bin", DATABASE_URL: "postgresql://stale:pw@old/db" },
        run: (s) => {
          spec = s;
          return worker({ ok: true, applied: [] });
        },
      },
    });

    expect(spec.env.DATABASE_URL).toBeUndefined();
    expect(spec.env.PATH).toBe("/usr/bin");
  });

  it("says so rather than looking elsewhere when the primary checkout has none", () => {
    fx = fixture({ adminEnv: false, decoy: true });
    const result = apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: () => {
          throw new Error("the worker must not run");
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.why).toContain(ADMIN_ENV);
  });

  it("scrubs a connection string out of anything it surfaces", () => {
    expect(scrub("connect ECONNREFUSED postgresql://u:pw@db.example:5432/postgres now")).toBe(
      "connect ECONNREFUSED [a connection string] now",
    );
    expect(scrub('role "x" does not exist')).toBe('role "x" does not exist');
  });

  it("scrubs the child's own output, whatever the worker forgot", () => {
    fx = fixture();
    const result = apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: () => ({
          status: 1,
          stdout: "",
          stderr: "Error: getaddrinfo ENOTFOUND for postgresql://u:pw@h:5432/db\n",
        }),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.why).not.toContain("pw@h");
    expect(result.why).toContain("[a connection string]");
  });
});

describe("apply — TC3 · AC3 the word is consumed once", () => {
  const thread = (comments) => readThread(comments, "⟡ ");
  const asked = {
    text: "⟡ This change adds a migration, drizzle/0015_refinement_round.sql, and applying it to the shared database is your call. I've left it in the diff and stopped here.",
    created_time: "2026-09-20T11:00:00.000Z",
  };
  const said = { text: "apply", created_time: "2026-09-20T11:59:00.000Z" };

  it("reads the word while nothing has answered it", () => {
    expect(shapeOf("Decision", thread([asked, said]))).toBe("apply");
  });

  it("does not read it again once the run has said it applied", () => {
    const answered = {
      text: "⟡ Applied drizzle/0015_refinement_round.sql to the shared database. The ticket picks up where it stopped.",
      created_time: "2026-09-20T12:05:00.000Z",
    };
    const after = thread([asked, said, answered]);
    expect(after.unanswered).toEqual([]);
    expect(shapeOf("Decision", after)).not.toBe("apply");
  });
});

describe("apply — TC4 · AC4 the report names the migration and its journal index", () => {
  it("names every entry the ledger moved over", () => {
    const entries = journalEntries(JSON.stringify(JOURNAL));
    expect(appliedBetween(entries, 1400, 1500)).toEqual([
      { idx: 15, tag: "0015_refinement_round" },
    ]);
  });

  it("names them all when the ledger was empty", () => {
    const entries = journalEntries(JSON.stringify(JOURNAL));
    expect(appliedBetween(entries, null, 1500).map((e) => e.idx)).toEqual([13, 14, 15]);
  });

  it("names none when the ledger did not move", () => {
    const entries = journalEntries(JSON.stringify(JOURNAL));
    expect(appliedBetween(entries, 1500, 1500)).toEqual([]);
  });

  it("says what is pending before anything is run", () => {
    const entries = journalEntries(JSON.stringify(JOURNAL));
    expect(pendingAfter(entries, 1400)).toEqual([{ idx: 15, tag: "0015_refinement_round" }]);
    expect(pendingAfter(entries, null)).toHaveLength(3);
  });
});

describe("apply — TC5 · AC5 a failed apply quotes the database and keeps the word", () => {
  it("carries the database's own error back", () => {
    fx = fixture();
    const result = apply({
      cwd: fx.worktree,
      deps: {
        primary: () => fx.primary,
        run: () => worker({ ok: false, why: 'syntax error at or near "CRATE"', applied: [] }, 1),
      },
    });
    expect(result).toMatchObject({ ok: false, applied: [] });
    expect(result.why).toContain('syntax error at or near "CRATE"');
  });

  it("leaves the word standing: a refusal reports, it does not answer", () => {
    const comments = [
      {
        text: "⟡ This change adds a migration, drizzle/0015_refinement_round.sql, and applying it to the shared database is your call. I've left it in the diff and stopped here.",
        created_time: "2026-09-20T11:00:00.000Z",
      },
      { text: "apply", created_time: "2026-09-20T11:59:00.000Z" },
      {
        text: '⟡ The apply was refused: syntax error at or near "CRATE". Fix the migration on the branch and say apply again.',
        created_time: "2026-09-20T12:05:00.000Z",
      },
    ];
    const after = readThread(comments, "⟡ ");
    expect(after.unanswered.map((c) => c.text)).toEqual(["apply"]);
    expect(shapeOf("Decision", after)).toBe("apply");
  });
});
