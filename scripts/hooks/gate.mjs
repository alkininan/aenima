#!/usr/bin/env node
/**
 * Stop gate — "Done means" as mechanism rather than as a sentence at the end of a ticket.
 *
 * Runs `pnpm lint && pnpm typecheck && pnpm test` and refuses the stop while any of them
 * is red, so a session cannot end over a red suite. Exit 2 on Stop returns the session to
 * work with stderr as the reason; exit 0 lets it finish.
 *
 * Two things keep this affordable and finite:
 *
 *   - Stop fires at the end of *every* turn, not at ticket close, and the suite costs ~76s
 *     against a hosted Postgres. The gate therefore fingerprints the working tree — HEAD
 *     plus the content of every changed or untracked file — and skips the run outright when
 *     the fingerprint matches the last green one. Nothing changed means still green, so the
 *     refusal this hook exists for is unaffected.
 *   - Three reds in one session releases the gate. The build guide's rule is that three
 *     failed corrections on the same fix means the ticket is wrong, not the code; a hook
 *     that kept refusing would loop a session against a ticket that cannot be satisfied.
 *
 * On `stop_hook_active`: the runtime does send it (verified against the installed binary,
 * 2.1.259) and its own guidance is to return success while it is true. This gate does not,
 * deliberately — true simply means "the previous stop was already refused", so honouring it
 * would release after a single refusal and T0.7's whole objective is that a red suite keeps
 * refusing. The counter below is the loop guard, and the runtime's own block cap
 * (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP ?? 8`) sits behind it as a backstop, comfortably above
 * the three this releases at.
 *
 * `decide()` is pure and its effects are injected, so the state machine is unit-testable
 * without spawning pnpm. `scripts/hooks/gate.test.mjs` covers it.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STEPS = ["lint", "typecheck", "test"];
export const MAX_RED = 3;
export const TAIL_LINES = 40;
export const RELEASE_MESSAGE =
  "gate released after three reds — restate the ticket rather than push harder at the code";

/** The last `TAIL_LINES` lines of a command's output. */
export function tail(text) {
  // Trim first: process output ends in a newline, and splitting before trimming would count
  // the empty string after it as one of the forty.
  return text.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
}

/**
 * The whole decision: what to exit with, what to say, and what to remember.
 *
 * `runStep(step)` returns `{ ok, output }` and is injected so a test never spawns pnpm —
 * and so a test can assert that a matching fingerprint runs *nothing*, which is the only
 * way to tell the short-circuit from a suite that happened to pass.
 *
 * `state.session_id` is re-checked here even though `projectState()` already resolves it, on
 * purpose: this function is the exported contract and must be right against any state it is
 * handed, not only the one `main()` builds. The check is what keeps a sibling session's red
 * count from ever being read as this session's, and two tests pin exactly that.
 */
export function decide({ input, state, fingerprint, runStep }) {
  const sessionId = input?.session_id ?? null;
  const sameSession = state?.session_id === sessionId;
  const reds = sameSession ? (state?.count ?? 0) : 0;

  if (reds >= MAX_RED) return { exit: 0, stderr: RELEASE_MESSAGE, nextState: state };

  // A tree identical to a known-green one is green, and a green tree ends the red streak
  // the same way a green run does. Without the reset a session that went red twice and then
  // reverted would carry the two forward, and the next red would release the gate on what is
  // really its first failed correction.
  if (state?.greenHash === fingerprint) {
    const settled = sameSession && (state?.count ?? 0) === 0;
    return {
      exit: 0,
      nextState: settled ? state : { session_id: sessionId, count: 0, greenHash: fingerprint },
    };
  }

  for (const step of STEPS) {
    const { ok, output } = runStep(step);
    if (ok) continue;

    const count = reds + 1;
    const nextState = { session_id: sessionId, count, greenHash: state?.greenHash ?? null };
    if (count >= MAX_RED) return { exit: 0, stderr: RELEASE_MESSAGE, nextState };
    return {
      exit: 2,
      stderr: `pnpm ${step} is red — this cannot close. Last ${TAIL_LINES} lines:\n${tail(output)}`,
      nextState,
    };
  }

  return { exit: 0, nextState: { session_id: sessionId, count: 0, greenHash: fingerprint } };
}

/**
 * Where to run: the nearest package root at or above the hook's `cwd`.
 *
 * `${CLAUDE_PROJECT_DIR}` does not follow a worktree while `cwd` does, so a worktree session
 * asked about the project directory would have the untouched main checkout tested on its
 * behalf and pass over code nobody ran. Walking up from `cwd` also survives Claude `cd`-ing
 * into a subdirectory, which is the case the project directory used to cover.
 */
