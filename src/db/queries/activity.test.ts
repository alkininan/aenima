import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Everything the layer asked PostgREST for, in order. */
const calls = vi.hoisted(() => ({
  from: [] as string[],
  select: [] as string[],
  eq: [] as [string, unknown][],
  order: [] as [string, boolean | undefined][],
  limit: [] as number[],
  rows: [] as unknown[],
}));

/** The recording PostgREST stand-in from `item.test.ts`, with order and limit. */
vi.mock("@/lib/supabase/server", () => {
  const builder: Record<string, unknown> = {
    select(columns: string) {
      calls.select.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.eq.push([column, value]);
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      calls.order.push([column, options?.ascending]);
      return builder;
    },
    limit(count: number) {
      calls.limit.push(count);
      return builder;
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: calls.rows, error: null }).then(resolve);
    },
  };

  return {
    createClient: async () => ({
      from(table: string) {
        calls.from.push(table);
        return builder;
      },
    }),
  };
});

import { ACTIVITY_PAGE_SIZE, listItemActivity } from "@/db/queries/activity";

const WORKSPACE = "11111111-1111-4000-8000-000000000001";
const ITEM = "22222222-2222-4000-8000-000000000002";

/**
 * The item's ledger read.
 *
 * It is a second request by necessity rather than by choice: `activity` names
 * its subject polymorphically with no foreign key to `item`, so PostgREST has
 * no relationship to embed and the alternative is inventing schema. What these
 * assert is that the necessary second request is at least the right shape —
 * scoped, ordered and bounded.
 */
describe("listItemActivity", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.order = [];
    calls.limit = [];
    calls.rows = [];
  });

  // CLAUDE.md: every query filters workspace_id. RLS filters it again.
  it("scopes to the workspace and to this item", async () => {
    await listItemActivity(WORKSPACE, ITEM);

    expect(calls.from).toEqual(["activity"]);
    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
    expect(calls.eq).toContainEqual(["subject_id", ITEM]);
  });

  /**
   * `subject_id` is a uuid from a column shared by every subject kind, so
   * `subject_table` is what makes an item's feed structurally unable to contain
   * a gap's row. Random uuids make a collision vanishingly unlikely; the filter
   * makes it impossible, which is a different thing.
   */
  it("filters on the subject table, not just the id", async () => {
    await listItemActivity(WORKSPACE, ITEM);
    expect(calls.eq).toContainEqual(["subject_table", "item"]);
  });

  // §2's ledger is read newest first — a feed's direction is the whole of its
  // meaning, and the harness had to learn to record this to assert it.
  it("orders newest first", async () => {
    await listItemActivity(WORKSPACE, ITEM);
    expect(calls.order).toContainEqual(["occurred_at", false]);
  });

  /**
   * A ledger is the fastest-growing table in the system, so an unbounded read
   * gets slower every week without anyone changing a line. The cap is the
   * thing that has to be visible in a test — a silently larger number later is
   * the same bug with a longer fuse.
   */
  it("is bounded", async () => {
    await listItemActivity(WORKSPACE, ITEM);

    expect(calls.limit).toEqual([ACTIVITY_PAGE_SIZE]);
    expect(ACTIVITY_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it("carries both actor kinds through", async () => {
    calls.rows = [
      {
        id: "a1",
        action: "gap.opened",
        actor_kind: "agent",
        actor_user_id: null,
        actor_agent: "scorer",
        trigger_source: "agent",
        occurred_at: "2026-02-02T00:00:00+00:00",
      },
      {
        id: "a2",
        action: "item.created",
        actor_kind: "human",
        actor_user_id: "user-1",
        actor_agent: null,
        trigger_source: "user",
        occurred_at: "2026-02-01T00:00:00+00:00",
      },
    ];

    const entries = await listItemActivity(WORKSPACE, ITEM);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ actorKind: "agent", actorAgent: "scorer" });
    expect(entries[1]).toMatchObject({ actorKind: "human", actorUserId: "user-1" });
  });

  // An item nothing has happened to is the ordinary case, not an error: no
  // seeded item has a single ledger row.
  it("returns an empty feed rather than failing when there is nothing", async () => {
    calls.rows = [];
    expect(await listItemActivity(WORKSPACE, ITEM)).toEqual([]);
  });
});
