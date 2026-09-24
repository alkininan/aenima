import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assess, CHECKS, describeFailed, health, probe } from "./health.mjs";

const root = join(import.meta.dirname, "..", "..");

// T0.16 TC5 → AC5. After a merge lands, the next run asks the deployed site two questions
// from outside — /sign-in answers 200, /app answers 307 — once per commit of main. A
// failure is what the revert is for.
describe("assess", () => {
  const results = (signIn, app) => [
    { path: "/sign-in", expected: 200, status: signIn },
    { path: "/app", expected: 307, status: app },
  ];

  // T0.39 TC1 → AC1: the third outcome sits beside this one.
  it("is up when every check answered what it should", () => {
    const result = assess({ commit: "abc", checked: "old", results: results(200, 307) });
    expect(result).toMatchObject({ changed: true, outcome: "up", failed: [], unanswered: [] });
  });

  // T0.39 TC2 → AC2. A wrong status is down, and down is what reverts.
  it("is down on a wrong status, whether or not another check was silent", () => {
    const wrong = assess({ commit: "abc", checked: "old", results: results(500, 307) });
    expect(wrong).toMatchObject({ outcome: "down" });
    expect(wrong.failed.map((f) => f.path)).toEqual(["/sign-in"]);
    const both = assess({ commit: "abc", checked: "old", results: results(500, null) });
    expect(both).toMatchObject({ outcome: "down" });
    expect(both.failed.map((f) => f.path)).toEqual(["/sign-in"]);
    expect(both.unanswered.map((f) => f.path)).toEqual(["/app"]);
  });

  // T0.39 TC1 → AC1. Silence is not a wrong answer: a merge cannot break a name lookup.
  it("is unknown, never down, when a check never answered and none answered wrongly", () => {
    const silent = assess({ commit: "abc", checked: "old", results: results(200, null) });
    expect(silent).toMatchObject({ changed: true, outcome: "unknown", failed: [] });
    expect(silent.unanswered.map((f) => f.path)).toEqual(["/app"]);
    const mute = assess({ commit: "abc", checked: "old", results: results(null, null) });
    expect(mute).toMatchObject({ outcome: "unknown", failed: [] });
  });

  it("checks nothing when main is the commit last checked, and says so", () => {
    const result = assess({ commit: "abc", checked: "abc", results: [] });
    expect(result).toMatchObject({ changed: false, outcome: null });
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
  it("asks each path without following redirects, asks a silent one again, and reads two silences as no answer", async () => {
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
      ["https://aeni.ma/app", "manual"],
    ]);
    expect(results).toEqual([
      { path: "/sign-in", expected: 200, status: 200 },
      { path: "/app", expected: 307, status: null },
    ]);
  });

  it("takes the second answer when the first attempt was a blip", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      if (calls === 1) throw new Error("blip");
      return { status: 307 };
    };
    const results = await probe("https://aeni.ma", [{ path: "/app", status: 307 }], { fetch });
    expect(results).toEqual([{ path: "/app", expected: 307, status: 307 }]);
    expect(calls).toBe(2);
  });
});

