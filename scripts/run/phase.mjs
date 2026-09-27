#!/usr/bin/env node
/**
 * Between phases — the marker says which phase is running (T0.44).
 *
 * A run is a thin orchestrator and four phase agents: the planner writes the ticket file, the
 * builder builds, the reviewer reviews, the closer closes (docs/guidelines.md §5). Before it
 * invokes each one the orchestrator writes the phase into the run marker, and the guard reads
 * it there: a push, a `gh` call, a merge or a board write outside `close` is refused, an Edit
 * or a Write outside `build` is refused, and a hook call while the marker names no phase is
 * judged as it always was (`scripts/hooks/guard.mjs`, rule (j)). The route the orchestrator
 * took — the effort the builder and the reviewer run at (`route.mjs`) — rides along, so the
 * Runs row can say which one the run took without the session saying so.
 *
 * Only the session that claimed may move the phase: another session's marker is another run.
 */

import { writeFileSync } from "node:fs";

import { markerPath, readMarker } from "./claim.mjs";
import { emit, isMain } from "./cli.mjs";

/**
 * The phases, in the order a run passes through them. `gate` is the gatekeeper's, reserved
 * for the day it exists; nothing sets it yet, and the guard already reads it as a phase that
 * writes nothing.
 */
export const PHASES = ["plan", "build", "review", "gate", "close"];

/** The routes `route.mjs` names, and the one the table falls back to. */
export const ROUTES = ["medium", "xhigh", "fallback"];

/**
 * Write `phase` — and `route`, when given — into the marker of the repository containing
 * `cwd`. Returns the marker as written. Throws on a phase or a route it does not know, on no
 * marker, and on another session's marker.
 */
export function setPhase({ phase, route = null }, { cwd = process.cwd(), env = process.env } = {}) {
  if (!PHASES.includes(phase)) {
    throw new Error(
      `no phase called ${JSON.stringify(phase)}; the phases are ${PHASES.join(", ")}`,
    );
  }
  if (route !== null && !ROUTES.includes(route)) {
    throw new Error(
      `no route called ${JSON.stringify(route)}; the routes are ${ROUTES.join(", ")}`,
    );
  }
  const found = readMarker(cwd);
  if (found === null) throw new Error("no run marker: claim first");
  const session = env.CLAUDE_CODE_SESSION_ID ?? null;
  if ((found.session ?? null) !== session) {
    throw new Error(`the marker is another session's run: ${found.task}`);
  }
  const record = { ...found, phase, ...(route !== null ? { route } : {}) };
  writeFileSync(markerPath(cwd), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** CLI: `node phase.mjs <plan|build|review|gate|close> [--route <medium|xhigh|fallback>]`. */
function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--route");
  const route = i === -1 ? null : (args[i + 1] ?? null);
  const rest = i === -1 ? args : [...args.slice(0, i), ...args.slice(i + 2)];
  const phase = rest[0] ?? null;
  try {
    emit(setPhase({ phase, route }));
  } catch (error) {
    emit({ set: false, reason: error.message });
    process.exit(1);
  }
}

if (isMain(import.meta.url)) main();
