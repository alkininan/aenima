import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assess,
  BYPASS_HEADER,
  CHECKS,
  describeFailed,
  describeTried,
  health,
  isVercelLogin,
  probe,
  readAddresses,
} from "./health.mjs";

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
  // One address that resolves, as every test before T0.43 had it.
  const resolves = async () => ({ address: "76.76.21.21", family: 4 });
  const one = ["https://aeni.ma"];

  it("probes a commit it has not seen, records it, and skips it the next time", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const fetch = async (url) => ({ status: url.endsWith("/app") ? 307 : 200 });
    const first = await health({
      addresses: one,
      deps: { run: runner("c1"), recordPath: record, fetch, lookup: resolves },
    });
    expect(first).toMatchObject({ commit: "c1", changed: true, outcome: "up" });
    expect(readFileSync(record, "utf8").trim()).toBe("c1");
    const second = await health({
      addresses: one,
      deps: { run: runner("c1"), recordPath: record, fetch, lookup: resolves },
    });
    expect(second).toMatchObject({ commit: "c1", checked: "c1", changed: false, outcome: null });
  });

  // T0.39 TC2 → AC2
  it("records a failed commit too, so one outage reverts one merge and not every merge after", async () => {
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    const record = join(dir, "checked");
    const result = await health({
      addresses: one,
      deps: { run: runner("c2"), recordPath: record, fetch: green, lookup: resolves },
    });
    expect(result).toMatchObject({ outcome: "down" });
    expect(result.failed.map((f) => f.path)).toEqual(["/app"]);
    expect(result.failedText).toBe("/app answered 200 rather than 307");
    expect(readFileSync(record, "utf8").trim()).toBe("c2");
    const again = await health({
      addresses: one,
      deps: { run: runner("c2"), recordPath: record, fetch: green, lookup: resolves },
    });
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
    const first = await health({
      addresses: one,
      deps: { run: runner("c5"), recordPath: record, fetch: silent, lookup: resolves },
    });
    expect(first).toMatchObject({ commit: "c5", changed: true, outcome: "unknown" });
    expect(first.failed).toEqual([]);
    expect(first.why).toContain("could not be reached from this machine");
    expect(existsSync(record)).toBe(false);
    const fetch = async (url) => ({ status: url.endsWith("/app") ? 307 : 200 });
    const second = await health({
      addresses: one,
      deps: { run: runner("c5"), recordPath: record, fetch, lookup: resolves },
    });
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
      addresses: one,
      deps: { run: runner("c4", 1_700_000_000), recordPath: record, fetch, now, lookup: resolves },
    });
    expect(result).toMatchObject({ commit: "c4", changed: true, outcome: null, waiting: true });
    expect(result.why).toContain("60 s ago");
    expect(asked).toEqual([]);
    expect(existsSync(record)).toBe(false);
    // Past the window the same commit is asked about and recorded.
    const later = await health({
      addresses: one,
      deps: {
        lookup: resolves,
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
    await health({
      addresses: one,
      deps: { run, recordPath: join(dir, "checked"), fetch: green, lookup: resolves },
    });
    expect(calls.slice(0, 2)).toEqual(["fetch", "rev-parse"]);
  });
});

