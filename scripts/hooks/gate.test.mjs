import { describe, expect, it } from "vitest";

import {
  decide,
  MAX_RED,
  mergeState,
  projectState,
  RELEASE_MESSAGE,
  STEPS,
  tail,
} from "./gate.mjs";

const SESSION = "session-a";
const HASH = "fingerprint-1";

/** A `runStep` that passes everything, and records what it was asked to run. */
const allGreen = () => {
  const ran = [];
  const runStep = (step) => (ran.push(step), { ok: true, output: "" });
  return { ran, runStep };
};

/** A `runStep` where one named step is red. */
const redAt = (redStep, output = "boom") => {
  const ran = [];
  const runStep = (step) => {
    ran.push(step);
    return step === redStep ? { ok: false, output } : { ok: true, output: "" };
  };
  return { ran, runStep };
};

const at = (state, fingerprint, runStep) =>
  decide({ input: { session_id: SESSION }, state, fingerprint, runStep });

describe("a green run", () => {
  it("lets the stop through, records the fingerprint and clears the count", () => {
    const { ran, runStep } = allGreen();
    const result = at({ session_id: SESSION, count: 2, greenHash: "stale" }, HASH, runStep);

    expect(result.exit).toBe(0);
    expect(result.nextState).toEqual({ session_id: SESSION, count: 0, greenHash: HASH });
    expect(ran).toEqual(STEPS);
  });
});

describe("a red run", () => {
  it("refuses the stop and hands back the failing step's output", () => {
    const { runStep } = redAt("typecheck", "src/x.ts(3,1): error TS2322");
    const result = at({}, HASH, runStep);

    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("pnpm typecheck is red");
    expect(result.stderr).toContain("error TS2322");
  });

  it("stops at the first red rather than running the steps after it", () => {
    const { ran, runStep } = redAt("lint");
    at({}, HASH, runStep);
    expect(ran).toEqual(["lint"]);
  });

  it("counts the red, and does not adopt the unmatched fingerprint as green", () => {
    const { runStep } = redAt("test");
    const result = at({ session_id: SESSION, count: 0, greenHash: "older" }, HASH, runStep);
    expect(result.nextState).toEqual({ session_id: SESSION, count: 1, greenHash: "older" });
  });

  // The defect the cold review found: honouring `stop_hook_active` released the gate after
  // one refusal, and AC1's refuse-fix-release sequence could not tell that from a working
  // gate. A second red with nothing fixed must still refuse.
  it("refuses again on a second red with nothing fixed", () => {
    const { runStep } = redAt("test");
    const result = at({ session_id: SESSION, count: 1, greenHash: null }, HASH, runStep);

    expect(result.exit).toBe(2);
    expect(result.nextState.count).toBe(2);
  });

  // The runtime sets `stop_hook_active` on every stop after one has been refused, and its
  // own guidance is to return success while it is true. Honouring that releases the gate
  // after a single refusal, which is the defect above from the other side. It is pinned
  // here so the field cannot be reintroduced as a release condition.
  it("refuses a red even when the runtime says a stop hook is already active", () => {
    const { runStep } = redAt("test");
    const result = decide({
      input: { session_id: SESSION, stop_hook_active: true },
      state: { session_id: SESSION, count: 1, greenHash: null },
      fingerprint: HASH,
      runStep,
    });

    expect(result.exit).toBe(2);
    expect(result.nextState.count).toBe(2);
  });

  it("restarts the count for a red in a different session", () => {
    const { runStep } = redAt("test");
    const result = at({ session_id: "session-b", count: 2, greenHash: null }, HASH, runStep);

    expect(result.exit).toBe(2);
    expect(result.nextState).toEqual({ session_id: SESSION, count: 1, greenHash: null });
  });
});

describe("the three-failed-corrections release", () => {
  it("releases on the third red rather than refusing a fourth time", () => {
    const { runStep } = redAt("test");
    const result = at({ session_id: SESSION, count: MAX_RED - 1, greenHash: null }, HASH, runStep);

    expect(result.exit).toBe(0);
    expect(result.stderr).toBe(RELEASE_MESSAGE);
    expect(result.nextState.count).toBe(MAX_RED);
  });

  it("stays released without running the suite again", () => {
    const { ran, runStep } = redAt("lint");
    const result = at({ session_id: SESSION, count: MAX_RED, greenHash: null }, HASH, runStep);

    expect(result.exit).toBe(0);
    expect(result.stderr).toBe(RELEASE_MESSAGE);
    expect(ran).toEqual([]);
  });

  it("does not release a different session that inherited the count", () => {
    const { ran, runStep } = redAt("lint");
    const result = at({ session_id: "session-b", count: MAX_RED, greenHash: null }, HASH, runStep);

    expect(result.exit).toBe(2);
    expect(ran).toEqual(["lint"]);
  });
});

