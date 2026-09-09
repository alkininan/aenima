#!/usr/bin/env node
/**
 * Every exit — the run marker removed.
 *
 * Three paths leave a run: Review (step 9), Decision (step 6, or a stop under §4), and an
 * error the session did not plan for. The skill calls this on the first two; the SessionEnd
 * hook in `.claude/settings.json` calls it with `--hook` on every session end, which is the
 * trap for the third. A hard kill fires no hook at all, and that is what the three-hour age
 * in `stale.mjs` is for.
 *
 * The marker is removed only by the session that wrote it. A SessionEnd from some other
 * session in the same checkout — a sibling tab closing — must not erase a live run's
 * footprint, or the next preflight would read that run as dead and recover it from under
 * itself.
 */

import { unlinkSync } from "node:fs";

import { emit, isMain, readStdin } from "./cli.mjs";
import { markerPath, readMarker } from "./claim.mjs";

/**
 * Remove the marker if this session owns it. `session` is the caller's session id; null
 * matches a marker written where the runtime exposed none.
 */
export function release({ session = null } = {}, { cwd = process.cwd() } = {}) {
  const found = readMarker(cwd);
  if (found === null) return { released: false, reason: "no marker" };
  if ((found.session ?? null) !== (session ?? null)) {
    return { released: false, reason: "another session's marker", marker: found };
  }
  unlinkSync(markerPath(cwd));
  return { released: true, marker: found };
}

/**
 * CLI: `node release.mjs` from the skill, session from the environment; `node release.mjs
 * --hook` from SessionEnd, session and cwd from the hook JSON on stdin.
 */
async function main() {
  let session = process.env.CLAUDE_CODE_SESSION_ID ?? null;
  let cwd = process.cwd();
  if (process.argv.includes("--hook")) {
    try {
      const input = JSON.parse(await readStdin());
      session = input.session_id ?? session;
      if (typeof input.cwd === "string" && input.cwd !== "") cwd = input.cwd;
    } catch {
      // An unreadable payload releases nothing: a hook that cannot say whose session it is
      // must not remove anyone's marker.
      emit({ released: false, reason: "unreadable hook input" });
      return;
    }
  }
  emit(release({ session }, { cwd }));
}

if (isMain(import.meta.url)) await main();