describe("health", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const runner =
    (tip, committedAt = 1_700_000_000) =>
    (args) =>
      args[0] === "rev-parse"
        ? { status: 0, stdout: `${tip}\n` }
        : args[0] === "log"
          ? { status: 0, stdout: `${committedAt}\n` }
          : { status: 0, stdout: "" };
  const green = async () => ({ status: 200 });

  it("probes a commit it has not seen, records it, and skips it the next time", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const fetch = async (url) => ({ status: url.endsWith("/app") ? 307 : 200 });
    const first = await health({ deps: { run: runner("c1"), recordPath: record, fetch } });
    expect(first).toMatchObject({ commit: "c1", changed: true, outcome: "up" });
    expect(readFileSync(record, "utf8").trim()).toBe("c1");
    const second = await health({ deps: { run: runner("c1"), recordPath: record, fetch } });
    expect(second).toMatchObject({ commit: "c1", checked: "c1", changed: false, outcome: null });
  });

  // T0.39 TC2 → AC2
  it("records a failed commit too, so one outage reverts one merge and not every merge after", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const result = await health({ deps: { run: runner("c2"), recordPath: record, fetch: green } });
    expect(result).toMatchObject({ outcome: "down" });
    expect(result.failed.map((f) => f.path)).toEqual(["/app"]);
    expect(result.failedText).toBe("/app answered 200 rather than 307");
    expect(readFileSync(record, "utf8").trim()).toBe("c2");
    const again = await health({ deps: { run: runner("c2"), recordPath: record, fetch: green } });
    expect(again).toMatchObject({ changed: false, outcome: null });
  });

  // T0.39 TC1 → AC1, TC3 → AC3. The 2026-09-24 case: the machine could not look the site up.
  it("reads a site that never answered as unknown, records nothing, and asks again next run", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    let asked = 0;
    const silent = async () => {
      asked += 1;
      throw new Error("getaddrinfo ENOTFOUND aeni.ma");
    };
    const first = await health({ deps: { run: runner("c5"), recordPath: record, fetch: silent } });
    expect(first).toMatchObject({ commit: "c5", changed: true, outcome: "unknown" });
    expect(first.failed).toEqual([]);
    expect(first.why).toContain("could not be reached from this machine");
    expect(existsSync(record)).toBe(false);
    const fetch = async (url) => ({ status: url.endsWith("/app") ? 307 : 200 });
    const second = await health({ deps: { run: runner("c5"), recordPath: record, fetch } });
    expect(second).toMatchObject({ commit: "c5", changed: true, outcome: "up" });
    expect(readFileSync(record, "utf8").trim()).toBe("c5");
    expect(asked).toBe(4);
  });

  // T0.39 TC1 → AC1: a wait asked nothing, so it has no outcome.
  it("waits, asking and recording nothing, while the commit is younger than the deploy window", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const asked = [];
    const fetch = async (url) => (asked.push(url), { status: 200 });
    const now = () => 1_700_000_000_000 + 60_000; // a minute after the commit
    const result = await health({
      deps: { run: runner("c4", 1_700_000_000), recordPath: record, fetch, now },
    });
    expect(result).toMatchObject({ commit: "c4", changed: true, outcome: null, waiting: true });
    expect(result.why).toContain("60 s ago");
    expect(asked).toEqual([]);
    expect(existsSync(record)).toBe(false);
    // Past the window the same commit is asked about and recorded.
    const later = await health({
      deps: {
        run: runner("c4", 1_700_000_000),
        recordPath: record,
        fetch,
        now: () => now() + 10 * 60_000,
      },
    });
    expect(later).toMatchObject({ commit: "c4", changed: true });
    expect(later.waiting).toBeUndefined();
    expect(asked).toHaveLength(2);
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

// T0.39 TC4 → AC4. The rule is written where a run reads it, not only in the script.
describe("the deploy check's three outcomes, as the skill and the guidelines state them", () => {
  const guidelines = readFileSync(join(root, "docs/guidelines.md"), "utf8");
  const skill = readFileSync(join(root, ".claude/skills/ticket/SKILL.md"), "utf8");
  const skillStep = skill.match(/^\*\*e\. The deploy\.\*\*[\s\S]*?(?=^\*\*f\. )/m)?.[0] ?? "";
  const section =
    guidelines.match(/^\*\*The deploy check\.\*\*[\s\S]*?(?=^\*\*The marker\*\*)/m)?.[0] ?? "";

  it("the skill's step e reverts on down alone and asks again on unknown", () => {
    expect(skillStep).toContain("`outcome: unknown`");
    expect(skillStep).toContain("`outcome: down`");
    expect(skillStep).toMatch(/unknown never\s+reverts/);
  });

  it("the guidelines' deploy check names up, down and unknown, and only down reverts", () => {
    expect(section).toContain("**up**");
    expect(section).toContain("**down**");
    expect(section).toContain("**unknown**");
    expect(section).toContain("Only down reverts");
    expect(section).toContain("asks again");
  });
});
