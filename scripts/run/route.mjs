#!/usr/bin/env node
/**
 * Before the builder and the reviewer — the effort they run at (T0.44).
 *
 * A Fix or a Content ticket that touches no migration and nothing under `scripts/` or
 * `.claude/` is built and reviewed at medium; everything else at xhigh; the gatekeeper, when it
 * exists, always at medium. The table lives in `.claude/board.json` (`routes`, `gatekeeper`) so
 * the rule is data and this file only reads it: the first route whose `types` hold the ticket's
 * Type and whose `outside` no path of the ticket's falls under is the route, and a shape no
 * route covers — no Type, or one product-spec §4 does not name — is `fallback`, at xhigh.
 *
 * The paths are the ones the ticket's own sections name in code spans, and the diff's once
 * there is one: before the build the ticket is all there is, and after it the diff is what the
 * reviewer reads, so a Fix whose build reached into `scripts/` is reviewed at xhigh whatever
 * its ticket said. The orchestrator asks twice — before the builder and before the reviewer.
 *
 * Claude Code's Agent tool takes no effort per invocation, so an effort is a frontmatter: each
 * phase that can run at two efforts has two agent files, `builder` and `builder-medium`, and
 * the answer names the file to invoke.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { codeSpans, ownSections } from "./claims.mjs";
import { emit, isMain } from "./cli.mjs";
import { readBoard } from "./notion.mjs";

/** The effort a shape no route covers runs at. */
export const FALLBACK_EFFORT = "xhigh";

/** The agent file that runs `phase` at `effort`: `builder` at xhigh, `builder-medium` below. */
export const agentFor = (phase, effort) => (effort === "xhigh" ? phase : `${phase}-${effort}`);

/**
 * The route for a ticket of `type` naming `paths`, read against `table` — `{ routes,
 * gatekeeper }` as `.claude/board.json` holds them. Returns `{ route, effort, agents }`, where
 * `effort` carries the builder's, the reviewer's and the gatekeeper's, and `agents` the files
 * the orchestrator invokes for the first two.
 */
export function route({ type = null, paths = [] }, table = {}) {
  const routes = Array.isArray(table.routes) ? table.routes : [];
  const gatekeeper = table.gatekeeper ?? FALLBACK_EFFORT;
  const found = routes.find(
    (entry) =>
      Array.isArray(entry.types) &&
      entry.types.includes(type) &&
      !paths.some((path) => (entry.outside ?? []).some((prefix) => path.startsWith(prefix))),
  );
  const effort = found
    ? { builder: found.effort.builder, reviewer: found.effort.reviewer, gatekeeper }
    : { builder: FALLBACK_EFFORT, reviewer: FALLBACK_EFFORT, gatekeeper };
  return {
    route: found ? found.name : "fallback",
    effort,
    agents: {
      builder: agentFor("builder", effort.builder),
      reviewer: agentFor("reviewer", effort.reviewer),
    },
  };
}

/** The Type a ticket file's header names — `· Type Fix ·` — or null. */
export function ticketType(text) {
  return String(text ?? "").match(/·\s*Type\s+([A-Z][a-z]+)\b/)?.[1] ?? null;
}

/** The paths a ticket's own sections name: code spans with a slash in them, `## Cited` left out. */
export function ticketPaths(text) {
  return codeSpans(ownSections(text)).filter((span) => span.includes("/") && !/\s/.test(span));
}

/** The paths the branch changes against origin/main, none when there is no diff to read. */
export function diffPaths(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** CLI: `node route.mjs docs/tickets/<id>.md` — the ticket's Type and paths, and the diff's. */
function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: route.mjs docs/tickets/<id>.md\n");
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  const paths = [...new Set([...ticketPaths(text), ...diffPaths()])];
  emit({ type: ticketType(text), ...route({ type: ticketType(text), paths }, readBoard()) });
}

if (isMain(import.meta.url)) main();
