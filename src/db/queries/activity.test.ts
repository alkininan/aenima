import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Everything the layer asked PostgREST for, in order. */
const calls = vi.hoisted(() => ({
  from: [] as string[],
  select: [] as string[],
  eq: [] as [string, unknown][],
  in: [] as [string, unknown[]][],
  order: [] as [string, boolean | undefined, boolean | undefined][],
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
    in(column: string, values: unknown[]) {
      calls.in.push([column, values]);
      return builder;
    },
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      calls.order.push([column, options?.ascending, options?.nullsFirst]);
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

import {
  ACTIVITY_PAGE_SIZE,
  listGapsClosedAsNoLongerApplicable,
  listItemActivity,
  NO_LONGER_APPLICABLE,
} from "@/db/queries/activity";

const WORKSPACE = "11111111-1111-4000-8000-000000000001";
const ITEM = "22222222-2222-4000-8000-000000000002";
const GAP_A = "33333333-3333-4000-8000-000000000003";
const GAP_B = "44444444-4444-4000-8000-000000000004";

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
    calls.in = [];
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

  /**
   * §2's ledger is read newest first — a feed's direction is the whole of its
   * meaning, and the harness had to learn to record this to assert it.
   *
   * `nullsFirst: false` is asserted too, and it is not decoration: it matches
   * `activity_subject_idx`, so the index supplies the ordering instead of the
   * planner sorting. A bare `desc` means NULLS FIRST, which the index cannot
   * answer — and the resulting sort would be invisible until the ledger was
   * large enough for it to hurt.
   */
  it("orders newest first, in the direction the index can answer", async () => {
    await listItemActivity(WORKSPACE, ITEM);
    expect(calls.order).toContainEqual(["occurred_at", false, false]);
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

/**
 * Which of an item's gaps the engine closed because §4's condition stopped
 * holding — the read T2.10's notice is drawn from.
 *
 * **The reason is only in the ledger**, and these assert that this read goes
 * there for it rather than inferring it from anything the `gap` row carries. A
 * closed row holds a time, no name and no note (`gap_resolution_shape`), so the
 * two reasons `writeRun` can write — `passed` and `no longer applicable` — are
 * indistinguishable on the gap itself. Guessing from the surrounding state is
 * the defect this shape exists to make impossible.
 */
describe("listGapsClosedAsNoLongerApplicable", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.in = [];
    calls.order = [];
    calls.limit = [];
    calls.rows = [];
  });

  // CLAUDE.md: every query filters workspace_id. RLS filters it again.
  it("scopes to the workspace and to the gaps it was asked about", async () => {
    await listGapsClosedAsNoLongerApplicable(WORKSPACE, [GAP_A, GAP_B]);

    expect(calls.from).toEqual(["activity"]);
    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
    expect(calls.in).toContainEqual(["subject_id", [GAP_A, GAP_B]]);
  });

  /**
   * `subject_id` is a uuid from a column every subject kind shares, so
   * `subject_table` is what keeps a row about something else out — the same
   * reason `listItemActivity` filters on it.
   */
  it("filters on the subject table as well as the ids", async () => {
    await listGapsClosedAsNoLongerApplicable(WORKSPACE, [GAP_A]);
    expect(calls.eq).toContainEqual(["subject_table", "gap"]);
  });

  /**
   * The action and the reason, both in the request.
   *
   * `gap.closed` alone is not the question: a gap closed because its check
   * passed writes the same action with reason `passed`, and T2.4's narrowing
   * keeps that one off the page for a reason that still holds. The reason is a
   * jsonb key, which is why the filter is a `->>` path rather than a column.
   */
  it("asks for gap.closed rows and for that one reason", async () => {
    await listGapsClosedAsNoLongerApplicable(WORKSPACE, [GAP_A]);

    expect(calls.eq).toContainEqual(["action", "gap.closed"]);
    expect(calls.eq).toContainEqual(["metadata->>reason", NO_LONGER_APPLICABLE]);
  });

  it("answers with the gap ids the ledger named", async () => {
    calls.rows = [{ subject_id: GAP_B }];
    expect(await listGapsClosedAsNoLongerApplicable(WORKSPACE, [GAP_A, GAP_B])).toEqual([GAP_B]);
  });

  /**
   * An item whose gaps are all open holds nothing to ask about, and a request
   * whose `in` list is empty is one that can only answer nothing. It is not
   * sent: an item page renders this read on every load, and most items will
   * never have a closed gap at all.
   */
  it("asks nothing when there are no gaps to ask about", async () => {
    expect(await listGapsClosedAsNoLongerApplicable(WORKSPACE, [])).toEqual([]);
    expect(calls.from).toEqual([]);
  });
});
