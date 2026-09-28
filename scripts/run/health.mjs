#!/usr/bin/env node
/**
 * Step 0 — the deployed site, checked once per commit of main (T0.16).
 *
 * A finished ticket merges itself, and main deploys through the Vercel Git integration with
 * nobody watching. So the next run asks the live site two questions from outside, the same
 * two `e2e/production.spec.ts` asks a production build: `/sign-in` answers 200 and `/app`
 * answers 307 (anonymous traffic turned away, not served). A wrong answer is what
 * `revert.mjs` is for.
 *
 * Once per commit: the commit last checked is recorded beside the run marker in the
 * repository's shared `.git` directory, so a site down for a reason of its own reverts the
 * merge at the tip once and not every merge after it. The ticket says "since the last
 * Release row", but the row is written by the run that merged, seconds after the merge, so
 * nothing would ever count as advanced; the record is the honest reading of "once".
 * Pure over injected inputs; `health()` gathers them.
 *
 * Two addresses, in order (T0.43): the custom domain, then the deployment's public address on
 * Vercel, both from `deploy` in `.claude/board.json`. aeni.ma stopped resolving on 2026-09-24
 * and every check since answered unknown while merges kept landing; the deployment was up at
 * its Vercel address the whole time. A name that does not resolve is skipped and never counted,
 * and the outcome comes from the first address that answers at all. A team alias behind Vercel
 * Authentication answers every path from outside with a redirect to vercel.com, which is Vercel
 * answering and not the deployment, so it is skipped too — read as an answer, `/sign-in` would
 * be a 302 rather than a 200, down, and every healthy merge would revert. The public address is
 * behind no login; `VERCEL_AUTOMATION_BYPASS_SECRET` in `.env.local`, Vercel's Protection
 * Bypass for Automation, lets the check through an alias that is. It is sent to `*.vercel.app`
 * alone and never printed.
 *
 * An answer is confirmed as Vercel's before its status is read (T0.47). aeni.ma is undelegated:
 * whoever registers the name answers the check first, and a parking page answering `/app` with
 * 200 would be down — a healthy merge reverted, the deployment never asked. Vercel's edge sets
 * `server: Vercel` and an `x-vercel-id` on every response, the login included; an answer with
 * neither is nobody's, kept as no answer from that address like the login, named in the report
 * line, and the next address is asked. The headers confirm the platform, not the project, which
 * is why the login is still told apart first.
 */

import { spawnSync } from "node:child_process";
import { lookup as dnsLookup } from "node:dns/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import { ENV_FILE, envValue, readBoard } from "./notion.mjs";
import { commonDir } from "./repo.mjs";

/** What the site answers when it is up, from outside, redirects not followed. */
export const CHECKS = [
  { path: "/sign-in", status: 200 },
  { path: "/app", status: 307 },
];

/** Where the site is asked, in order: `deploy` in `.claude/board.json` (T0.43). */
export function readAddresses(dir = process.cwd()) {
  const deploy = readBoard(dir).deploy;
  if (!Array.isArray(deploy) || deploy.length === 0) {
    throw new Error(".claude/board.json: `deploy` must list the addresses the deploy check asks");
  }
  return deploy.map(String);
}

/** Vercel's Protection Bypass for Automation: the secret's name in `.env.local`, its header. */
export const BYPASS_VAR = "VERCEL_AUTOMATION_BYPASS_SECRET";
export const BYPASS_HEADER = "x-vercel-protection-bypass";

/** The bypass secret from `<dir>/.env.local`, or null. Read here, sent, never printed. */
export function readBypass(dir = process.cwd()) {
  try {
    return envValue(readFileSync(join(dir, ENV_FILE), "utf8"), BYPASS_VAR);
  } catch {
    return null;
  }
}

/** The cookie Vercel's login sets on the response it answers with in the deployment's place. */
export const LOGIN_COOKIE = "_vercel_sso_nonce";

/**
 * A response that is Vercel's login rather than the deployment: one that sets Vercel's login
 * nonce, whatever its status, or a redirect to vercel.com. Measured on 2026-09-28, Node's
 * `fetch` gets a 302 to `https://vercel.com/sso-api?…` carrying the nonce for every path; the
 * cookie also covers the 401 page Vercel serves some clients instead. The site's own redirects —
 * `/app` to `/sign-in` — stay on the site's host and set no nonce.
 */