export function resolveDir(input, env = process.env) {
  const start = typeof input?.cwd === "string" && input.cwd !== "" ? input.cwd : null;

  // Walk up from cwd. Claude may have cd'd into a subdirectory, and in a worktree cwd is the
  // only field that points at the checkout being worked on.
  for (let dir = start; dir;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    dir = parent === dir ? null : parent;
  }

  // Only when cwd names no package at all. ${CLAUDE_PROJECT_DIR} does not follow a worktree,
  // so preferring it would test the untouched main checkout on a worktree session's behalf.
  return env.CLAUDE_PROJECT_DIR || process.cwd();
}

function git(args, cwd) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  return run.status === 0 ? run.stdout : "";
}

/**
 * A fingerprint of everything the suite would read: the commit, plus the status code and
 * content hash of every file git reports as changed or untracked.
 *
 * The content hash is the point. `git status --porcelain` alone names the files and not
 * what is in them, so two different edits to one file would fingerprint identically and
 * the second would inherit the first one's green.
 */
function treeFingerprint(dir) {
  const hash = createHash("sha256");
  hash.update(git(["rev-parse", "HEAD"], dir).trim());

  const status = git(["status", "--porcelain", "-z", "--untracked-files=all"], dir);
  for (const entry of status.split("\0")) {
    if (entry === "") continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    hash.update(`\0${code} ${path}\0`);
    try {
      hash.update(
        createHash("sha256")
          .update(readFileSync(join(dir, path)))
          .digest("hex"),
      );
    } catch {
      hash.update("absent"); // Deleted, or a rename's source half.
    }
  }
  return hash.digest("hex");
}

/**
 * The state file holds one shared green fingerprint and one count per session. A green tree
 * is green for every session that sees it; a red streak belongs to the session that ran it,
 * and a sibling `claude -p` run stopping in the same checkout must not reset it — that would
 * move the three-strikes release out to the runtime's own cap.
 */
export function projectState(file, sessionId) {
  return {
    session_id: sessionId,
    count: file?.sessions?.[sessionId ?? ""] ?? 0,
    greenHash: file?.greenHash ?? null,
  };
}

export function mergeState(file, nextState) {
  // A session is listed while it has a live red streak; `projectState` reads a missing entry
  // as zero, so a session that went green needs no row. A released session keeps its row —
  // it never runs the suite again, so its count never returns to zero, and the row is the
  // record that it was released.
  const key = nextState.session_id ?? "";
  const others = { ...(file?.sessions ?? {}) };
  delete others[key];
  const red = nextState.count > 0;
  return {
    // A red run has no green to contribute: keep whatever the file holds now, which a sibling
    // may have written while this suite ran. Only a green run moves the shared fingerprint.
    greenHash: red ? (file?.greenHash ?? null) : (nextState.greenHash ?? null),
    sessions: red ? { ...others, [key]: nextState.count } : others,
  };
}

function readState(statePath) {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(statePath, state) {
  try {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // A gate that cannot record its own count still gates; it just cannot release.
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    input = {};
  }

  const dir = resolveDir(input);
  const statePath = join(process.env.CLAUDE_PROJECT_DIR || dir, ".claude", ".gate-count");
  const file = readState(statePath);
  const state = projectState(file, input.session_id ?? null);

  const { exit, stderr, nextState } = decide({
    input,
    state,
    fingerprint: treeFingerprint(dir),
    runStep: (step) => {
      // Node's default maxBuffer is 1 MiB; past it `status` is null and a green step would
      // read as red with a truncated log. A red vitest run with diffs is the large one.
      const run = spawnSync("pnpm", [step], {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      return { ok: run.status === 0, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
    },
  });

  // Re-read at write time. `file` was read before a ~76s suite; merging into that snapshot
  // would roll back whatever a sibling session recorded meanwhile — the fourth review's
  // finding 3. The window shrinks from a suite run to a few milliseconds.
  if (nextState !== state) writeState(statePath, mergeState(readState(statePath), nextState));
  if (stderr) process.stderr.write(`${stderr}\n`);
  // On exit 0 a Stop hook's stderr goes to the debug log and nobody reads it, so the release
  // — the one exit-0 message this gate has — is also surfaced as a `systemMessage`, the JSON
  // field the hooks reference names for showing the user something. Silent release is the
  // fourth review's finding 2.
  if (exit === 0 && stderr) process.stdout.write(`${JSON.stringify({ systemMessage: stderr })}\n`);
  process.exit(exit);
}

// Only when run as the hook. Without this, importing the module for a test runs `main()`,
// which blocks forever on a stdin that never arrives.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
