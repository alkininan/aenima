import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assess, CHECKS, describeFailed, health, probe } from "./health.mjs";

// T0.16 TC5 → AC5. After a merge lands, the next run asks the deployed site two questions
// from outside — /sign-in answers 200, /app answers 307 — once per commit of main. A
// failure is what the revert is for.
describe("assess", () => {
  const results = (signIn, app) => [
    { path: "/sign-in", expected: 200, status: signIn },
    { path: "/app", expected: 307, status: app },
  ];

  it("is ok when every check answered what it should", () => {
    const result = assess({ commit: "abc", checked: "old", results: results(200, 307) });
    expect(result).toMatchObject({ changed: true, ok: true, failed: [] });
  });

  it("fails on a wrong status, and on no answer at all", () => {
    expect(assess({ commit: "abc", checked: "old", results: results(500, 307) }).ok).toBe(false);
    const silent = assess({ commit: "abc", checked: "old", results: results(200, null) });
    expect(silent.ok).toBe(false);
    expect(silent.failed).toHaveLength(1);
  });

  it("checks nothing when main is the commit last checked, and says so", () => {
    const result = assess({ commit: "abc", checked: "abc", results: [] });
    expect(result).toMatchObject({ changed: false, ok: null });
  });

  it("checks nothing when main cannot be resolved", () => {
    expect(assess({ commit: null, checked: null, results: [] }).changed).toBe(false);
  });
});

describe("describeFailed", () => {
  it("says each path and what it answered, in one clause", () => {
    expect(
      describeFailed([
        { path: "/sign-in", expected: 200, status: 500 },
        { path: "/app", expected: 307, status: null },
      ]),
    ).toBe("/sign-in answered 500 rather than 200 and /app answered nothing rather than 307");
  });
});

describe("probe", () => {
  it("asks each path without following redirects, and reads a thrown fetch as no answer", async () => {
    const asked = [];
    const fetch = async (url, init) => {
      asked.push([url, init.redirect]);
      if (url.endsWith("/app")) throw new Error("timeout");
      return { status: 200 };
    };
    const results = await probe("https://aeni.ma", CHECKS, { fetch });
    expect(asked).toEqual([
      ["https://aeni.ma/sign-in", "manual"],
      ["https://aeni.ma/app", "manual"],
    ]);
    expect(results).toEqual([
      { path: "/sign-in", expected: 200, status: 200 },
      { path: "/app", expected: 307, status: null },
    ]);
  });
});

describe("health", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const runner = (tip) => (args) =>
    args[0] === "rev-parse" ? { status: 0, stdout: `${tip}\n` } : { status: 0, stdout: "" };
  const green = async () => ({ status: 200 });

  it("probes a commit it has not seen, records it, and skips it the next time", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const fetch = async (url) => ({ status: url.endsWith("/app") ? 307 : 200 });
    const first = await health({ deps: { run: runner("c1"), recordPath: record, fetch } });
    expect(first).toMatchObject({ commit: "c1", changed: true, ok: true });
    expect(readFileSync(record, "utf8").trim()).toBe("c1");
    const second = await health({ deps: { run: runner("c1"), recordPath: record, fetch } });
    expect(second).toMatchObject({ commit: "c1", checked: "c1", changed: false, ok: null });
  });

  it("records a failed commit too, so one outage reverts one merge and not every merge after", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const result = await health({ deps: { run: runner("c2"), recordPath: record, fetch: green } });
    expect(result.ok).toBe(false);
    expect(result.failed.map((f) => f.path)).toEqual(["/app"]);
    expect(readFileSync(record, "utf8").trim()).toBe("c2");
  });

  it("fetches before it reads the tip, so origin/main is not an hour old", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const calls = [];
    const run = (args) => {
      calls.push(args[0]);
      return runner("c3")(args);
    };
    await health({ deps: { run, recordPath: join(dir, "checked"), fetch: green } });
    expect(calls.slice(0, 2)).toEqual(["fetch", "rev-parse"]);
  });
});
