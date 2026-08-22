import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Everything the layer asked PostgREST for, in order. */
const calls = vi.hoisted(() => ({
  from: [] as string[],
  select: [] as string[],
  eq: [] as [string, unknown][],
  rows: [] as unknown[],
  single: null as unknown,
}));

/**
 * A recording PostgREST stand-in. Every filter method returns the builder, and
 * the builder is thenable, so `await`ing it anywhere in the chain resolves —
 * which is how the real client behaves and what lets the layer be exercised
 * without a database.
 */
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
    order() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data: calls.single, error: null });
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

import { getItem, listItemsForProduct } from "@/db/queries/item";

const WORKSPACE = "11111111-1111-4000-8000-000000000001";
const PRODUCT = "22222222-2222-4000-8000-000000000002";

/** A row shaped the way PostgREST returns an embedded tree. */
const row = (id: string, artifacts: { kind: string; versions: number }[], openGaps = 0) => ({
  id,
  title: `Item ${id}`,
  type: "feature",
  flow_intent: null,
  opportunity_id: null,
  artifact: artifacts.map((a) => ({ kind: a.kind, artifact_version: [{ count: a.versions }] })),
  gap: [{ count: openGaps }],
});

/**
 * What the item layer asks the database for.
 *
 * These tests count *requests*, not rows. Stage is derived in TypeScript, so
 * every item on a list screen needs its artifacts — and the naive way to get
 * them is a query per item, which works perfectly in every test with three
 * items and falls over on a real workspace. Row-shape assertions cannot see
 * that; only counting the round trips can.
 *
 * Isolation itself is proved against a real Postgres in `gap-decision.db.test.ts`
 * — the database is what enforces it. What is provable here is the other half:
 * that this layer asks correctly in the first place.
 */
describe("listItemsForProduct", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.rows = [];
    calls.single = null;
  });

  it("fetches any number of items in exactly one request", async () => {
    calls.rows = Array.from({ length: 25 }, (_, i) =>
      row(`item-${i}`, [{ kind: "prd", versions: 2 }], i),
    );

    const items = await listItemsForProduct(WORKSPACE, PRODUCT);

    expect(items).toHaveLength(25);
    // The assertion the whole embedded select exists to satisfy. One `from`,
    // twenty-five items: adding a per-item lookup makes this 26.
    expect(calls.from).toEqual(["item"]);
  });

  it("asks for the artifacts and gap counts in the same request", async () => {
    calls.rows = [row("a", [{ kind: "prd", versions: 1 }])];

    await listItemsForProduct(WORKSPACE, PRODUCT);

    const [selection] = calls.select;
    expect(selection).toContain("artifact(kind, artifact_version(count))");
    expect(selection).toContain("gap(count)");
  });

  // CLAUDE.md: every table carries workspace_id and every query filters on it.
  // RLS enforces it too; this is the half a reader can check.
  it("filters on workspace_id as well as product_id", async () => {
    await listItemsForProduct(WORKSPACE, PRODUCT);

    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
    expect(calls.eq).toContainEqual(["product_id", PRODUCT]);
  });

  // §13's buckets care about what is still outstanding, so the embedded count
  // is narrowed to open gaps in the query rather than filtered after the fact.
  it("counts only open gaps", async () => {
    await listItemsForProduct(WORKSPACE, PRODUCT);
    expect(calls.eq).toContainEqual(["gap.disposition", "open"]);
  });

  // The layer returns stage; it never asks the database for one, because there
  // is none to ask for.
  it("derives each item's stage from the artifacts it fetched", async () => {
    calls.rows = [
      row("discover", []),
      row("define", [{ kind: "prd", versions: 1 }]),
      row("design", [
        { kind: "prd", versions: 3 },
        { kind: "design_package", versions: 1 },
      ]),
      // An artifact row with no versions is identity, not content.
      row("empty-prd", [{ kind: "prd", versions: 0 }]),
    ];

    const items = await listItemsForProduct(WORKSPACE, PRODUCT);

    expect(items.map((item) => item.stage)).toEqual(["discover", "define", "design", "discover"]);
    expect(calls.select.join(" ")).not.toContain("stage");
  });

  it("carries the open gap count through", async () => {
    calls.rows = [row("a", [], 4)];
    const [item] = await listItemsForProduct(WORKSPACE, PRODUCT);
    expect(item?.openGapCount).toBe(4);
  });
});

describe("getItem", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.single = null;
  });

  it("returns null for an item the caller cannot see", async () => {
    calls.single = null;
    expect(await getItem(WORKSPACE, "missing")).toBeNull();
  });

  it("fetches the item, its gaps and its decisions in one request", async () => {
    calls.single = {
      ...row("a", [{ kind: "prd", versions: 2 }]),
      gap: [
        {
          id: "g1",
          check_id: "MN-2",
          tag: "must",
          disposition: "open",
          evidence: "'nearby' — same venue, or within 100 m?",
          resolved_by_user_id: null,
          resolved_at: null,
          resolution_note: null,
        },
        {
          id: "g2",
          check_id: "MN-7",
          tag: "should",
          disposition: "accepted",
          evidence: "No offline handling.",
          resolved_by_user_id: "user-1",
          resolved_at: "2026-08-22T10:00:00Z",
          resolution_note: "Accepted for V1; revisit at scale.",
        },
      ],
      decision: [
        {
          id: "d1",
          statement: "Dropping video for V1",
          reason: "Capacity",
          decided_by_user_id: "user-1",
          decided_at: "2026-08-22T09:00:00Z",
          supersedes_id: null,
        },
      ],
    };

    const item = await getItem(WORKSPACE, "a");

    expect(calls.from).toEqual(["item"]);
    expect(item?.stage).toBe("define");
    // §5's history is the point of an item page: accepted gaps stay visible,
    // and only the open ones count toward the badge.
    expect(item?.gaps).toHaveLength(2);
    expect(item?.openGapCount).toBe(1);
    expect(item?.decisions[0]?.statement).toBe("Dropping video for V1");
    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
  });
});