describe("the unchanged-tree short-circuit", () => {
  it("runs nothing at all when the fingerprint matches the last green", () => {
    const { ran, runStep } = redAt("lint"); // Would be red if it ever ran.
    const result = at({ session_id: SESSION, count: 0, greenHash: HASH }, HASH, runStep);

    expect(result.exit).toBe(0);
    expect(ran).toEqual([]);
  });

  // Observed in TC1: after two refusals the plant was reverted, the tree matched the last
  // green fingerprint and the gate released — but the count stayed at 2, so the next red
  // would have been treated as a third failed correction.
  it("ends the red streak when the tree returns to a known-green state", () => {
    const { ran, runStep } = redAt("lint");
    const result = at({ session_id: SESSION, count: 2, greenHash: HASH }, HASH, runStep);

    expect(result.exit).toBe(0);
    expect(result.nextState).toEqual({ session_id: SESSION, count: 0, greenHash: HASH });
    expect(ran).toEqual([]);
  });

  it("writes nothing when the count is already settled at zero", () => {
    const state = { session_id: SESSION, count: 0, greenHash: HASH };
    const result = at(state, HASH, allGreen().runStep);
    expect(result.nextState).toBe(state);
  });

  it("runs the suite once the tree has moved", () => {
    const { ran, runStep } = allGreen();
    at({ session_id: SESSION, count: 0, greenHash: HASH }, "fingerprint-2", runStep);
    expect(ran).toEqual(STEPS);
  });

  it("does not short-circuit a session that has no recorded green", () => {
    const { ran, runStep } = allGreen();
    at({}, HASH, runStep);
    expect(ran).toEqual(STEPS);
  });
});

// The third cold review: the counter was one slot in one file, so a sibling `claude -p`
// session's Stop overwrote it and reset a streak it did not start. Counts are now kept per
// session in one file; the green fingerprint stays shared, because a green tree is green for
// every session that sees it.
describe("per-session state in one file", () => {
  const file = { greenHash: HASH, sessions: { [SESSION]: 2, "session-b": 1 } };

  it("projects one session's count and the shared green", () => {
    expect(projectState(file, SESSION)).toEqual({
      session_id: SESSION,
      count: 2,
      greenHash: HASH,
    });
  });

  it("starts an unseen session at zero without touching the others", () => {
    expect(projectState(file, "session-c").count).toBe(0);
    expect(projectState({}, SESSION)).toEqual({ session_id: SESSION, count: 0, greenHash: null });
  });

  it("merges a session's next state back without dropping a sibling's count", () => {
    const next = { session_id: SESSION, count: 1, greenHash: "stale-snapshot" };
    expect(mergeState(file, next)).toEqual({
      greenHash: HASH, // A red run does not move the shared green.
      sessions: { [SESSION]: 1, "session-b": 1 },
    });
  });

  it("lets a green run move the shared green", () => {
    const next = { session_id: SESSION, count: 0, greenHash: "fingerprint-2" };
    expect(mergeState(file, next).greenHash).toBe("fingerprint-2");
  });

  it("lets a red run keep the file's green, which a sibling may have moved meanwhile", () => {
    const fresh = { greenHash: "sibling-new-green", sessions: {} };
    const next = { session_id: SESSION, count: 1, greenHash: "stale-snapshot" };
    expect(mergeState(fresh, next).greenHash).toBe("sibling-new-green");
  });

  it("drops a session's row once its streak is over, so the file does not grow forever", () => {
    const next = { session_id: SESSION, count: 0, greenHash: HASH };
    expect(mergeState(file, next)).toEqual({ greenHash: HASH, sessions: { "session-b": 1 } });
  });
});

describe("tail", () => {
  it("keeps the last 40 lines and no more", () => {
    // Process output ends in a newline; the sixth review found that split-then-trim counted
    // the empty string after it as one of the forty.
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const kept = tail(`${lines.join("\n")}\n`).split("\n");

    expect(kept).toHaveLength(40);
    expect(kept[0]).toBe("line 60");
    expect(kept.at(-1)).toBe("line 99");
  });

  it("leaves shorter output alone", () => {
    expect(tail("one\ntwo")).toBe("one\ntwo");
  });
});
