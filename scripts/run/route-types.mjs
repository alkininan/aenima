#!/usr/bin/env node
/**
 * Step 0 — Next's route types, regenerated whenever they are stale.
 *
 * The gate's typecheck reads `.next/types`, which `pnpm next typegen` writes from the app
 * router's route files. The preflight used to generate them only when the directory was
 * missing, and T3.1's first claim met a worktree whose `.next/types` existed and named a
 * route `main` does not have: typecheck failed before anything was touched. A directory
 * that exists says nothing about which tree it was generated for.
 *
 * So the run records what it generated from. The inputs are the route files' paths under
 * the app directory — what routes exist, which is all the generated types describe — the
 * Next config, whose redirects and rewrites are routes too, and the installed Next version,
 * whose generator wrote the files. Their digest is written beside the types after a
 * successful generation; types with no stamp, or a stamp that differs from this tree's
 * digest, are regenerated. The stamp sits in `.next/` rather than in `.next/types/`, so a
 * generation that clears its own directory cannot take the stamp with it.
 *
 * `plan` is pure; `routeInputs` reads a directory; `ensureRouteTypes` takes the runner and
 * the file effects injected, so a test never spawns pnpm.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";

/** Where `next typegen` writes. */
export const TYPES_DIR = join(".next", "types");

/** The digest of the inputs the types in `TYPES_DIR` were generated from. */
export const STAMP = join(".next", "aenima-route-types");

/** The app router's own directories: `src/app`, or `app` at the root. */
const APP_DIRS = ["src/app", "app"];

/**
 * A file whose presence makes or shapes a route: pages, layouts, route handlers and the
 * special files a segment can carry. Metadata files are routes too, below.
 */
const ROUTE_FILE =
  /^(page|layout|route|default|template|loading|error|not-found|global-error|forbidden|unauthorized)\.(tsx|ts|jsx|js|mdx|md)$/;

/**
 * A metadata file, which Next turns into a route of its own (`discoverRoutes` in
 * `next/dist/build/route-discovery.js`): the favicon, icons and social images, numbered or
 * not, the sitemap, robots and the manifest, as a static file or as code.
 */
const METADATA_FILE =
  /^(favicon|icon\d*|apple-icon\d*|opengraph-image\d*|twitter-image\d*|sitemap|robots|manifest)\.[a-z]+$/;

const CONFIG_FILE = /^next\.config\.(ts|mts|mjs|cjs|js)$/;

/** Every route file under `dir`, as a path relative to `root`, with `/` separators. */
function routeFiles(root, dir) {
  const found = [];
  const walk = (relative) => {
    let entries;
    try {
      entries = readdirSync(join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (ROUTE_FILE.test(entry.name) || METADATA_FILE.test(entry.name)) found.push(path);
    }
  };
  walk(dir);
  return found;
}

/**
 * The inputs route types are generated from, as one string: the route file paths sorted,
 * each Next config file's name and contents, and the installed Next version.
 */
export function routeInputs(root) {
  const routes = APP_DIRS.flatMap((dir) => routeFiles(root, dir)).sort();

  let configs = [];
  try {
    configs = readdirSync(root)
      .filter((name) => CONFIG_FILE.test(name))
      .sort()
      .map((name) => `${name}\n${readFileSync(join(root, name), "utf8")}`);
  } catch {
    configs = [];
  }

  let next = "none";
  try {
    next = JSON.parse(readFileSync(join(root, "node_modules/next/package.json"), "utf8")).version;
  } catch {
    next = "none";
  }

  return [`next ${next}`, ...routes, ...configs].join("\n\u0000\n");
}

/** A short digest of `routeInputs`. */
export function fingerprint(inputs) {
  return createHash("sha256").update(inputs, "utf8").digest("hex").slice(0, 32);
}

/**
 * Whether to regenerate, and why.
 *
 * `missing` — no types at all. `unstamped` — types nobody recorded the inputs of, which
 * is exactly the directory that failed T3.1's typecheck. `stale` — types generated from
 * other inputs. `current` — the stamp is this tree's digest.
 */
export function plan({ typesPresent, stamp, digest }) {
  if (!typesPresent) return { regenerate: true, reason: "missing" };
  if (stamp === null) return { regenerate: true, reason: "unstamped" };
  if (stamp !== digest) return { regenerate: true, reason: "stale" };
  return { regenerate: false, reason: "current" };
}

/**
 * Regenerate when `plan` says to, and stamp only a generation that succeeded — a failed
 * one leaves no stamp, so the next preflight tries again rather than trusting it.
 */
export function ensureRouteTypes({
  root = process.cwd(),
  run = (args) => spawnSync("pnpm", args, { cwd: root, encoding: "utf8" }),
  exists = (path) => existsSync(join(root, path)),
  readStamp = () => {
    try {
      return readFileSync(join(root, STAMP), "utf8").trim();
    } catch {
      return null;
    }
  },
  writeStamp = (value) => writeFileSync(join(root, STAMP), `${value}\n`),
  inputs = () => routeInputs(root),
} = {}) {
  const digest = fingerprint(inputs());
  const decision = plan({ typesPresent: exists(TYPES_DIR), stamp: readStamp(), digest });
  if (!decision.regenerate) return { ...decision, ok: true, digest };

  const generated = run(["next", "typegen"]);
  if (generated.status !== 0) {
    const detail = String(generated.stderr ?? "")
      .trim()
      .split("\n")
      .slice(-5)
      .join("\n");
    return { ...decision, ok: false, digest, detail };
  }
  writeStamp(digest);
  return { ...decision, ok: true, digest };
}

/** CLI: `node route-types.mjs` from the checkout's root. */
function main() {
  const result = ensureRouteTypes();
  emit(result);
  if (!result.ok) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
