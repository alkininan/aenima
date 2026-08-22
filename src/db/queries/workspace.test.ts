import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Counts what `ensureWorkspace` asks of PostgREST, because the shape of that
 * traffic is the thing that broke — not the values coming back.
 */
const db = vi.hoisted(() => ({
  /** GET /rest/v1/workspace — the read whose second occurrence was the bug. */
  workspaceSelects: 0,
  /** POST /rest/v1/rpc/bootstrap_workspace. */
  bootstrapCalls: 0,
  row: null as { id: string; name: string; timezone: string; locale: string } | null,
}));

/**
 * `workspace.ts` imports `server-only`, which throws outside a React Server
 * Component build. Stubbed here rather than adding the `react-server` resolve
 * condition to the node project, which would change how React itself resolves
 * for every other test in it.
 */
vi.mock("server-only", () => ({}));

/**
 * A PostgREST stand-in, chained the way the real builder is. `maybeSingle` and
 * `single` are the only terminals used here, so they are the only ones that
 * resolve.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => {
              db.workspaceSelects += 1;
              return { data: db.row, error: null };
            },
          }),
        }),
      }),
    }),
    rpc: (_fn: string, args: { p_name: string }) => ({
      select: () => ({
        single: async () => {
          db.bootstrapCalls += 1;
          // The function is idempotent: a caller who already has a workspace
          // gets it back rather than an error.
          db.row ??= { id: "ws-1", name: args.p_name, timezone: "UTC", locale: "en" };
          return { data: db.row, error: null };
        },
      }),
    }),
  }),
}));

import { ensureWorkspace } from "@/db/queries/workspace";

/**
 * First-run bootstrap, guarded at the level the bug actually lived at.
 *
 * `ensureWorkspace` once read `workspace`, called `bootstrap_workspace`, then
 * read `workspace` again for the row it had just created. That second read is
 * unreliable by construction: Next memoizes identical GET fetches for a whole
 * render pass, and both reads are the same GET with the same headers, so the
 * second one never reaches the database — it replays the first response, taken
 * before the write, which is empty. First run threw; every later request was a
 * fresh render pass that found the workspace on the first read and returned
 * early, so the bug looked like it had healed itself.
 *
 * Nothing about that is visible in the returned values, which is why these
 * tests count requests instead of inspecting data. A reintroduced read-after-
 * write still returns the right workspace under any mock that answers honestly
 * — the damage only appears under Next's memoization, in production, on an
 * account that can only be first-run once. So the invariant worth pinning is
 * structural: the write returns the row, and nothing re-reads to find it.
 */
describe("ensureWorkspace", () => {
  beforeEach(() => {
    db.workspaceSelects = 0;
    db.bootstrapCalls = 0;
    db.row = null;
  });

  it("reads workspace once on first run and never re-reads after the write", async () => {
    const workspace = await ensureWorkspace("Acme");

    expect(db.bootstrapCalls).toBe(1);
    // The load-bearing assertion. Two means a read-after-write is back, and in
    // a real render pass the second one would be answered from the memo cache
    // with the pre-write result.
    expect(db.workspaceSelects).toBe(1);
    expect(workspace).toEqual({ id: "ws-1", name: "Acme", timezone: "UTC", locale: "en" });
  });

  it("takes the row from the write itself, not from a later read", async () => {
    // A read after this point can only return null, the way the memo cache
    // would answer it. If the row still comes back, it came from the RPC.
    const workspace = await ensureWorkspace("Acme");
    db.row = null;

    expect(workspace.id).toBe("ws-1");
  });

  it("skips the write entirely once a workspace exists", async () => {
    db.row = { id: "ws-1", name: "Acme", timezone: "UTC", locale: "en" };

    const workspace = await ensureWorkspace("Ignored");

    expect(db.bootstrapCalls).toBe(0);
    expect(db.workspaceSelects).toBe(1);
    expect(workspace.name).toBe("Acme");
  });

  // Concurrent render passes both find nothing and both call bootstrap. The
  // function settling on one workspace is what makes that safe; neither caller
  // has to lose. Proved against real Postgres in bootstrap.db.test.ts — here it
  // only has to hold that neither call errors.
  it("survives two passes racing through first run", async () => {
    const [first, second] = await Promise.all([ensureWorkspace("Acme"), ensureWorkspace("Acme")]);

    expect(first).toEqual(second);
  });
});
