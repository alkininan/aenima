import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  STAMP,
  TYPES_DIR,
  ensureRouteTypes,
  fingerprint,
  plan,
  routeInputs,
} from "./route-types.mjs";

/**
 * T3.1's addendum, AA4 — preflight regenerates the route types whenever they are stale,
 * not only when `.next/types` is missing.
 */

const dirs = [];

/** A checkout on disk holding `files` (path → contents). */
function checkout(files) {
  const root = mkdtempSync(join(tmpdir(), "route-types-"));
  dirs.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TREE = {
  "src/app/page.tsx": "",
  "src/app/i/[key]/page.tsx": "",
  "src/app/auth/sign-out/route.ts": "",
  "next.config.ts": "export default {};",
  "node_modules/next/package.json": '{"version":"16.3.1"}',
};

describe("plan — TA4 → AA4", () => {
  it("regenerates types that exist but were stamped from another tree", () => {
    expect(plan({ typesPresent: true, stamp: "other", digest: "this" })).toEqual({
      regenerate: true,
      reason: "stale",
    });
  });

  it("regenerates types nobody stamped, which is the directory T3.1 met", () => {
    expect(plan({ typesPresent: true, stamp: null, digest: "this" })).toEqual({
      regenerate: true,
      reason: "unstamped",
    });
  });

  it("regenerates when there are no types at all", () => {
    expect(plan({ typesPresent: false, stamp: "this", digest: "this" }).regenerate).toBe(true);
  });

  it("leaves types stamped from this tree alone", () => {
    expect(plan({ typesPresent: true, stamp: "this", digest: "this" })).toEqual({
      regenerate: false,
      reason: "current",
    });
  });
});

describe("routeInputs — TA4 → AA4", () => {
  it("moves when a route is added, as on a branch with a route main does not have", () => {
    const before = fingerprint(routeInputs(checkout(TREE)));
    const after = fingerprint(routeInputs(checkout({ ...TREE, "src/app/o/[key]/page.tsx": "" })));
    expect(after).not.toBe(before);
  });

  it("does not move for a file that makes no route, or for a route file's contents", () => {
    const base = fingerprint(routeInputs(checkout(TREE)));
    const component = checkout({ ...TREE, "src/app/i/[key]/GapList.tsx": "x" });
    const edited = checkout({ ...TREE, "src/app/page.tsx": "export default function P() {}" });
    expect(fingerprint(routeInputs(component))).toBe(base);
    expect(fingerprint(routeInputs(edited))).toBe(base);
  });

  it("moves when the Next config or the installed Next version changes", () => {
    const base = fingerprint(routeInputs(checkout(TREE)));
    const config = checkout({ ...TREE, "next.config.ts": "export default { redirects };" });
    const version = checkout({ ...TREE, "node_modules/next/package.json": '{"version":"16.4.0"}' });
    expect(fingerprint(routeInputs(config))).not.toBe(base);
    expect(fingerprint(routeInputs(version))).not.toBe(base);
  });
});

describe("ensureRouteTypes — TA4 → AA4", () => {
  function effects({ typesPresent, stamp, status = 0 }) {
    const calls = { run: [], stamped: [] };
    return {
      calls,
      options: {
        run: (args) => {
          calls.run.push(args);
          return { status, stderr: status === 0 ? "" : "boom" };
        },
        exists: (path) => (path === TYPES_DIR ? typesPresent : false),
        readStamp: () => stamp,
        writeStamp: (value) => calls.stamped.push(value),
        inputs: () => "the inputs",
      },
    };
  }

  it("runs next typegen on stale types and stamps them with this tree's digest", () => {
    const { calls, options } = effects({ typesPresent: true, stamp: "from another tree" });
    const result = ensureRouteTypes(options);
    expect(calls.run).toEqual([["next", "typegen"]]);
    expect(calls.stamped).toEqual([fingerprint("the inputs")]);
    expect(result).toMatchObject({ ok: true, regenerate: true, reason: "stale" });
  });

  it("runs nothing when the stamp is this tree's", () => {
    const { calls, options } = effects({ typesPresent: true, stamp: fingerprint("the inputs") });
    expect(ensureRouteTypes(options)).toMatchObject({ ok: true, regenerate: false });
    expect(calls.run).toEqual([]);
    expect(calls.stamped).toEqual([]);
  });

  it("stamps nothing when generation fails, so the next preflight tries again", () => {
    const { calls, options } = effects({ typesPresent: false, stamp: null, status: 1 });
    expect(ensureRouteTypes(options)).toMatchObject({ ok: false, detail: "boom" });
    expect(calls.stamped).toEqual([]);
  });

  it("keeps the stamp outside the directory typegen writes", () => {
    expect(STAMP.startsWith(`${TYPES_DIR}/`)).toBe(false);
  });
});
