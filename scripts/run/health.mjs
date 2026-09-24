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
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import { commonDir } from "./repo.mjs";

/** What the site answers when it is up, from outside, redirects not followed. */
export const CHECKS = [
  { path: "/sign-in", status: 200 },
  { path: "/app", status: 307 },
];

/** Where the site is. */
export const BASE = "https://aeni.ma";

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
 * `{ commit, checked, changed, outcome, ok, results, failed, unanswered }` (T0.39). Three
 * outcomes: **up**, every check answered as expected; **down**, a check answered with the wrong
 * status; **unknown**, a check never answered and none answered wrongly. Only down reverts: a
 * merge cannot break a name lookup, so silence is no verdict on one. `failed` holds the wrong
 * answers alone, `unanswered` the silences. `outcome` and `ok` are null when nothing was asked;
 * `ok` is true for up, false for down and null for unknown.
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
  const ok = outcome === "up" ? true : outcome === "down" ? false : null;
  return { commit, checked, changed, outcome, ok, results, failed, unanswered };
}

/**
 * Each check's answer: `{ path, expected, status }`, status null when nothing answered twice.
 * One silence — a timeout, a DNS blip — is asked again before it counts: a revert on a blip is
 * a merge nobody wanted undone.
 */
export async function probe(
  base,
  checks = CHECKS,
  { fetch: doFetch = globalThis.fetch, timeoutMs = TIMEOUT_MS, attempts = 2 } = {},
) {
  const results = [];
  for (const { path, status } of checks) {
    let got = null;
    for (let attempt = 0; attempt < attempts && got === null; attempt += 1) {
      try {
        const response = await doFetch(`${base}${path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        got = response.status;
      } catch {
        got = null;
      }
    }
    results.push({ path, expected: status, status: got });
  }
  return results;
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
 * Fetch, read origin/main, and probe the site when that commit has not been checked. The
 * commit is recorded once the site answered, up or down; an unknown records nothing, so the
 * next run asks about the same commit again.
 */
export async function health({ cwd = process.cwd(), base = BASE, deps = {} } = {}) {
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
  if (!first.changed) return { base, ...first };

  const when = run(["log", "-1", "--format=%ct", commit]);
  const committedAt = when.status === 0 ? Number(String(when.stdout ?? "").trim()) * 1000 : NaN;
  const age = (deps.now ? deps.now() : Date.now()) - committedAt;
  const window = deps.deployWindowMs ?? DEPLOY_WINDOW_MS;
  if (Number.isFinite(age) && age >= 0 && age < window) {
    return {
      base,
      ...first,
      ok: null,
      waiting: true,
      why: `origin/main moved ${Math.round(age / 1000)} s ago and a deploy takes a few minutes; asked again next run`,
    };
  }

  const results = await probe(base, CHECKS, { fetch: deps.fetch });
  const result = assess({ commit, checked, results });
  if (result.outcome === "unknown") {
    return {
      base,
      ...result,
      failedText: "",
      why: `${describeFailed(result.unanswered)}: the site could not be reached from this machine, which is no verdict on the merge; asked again next run`,
    };
  }
  try {
    if (recordPath !== null) writeFileSync(recordPath, `${commit}\n`);
  } catch {
    // A check that cannot record itself still answers; it will ask again next run.
  }
  return { base, ...result, failedText: describeFailed(result.failed) };
}

/** CLI: `node health.mjs [base]`, run from the checkout. */
if (isMain(import.meta.url)) emit(await health({ base: process.argv[2] ?? BASE }));