export function isVercelLogin(response) {
  const headers = response?.headers;
  const cookie = headers?.get?.("set-cookie") ?? "";
  if (cookie.split(/[;,]\s*/).some((part) => part.startsWith(`${LOGIN_COOKIE}=`))) return true;
  const status = response?.status;
  if (typeof status !== "number" || status < 300 || status >= 400) return false;
  const location = headers?.get?.("location") ?? null;
  if (!location) return false;
  try {
    return new URL(location).hostname === "vercel.com";
  } catch {
    return false;
  }
}

/**
 * A response Vercel's edge answered with (T0.47): `server: Vercel`, the value compared whole and
 * case aside, or a non-empty `x-vercel-id`. Either suffices — both are set on every response,
 * the login's included, and the threat is a page from another host, not a spoof. False on a
 * response without headers. This confirms the platform, not the project: `isVercelLogin` still
 * tells Vercel answering for itself from the deployment.
 */
export function isVercel(response) {
  const headers = response?.headers;
  const server = headers?.get?.("server") ?? "";
  if (server.trim().toLowerCase() === "vercel") return true;
  const id = headers?.get?.("x-vercel-id") ?? "";
  return id.trim() !== "";
}

/** The file in the shared `.git` directory holding the commit last checked. */
export const RECORD = "aenima-deploy-checked";

/** How long one question may take. */
export const TIMEOUT_MS = 10_000;

/**
 * How long after a commit lands before the site is asked about it. Vercel builds main for a
 * minute or three, and a probe before that is answered by the previous deployment — a green
 * that says nothing about the commit. Younger than this, the check waits for the next run.
 */
export const DEPLOY_WINDOW_MS = 5 * 60 * 1000;

/**
 * `{ commit, checked, changed, outcome, results, failed, unanswered }` (T0.39). Three
 * outcomes: **up**, every check answered as expected; **down**, a check answered with the wrong
 * status; **unknown**, a check never answered and none answered wrongly. Only down reverts: a
 * merge cannot break a name lookup, so silence is no verdict on one. `failed` holds the wrong
 * answers alone, `unanswered` the silences. `outcome` is null when nothing was asked.
 */
export function assess({ commit = null, checked = null, results = [] } = {}) {
  const changed = commit !== null && commit !== checked;
  const failed = results.filter(({ status, expected }) => status !== null && status !== expected);
  const unanswered = results.filter(({ status }) => status === null);
  const outcome = !changed
    ? null
    : failed.length > 0
      ? "down"
      : unanswered.length > 0
        ? "unknown"
        : "up";
  return { commit, checked, changed, outcome, results, failed, unanswered };
}

/**
 * Each check's answer: `{ path, expected, status }`, status null when nothing answered twice.
 * One silence — a timeout, a DNS blip — is asked again before it is kept as no answer, which
 * `assess` reads as unknown and never as down. Vercel's login is kept as no answer too, marked
 * `login: true`, and not asked again: it is Vercel answering, only not for the deployment. An
 * answer without Vercel's headers is kept the same way, marked `elsewhere: true` with the
 * status it gave as `returned` (T0.47): it is an answer, only not the deployment's, and not a
 * blip. The login is read first, by its own shape, so it keeps its own words; then the headers;
 * then the status.
 */