// T0.43. The domain first, then the deployment's own address: a name that does not resolve is
// skipped and never counted, and the outcome comes from the first address that answers at all.
describe("the fallback address", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const DOMAIN = "https://aeni.ma";
  const VERCEL = "https://aenima-ae-nima.vercel.app";
  const both = [DOMAIN, VERCEL];
  const runner = (tip) => (args) =>
    args[0] === "rev-parse"
      ? { status: 0, stdout: `${tip}\n` }
      : args[0] === "log"
        ? { status: 0, stdout: "1700000000\n" }
        : { status: 0, stdout: "" };
  // aeni.ma has no name since 2026-09-24; the deployment's address still has one.
  const domainGone = async (host) => {
    if (host === "aeni.ma")
      throw Object.assign(new Error("getaddrinfo ENOTFOUND aeni.ma"), { code: "ENOTFOUND" });
    return { address: "76.76.21.21", family: 4 };
  };
  const nothingResolves = async (host) => {
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
  };
  const asked = [];
  const site = (answers) => async (url, init) => {
    asked.push([url, init?.headers ?? {}]);
    const path = new URL(url).pathname;
    const answer = answers[path];
    if (answer === undefined) throw new Error("timeout");
    return typeof answer === "number"
      ? { status: answer, headers: new Headers() }
      : { status: answer.status, headers: new Headers({ location: answer.location }) };
  };
  const setup = () => {
    asked.length = 0;
    dir = mkdtempSync(join(tmpdir(), "aenima-health-"));
    return join(dir, "checked");
  };

  // T0.43 TC1 → AC1
  it("answers up from the deployment's address when the domain does not resolve", async () => {
    const record = setup();
    const result = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d1"),
        recordPath: record,
        lookup: domainGone,
        fetch: site({ "/sign-in": 200, "/app": 307 }),
      },
    });
    expect(result).toMatchObject({ commit: "d1", changed: true, outcome: "up", base: VERCEL });
    expect(result.failed).toEqual([]);
    expect(asked.map(([url]) => url)).toEqual([`${VERCEL}/sign-in`, `${VERCEL}/app`]);
    expect(result.tried.map((t) => t.base)).toEqual([DOMAIN, VERCEL]);
    expect(result.tried[0]).toMatchObject({ resolved: false });
    expect(readFileSync(record, "utf8").trim()).toBe("d1");
  });

  // T0.43 TC2 → AC2
  it("answers down from the deployment's address when it answers wrong, as the domain would have", async () => {
    const record = setup();
    const result = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d2"),
        recordPath: record,
        lookup: domainGone,
        fetch: site({ "/sign-in": 500, "/app": 307 }),
      },
    });
    expect(result).toMatchObject({ outcome: "down", base: VERCEL });
    expect(result.failed.map((f) => f.path)).toEqual(["/sign-in"]);
    expect(result.failedText).toBe("/sign-in answered 500 rather than 200");
    expect(readFileSync(record, "utf8").trim()).toBe("d2");
  });

  // T0.43 TC3 → AC3
  it("answers unknown when neither address answers, names both, and records nothing", async () => {
    const record = setup();
    const result = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d3"),
        recordPath: record,
        lookup: domainGone,
        fetch: site({}),
      },
    });
    expect(result).toMatchObject({ outcome: "unknown", base: null, failed: [] });
    expect(result.why).toContain(`${DOMAIN} does not resolve`);
    expect(result.why).toContain(`${VERCEL}: /sign-in answered nothing`);
    expect(result.why).toContain("could not be reached from this machine");
    expect(existsSync(record)).toBe(false);

    const none = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d3"),
        recordPath: record,
        lookup: nothingResolves,
        fetch: site({}),
      },
    });
    expect(none).toMatchObject({ outcome: "unknown", base: null });
    expect(none.why).toContain(`${DOMAIN} does not resolve`);
    expect(none.why).toContain(`${VERCEL} does not resolve`);
  });

  // T0.43 TC4 → AC3. Vercel's login wall is not the deployment answering: read as an answer it
  // would be "/sign-in answered 302 rather than 200", down, and every healthy merge would revert.
  it("reads a redirect to Vercel's login as no answer from the deployment, never as down", async () => {
    const record = setup();
    const wall = { status: 302, location: "https://vercel.com/sso-api?url=x&nonce=y" };
    const result = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d4"),
        recordPath: record,
        lookup: domainGone,
        fetch: site({ "/sign-in": wall, "/app": wall }),
      },
    });
    expect(result).toMatchObject({ outcome: "unknown", failed: [] });
    expect(result.why).toContain(`${VERCEL}: /sign-in went to Vercel's login`);
    expect(existsSync(record)).toBe(false);
    // Asked once each: a login is an answer from Vercel, not a blip to ask again.
    expect(asked).toHaveLength(2);

    // The 401 page some clients are served instead reads the same way.
    const page = async () => ({
      status: 401,
      headers: new Headers({ "set-cookie": "_vercel_sso_nonce=n; Path=/; Secure; HttpOnly" }),
    });
    const other = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d4"),
        recordPath: record,
        lookup: domainGone,
        fetch: page,
      },
    });
    expect(other).toMatchObject({ outcome: "unknown", failed: [] });
    expect(existsSync(record)).toBe(false);
  });

  // T0.43 TC5 → AC1. With the bypass secret the wall lets the check through — and the secret
  // goes to the deployment's own address alone, never to the custom domain.
  it("sends the bypass secret to a vercel.app address only", async () => {
    const record = setup();
    const result = await health({
      addresses: both,
      deps: {
        run: runner("d5"),
        recordPath: record,
        lookup: async () => ({ address: "76.76.21.21", family: 4 }),
        bypass: "s3cret",
        fetch: site({}),
      },
    });
    expect(result.outcome).toBe("unknown");
    const sent = asked.map(([url, headers]) => [new URL(url).host, headers[BYPASS_HEADER] ?? null]);
    expect(sent.filter(([host]) => host === "aeni.ma").every(([, secret]) => secret === null)).toBe(
      true,
    );
    expect(
      sent
        .filter(([host]) => host.endsWith(".vercel.app"))
        .every(([, secret]) => secret === "s3cret"),
    ).toBe(true);
    expect(sent.some(([host]) => host.endsWith(".vercel.app"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("s3cret");
  });

  // T0.43 TC6 → AC1. The domain first: when it answers, the deployment's address is not asked.
  it("takes the domain's answer when the domain answers, and asks nothing else", async () => {
    setup();
    const result = await health({
      addresses: both,
      deps: {
        bypass: null,
        run: runner("d6"),
        recordPath: join(dir, "checked"),
        lookup: async () => ({ address: "76.76.21.21", family: 4 }),
        fetch: site({ "/sign-in": 200, "/app": 307 }),
      },
    });
    expect(result).toMatchObject({ outcome: "up", base: DOMAIN });
    expect(asked.every(([url]) => url.startsWith(DOMAIN))).toBe(true);
  });

  // T0.43 TC7 → AC3. The wall by the shapes Vercel answers with, and the site's own redirects not.
  it("names Vercel's login by its nonce or a redirect to vercel.com, and nothing else", () => {
    const at = (status, location) => ({
      status,
      headers: new Headers(location ? { location } : {}),
    });
    expect(isVercelLogin(at(302, "https://vercel.com/sso-api?url=x"))).toBe(true);
    expect(isVercelLogin(at(307, "/sign-in"))).toBe(false);
    expect(isVercelLogin(at(307, "https://aeni.ma/sign-in"))).toBe(false);
    expect(isVercelLogin(at(200))).toBe(false);
    expect(isVercelLogin({ status: 302 })).toBe(false);
    const nonce = (status) => ({
      status,
      headers: new Headers({ "set-cookie": "_vercel_sso_nonce=n; Max-Age=3600; Path=/; Secure" }),
    });
    expect(isVercelLogin(nonce(401))).toBe(true);
    expect(isVercelLogin(nonce(302))).toBe(true);
    expect(
      isVercelLogin({ status: 200, headers: new Headers({ "set-cookie": "sb-auth=x; Path=/" }) }),
    ).toBe(false);
  });

  // T0.43 TC8 → AC3. The unknown line names each address and what it returned.
  it("says what each address returned, in one line", () => {
    expect(
      describeTried([
        { base: DOMAIN, resolved: false, results: [] },
        {
          base: VERCEL,
          resolved: true,
          results: [
            { path: "/sign-in", expected: 200, status: null, login: true },
            { path: "/app", expected: 307, status: null },
          ],
        },
      ]),
    ).toBe(
      `${DOMAIN} does not resolve; ${VERCEL}: /sign-in went to Vercel's login and /app answered nothing`,
    );
  });

  // T0.43 TC9 → AC1 (Build 1). The addresses live in the board file, the domain first.
  it("reads the addresses from .claude/board.json, the domain first and the deployment second", () => {
    expect(readAddresses(root)).toEqual([DOMAIN, VERCEL]);
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

  // T0.43 TC10 → AC1 (Build 3). The fallback is written where a run reads it: step 0's row and
  // the deploy-check paragraph.
  it("the guidelines' deploy check asks the deployment's address when the domain does not resolve", () => {
    const step0 = guidelines.match(/^0 {2}Preflight[\s\S]*?(?=^1 {2}Claim)/m)?.[0] ?? "";
    expect(step0).toMatch(/when that name does not resolve,\s+the deployment's own Vercel address/);
    expect(section).toContain("does not resolve");
    expect(section).toContain("aenima-ae-nima.vercel.app");
    expect(section).toContain("Vercel's login");
  });
});