export async function probe(
  base,
  checks = CHECKS,
  {
    fetch: doFetch = globalThis.fetch,
    timeoutMs = TIMEOUT_MS,
    attempts = 2,
    headers = undefined,
  } = {},
) {
  const results = [];
  for (const { path, status } of checks) {
    let got = null;
    let login = false;
    let elsewhere = false;
    let returned = null;
    for (
      let attempt = 0;
      attempt < attempts && got === null && !login && !elsewhere;
      attempt += 1
    ) {
      try {
        const response = await doFetch(`${base}${path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          ...(headers ? { headers } : {}),
        });
        if (isVercelLogin(response)) login = true;
        else if (!isVercel(response)) {
          elsewhere = true;
          returned = response.status;
        } else got = response.status;
      } catch {
        got = null;
      }
    }
    results.push(
      login
        ? { path, expected: status, status: null, login: true }
        : elsewhere
          ? { path, expected: status, status: null, elsewhere: true, returned }
          : { path, expected: status, status: got },
    );
  }
  return results;
}

/**
 * One address asked: `{ base, resolved, results }`. A name that does not resolve is not asked
 * at all — no result, never counted.
 */
export async function ask(base, { fetch, lookup = dnsLookup, bypass = null, timeoutMs } = {}) {
  const host = new URL(base).hostname;
  try {
    await lookup(host);
  } catch {
    return { base, resolved: false, results: [] };
  }
  const headers = bypass && host.endsWith(".vercel.app") ? { [BYPASS_HEADER]: bypass } : undefined;
  const results = await probe(base, CHECKS, { fetch, headers, timeoutMs });
  return { base, resolved: true, results };
}

/** An address answered at all when one of its checks got a status of the deployment's own. */
export const answered = ({ results }) => results.some(({ status }) => status !== null);

/** What each address tried returned, as one line for the report. */
export function describeTried(tried = []) {
  return tried
    .map(({ base, resolved, results }) =>
      !resolved
        ? `${base} does not resolve`
        : `${base}: ${results
            .map(({ path, status, login, elsewhere, returned }) =>
              login
                ? `${path} went to Vercel's login`
                : elsewhere
                  ? `${path} answered ${returned} without Vercel's headers`
                  : `${path} answered ${status === null ? "nothing" : status}`,
            )
            .join(" and ")}`,
    )
    .join("; ");
}

/** The failures as one clause for a comment: what each path answered instead. */
export function describeFailed(failed = []) {
  return failed
    .map(
      ({ path, expected, status }) =>
        `${path} answered ${status === null ? "nothing" : status} rather than ${expected}`,
    )
    .join(" and ");
}

const git = (cwd) => (args) => spawnSync("git", args, { cwd, encoding: "utf8" });

/**
 * Fetch, read origin/main, and probe the site when that commit has not been checked — each
 * address in turn until one answers. The commit is recorded once the site answered, up or down;
 * an unknown records nothing, so the next run asks about the same commit again.
 */
export async function health({ cwd = process.cwd(), addresses = null, deps = {} } = {}) {
  const bases = addresses ?? readAddresses(cwd);
  const run = deps.run ?? git(cwd);
  run(["fetch", "--quiet", "origin"]);
  const tip = run(["rev-parse", "origin/main"]);
  const commit = tip.status === 0 ? String(tip.stdout ?? "").trim() || null : null;

  const common = commonDir(cwd);
  const recordPath = deps.recordPath ?? (common === null ? null : join(common, RECORD));
  let checked = null;
  try {
    checked = recordPath === null ? null : readFileSync(recordPath, "utf8").trim() || null;
  } catch {
    checked = null;
  }

  const first = assess({ commit, checked, results: [] });
  if (!first.changed) return { base: null, addresses: bases, ...first };

  const when = run(["log", "-1", "--format=%ct", commit]);
  const committedAt = when.status === 0 ? Number(String(when.stdout ?? "").trim()) * 1000 : NaN;
  const age = (deps.now ? deps.now() : Date.now()) - committedAt;
  const window = deps.deployWindowMs ?? DEPLOY_WINDOW_MS;
  if (Number.isFinite(age) && age >= 0 && age < window) {
    return {
      base: null,
      addresses: bases,
      ...first,
      outcome: null,
      waiting: true,
      why: `origin/main moved ${Math.round(age / 1000)} s ago and a deploy takes a few minutes; asked again next run`,
    };
  }

  const bypass = deps.bypass !== undefined ? deps.bypass : readBypass(cwd);
  const tried = [];
  let reached = null;
  for (const base of bases) {
    const one = await ask(base, { fetch: deps.fetch, lookup: deps.lookup, bypass });
    tried.push(one);
    if (answered(one)) {
      reached = one;
      break;
    }
  }
  // No address answered: every check of the last one asked stands as no answer, so the outcome
  // is unknown and never down.
  const results =
    reached?.results ??
    CHECKS.map(({ path, status }) => ({ path, expected: status, status: null }));
  const result = assess({ commit, checked, results });
  const base = reached?.base ?? null;
  if (result.outcome === "unknown") {
    return {
      base,
      addresses: bases,
      tried,
      ...result,
      failedText: "",
      why: `${describeTried(tried)}: the site could not be reached from this machine, which is no verdict on the merge; asked again next run`,
    };
  }
  try {
    if (recordPath !== null) writeFileSync(recordPath, `${commit}\n`);
  } catch {
    // A check that cannot record itself still answers; it will ask again next run.
  }
  return { base, addresses: bases, tried, ...result, failedText: describeFailed(result.failed) };
}

/** CLI: `node health.mjs [address …]`, run from the checkout; no address reads the board's. */
if (isMain(import.meta.url)) {
  const given = process.argv.slice(2);
  emit(await health({ addresses: given.length > 0 ? given : null }));
}
