import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Everything the layer asked PostgREST for, in order. */
const calls = vi.hoisted(() => ({
  from: [] as string[],
  select: [] as string[],
  eq: [] as [string, unknown][],
  /** `order()` used to discard its arguments, so "newest first" could not be
   *  asserted at all. A feed's direction is the whole of its meaning. */
  order: [] as [string, boolean | undefined][],
  /** Likewise `limit()`: an unbounded ledger read is a slow page nobody sees
   *  coming, and the cap is what a test has to be able to see. */
  limit: [] as number[],
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
    order(column: string, options?: { ascending?: boolean }) {
      calls.order.push([column, options?.ascending]);
      return builder;
    },
    limit(count: number) {
      calls.limit.push(count);
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

import {
  getItem,
  getItemByKey,
  listItemsForProduct,
  listItemsForWorkspace,
} from "@/db/queries/item";

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
    calls.order = [];
    calls.limit = [];
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
    calls.order = [];
    calls.limit = [];
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

/**
 * The §13 list read — one request for the whole workspace.
 *
 * Same instrument as above and for the same reason: this one fetches two
 * clocks and every open gap on top of the artifacts, so there are three more
 * places a per-item lookup could creep in and still look fine in a test with
 * three rows.
 */
describe("listItemsForWorkspace", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.order = [];
    calls.limit = [];
    calls.rows = [];
    calls.single = null;
  });

  /** A row shaped the way PostgREST returns the list tree. */
  const listRow = (
    key: string,
    artifacts: { kind: string; versions: string[] }[] = [],
    gaps: { tag: string; createdAt: string }[] = [],
    updatedAt = "2026-01-01T00:00:00+00:00",
  ) => ({
    id: `id-${key}`,
    key,
    title: `Item ${key}`,
    type: "feature",
    flow_intent: null,
    opportunity_id: null,
    product_id: "p1",
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: updatedAt,
    product: { name: "Sociera", slug: "sociera" },
    artifact: artifacts.map((a) => ({
      kind: a.kind,
      artifact_version: a.versions.map((created_at) => ({ created_at })),
    })),
    gap: gaps.map((g, i) => ({
      id: `${key}-g${i}`,
      check_id: "MN-2",
      tag: g.tag,
      created_at: g.createdAt,
    })),
  });

  it("fetches the whole workspace in exactly one request", async () => {
    calls.rows = Array.from({ length: 40 }, (_, i) =>
      listRow(
        `soc-${i}`,
        [{ kind: "prd", versions: ["2026-02-01T00:00:00+00:00"] }],
        [{ tag: "must", createdAt: "2026-02-02T00:00:00+00:00" }],
      ),
    );

    const { items } = await listItemsForWorkspace(WORKSPACE);

    expect(items).toHaveLength(40);
    // Forty items, one round trip. A per-item gap or version lookup makes this
    // 41 or 81, and nothing else in the suite would notice.
    expect(calls.from).toEqual(["item"]);
  });

  it("asks for the product, the artifacts, the versions and the gaps together", async () => {
    await listItemsForWorkspace(WORKSPACE);

    const [selection] = calls.select;
    expect(selection).toContain("product(name, slug)");
    expect(selection).toContain("artifact(kind, artifact_version(created_at))");
    expect(selection).toContain("gap(id, check_id, tag, created_at)");
    // Never the version bodies — that is the jsonb a list screen must not carry.
    expect(selection).not.toContain("content");
  });

  // CLAUDE.md: every query filters workspace_id. And this one does *not* filter
  // product — §13's list crosses products on purpose.
  it("filters on workspace_id and on nothing else that narrows the workspace", async () => {
    await listItemsForWorkspace(WORKSPACE);

    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
    expect(calls.eq.map(([column]) => column)).not.toContain("product_id");
  });

  it("narrows the gap embed to open gaps", async () => {
    await listItemsForWorkspace(WORKSPACE);
    expect(calls.eq).toContainEqual(["gap.disposition", "open"]);
  });

  // The layer returns a stage and a stage entry; it asks the database for
  // neither, because there is neither to ask for.
  it("never asks the database for a stage", async () => {
    await listItemsForWorkspace(WORKSPACE);
    expect(calls.select.join(" ")).not.toContain("stage");
  });

  /**
   * Version rows arrive in no defined order — PostgREST emits no ORDER BY for
   * an embed unless asked. The earliest is scanned for rather than taken from
   * the front, and this is the row that would pass either way if it were sorted
   * and fails if the code indexes into it.
   */
  it("takes the earliest version as the stage entry, whatever order they arrive in", async () => {
    calls.rows = [
      listRow("soc-1", [
        {
          kind: "prd",
          versions: [
            "2026-05-01T00:00:00+00:00",
            "2026-03-01T00:00:00+00:00",
            "2026-04-01T00:00:00+00:00",
          ],
        },
      ]),
    ];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.stage).toBe("define");
    expect(item?.stageEnteredAt).toBe("2026-03-01T00:00:00+00:00");
  });

  it("counts versions from the rows rather than a separate count", async () => {
    calls.rows = [
      listRow("soc-1", [
        { kind: "prd", versions: ["2026-03-01T00:00:00+00:00", "2026-03-02T00:00:00+00:00"] },
        { kind: "brief", versions: [] },
      ]),
    ];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.artifacts.find((a) => a.kind === "prd")?.versionCount).toBe(2);
    // An artifact row with no versions is identity, not content.
    expect(item?.artifacts.find((a) => a.kind === "brief")?.versionCount).toBe(0);
  });

  /**
   * Freshness is the newest thing the request saw, not `item.updated_at`.
   * `item_touch` fires on UPDATE of the item row alone, so authoring a version
   * moves nothing on the item — and an item whose last real event was a new
   * version would otherwise sort as though nothing had happened since it was
   * created.
   */
  it("takes the newest of the item, its versions and its gaps as last activity", async () => {
    calls.rows = [
      listRow(
        "soc-1",
        [{ kind: "prd", versions: ["2026-06-01T00:00:00+00:00"] }],
        [{ tag: "must", createdAt: "2026-07-01T00:00:00+00:00" }],
        "2026-02-01T00:00:00+00:00",
      ),
    ];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.lastActivityAt).toBe("2026-07-01T00:00:00+00:00");
  });

  // An item nothing has been authored into has genuinely had nothing happen to
  // it, and its own timestamp is the honest answer.
  it("falls back to the item's own timestamp when it owns nothing", async () => {
    calls.rows = [listRow("soc-1", [], [], "2026-04-01T00:00:00+00:00")];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.lastActivityAt).toBe("2026-04-01T00:00:00+00:00");
    expect(item?.stageEnteredAt).toBe("2026-01-01T00:00:00+00:00");
  });

  // A gapless item is a Flowing item, not an absent one. PostgREST returns the
  // parent with an empty array, and the layer must carry it through rather than
  // treat it as missing.
  it("keeps an item that has no open gaps", async () => {
    calls.rows = [listRow("soc-1", [{ kind: "prd", versions: ["2026-03-01T00:00:00+00:00"] }], [])];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.openGaps).toEqual([]);
    expect(item?.openGapCount).toBe(0);
  });

  it("carries the key and the product a row belongs to", async () => {
    calls.rows = [listRow("soc-12")];

    const { items } = await listItemsForWorkspace(WORKSPACE);
    const [item] = items;

    expect(item?.key).toBe("soc-12");
    expect(item?.productSlug).toBe("sociera");
    expect(item?.productName).toBe("Sociera");
  });
});

/**
 * The item page's read — `/i/<key>`, keyed by the name people say out loud.
 *
 * The two assertions that matter are about what it *cannot* tell apart. A key
 * that does not exist and a key in a workspace the caller cannot see must
 * produce the same nothing, because RLS makes them the same fact and the page
 * renders one 404 for both.
 */
describe("getItemByKey", () => {
  beforeEach(() => {
    calls.from = [];
    calls.select = [];
    calls.eq = [];
    calls.order = [];
    calls.limit = [];
    calls.single = null;
  });

  /** A row shaped the way PostgREST returns the item-page tree. */
  const pageRow = (
    key: string,
    artifacts: { kind: string; versions: { no: number; at: string; content: unknown }[] }[] = [],
    gaps: unknown[] = [],
    decisions: unknown[] = [],
  ) => ({
    id: `id-${key}`,
    key,
    title: `Item ${key}`,
    type: "feature",
    flow_intent: null,
    opportunity_id: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-02T00:00:00+00:00",
    product: { name: "Sociera", slug: "sociera" },
    opportunity: { title: "People miss what changed while they were away" },
    artifact: artifacts.map((a) => ({
      kind: a.kind,
      artifact_version: a.versions.map((v) => ({
        version_no: v.no,
        created_at: v.at,
        content: v.content,
      })),
    })),
    gap: gaps,
    decision: decisions,
  });

  it("filters on the workspace and the key, in one request", async () => {
    calls.single = pageRow("soc-12");

    await getItemByKey(WORKSPACE, "soc-12");

    expect(calls.from).toEqual(["item"]);
    expect(calls.eq).toContainEqual(["workspace_id", WORKSPACE]);
    expect(calls.eq).toContainEqual(["key", "soc-12"]);
  });

  // A key nobody owns.
  it("returns null for a key that does not exist", async () => {
    calls.single = null;
    expect(await getItemByKey(WORKSPACE, "soc-999")).toBeNull();
  });

  /**
   * The one that matters. A key belonging to another workspace is filtered out
   * by `workspace_id` and by RLS, so PostgREST returns no row — byte for byte
   * the same answer as a key that never existed. The page therefore cannot leak
   * which it was, because nothing distinguishable reaches it.
   */
  it("returns the same null for a key in another workspace", async () => {
    calls.single = null;
    const missing = await getItemByKey(WORKSPACE, "soc-999");

    calls.single = null;
    const someoneElses = await getItemByKey(WORKSPACE, "aur-1");

    expect(missing).toBe(someoneElses);
    expect(someoneElses).toBeNull();
  });

  // §5's history is the point of the page, so the read asks for every
  // disposition rather than the open ones the list narrows to.
  it("asks for gaps in every disposition, unlike the list", async () => {
    await getItemByKey(WORKSPACE, "soc-12");

    const [selection] = calls.select;
    expect(selection).toContain("disposition");
    // The list read narrows with `.eq("gap.disposition", "open")`; this must not.
    expect(calls.eq.map(([column]) => column)).not.toContain("gap.disposition");
  });

  /**
   * Version rows arrive in no defined order — PostgREST emits no ORDER BY for
   * an embed unless asked — so the newest is scanned for. This row would pass
   * either way if it were sorted, and fails if the code takes the last element.
   */
  it("takes the highest version number as current, whatever order they arrive in", async () => {
    calls.single = pageRow("soc-12", [
      {
        kind: "prd",
        versions: [
          { no: 2, at: "2026-02-02T00:00:00+00:00", content: { body: "second" } },
          { no: 3, at: "2026-02-03T00:00:00+00:00", content: { body: "newest" } },
          { no: 1, at: "2026-02-01T00:00:00+00:00", content: { body: "first" } },
        ],
      },
    ]);

    const item = await getItemByKey(WORKSPACE, "soc-12");
    const prd = item?.artifacts.find((artifact) => artifact.kind === "prd");

    expect(prd?.versionCount).toBe(3);
    expect(prd?.currentVersionNo).toBe(3);
    expect(prd?.currentBody).toBe("newest");
    expect(prd?.newestAt).toBe("2026-02-03T00:00:00+00:00");
  });

  /**
   * `content` is jsonb, so its shape is whatever was written. Anything this
   * cannot read becomes null — which renders as "nothing here yet", a true
   * statement — rather than `[object Object]` or a crash.
   */
  it("reads only the content shape it knows, and null for anything else", async () => {
    calls.single = pageRow("soc-12", [
      {
        kind: "prd",
        versions: [{ no: 1, at: "2026-02-01T00:00:00+00:00", content: { body: 42 } }],
      },
      { kind: "brief", versions: [{ no: 1, at: "2026-02-01T00:00:00+00:00", content: null }] },
      // An artifact nobody authored into. Real, and not hidden.
      { kind: "backlog", versions: [] },
    ]);

    const item = await getItemByKey(WORKSPACE, "soc-12");
    const body = (kind: string) =>
      item?.artifacts.find((artifact) => artifact.kind === kind)?.currentBody;

    expect(body("prd")).toBeNull();
    expect(body("brief")).toBeNull();
    expect(body("backlog")).toBeNull();
    expect(item?.artifacts.find((a) => a.kind === "backlog")?.versionCount).toBe(0);
  });

  /**
   * §2 lineage. The title is embedded rather than looked up separately — it is
   * a to-one from the same row, so it costs no request.
   */
  it("carries the opportunity the item came out of", async () => {
    calls.single = pageRow("soc-12");

    const item = await getItemByKey(WORKSPACE, "soc-12");

    expect(calls.select[0]).toContain("opportunity(title)");
    expect(item?.opportunityTitle).toBe("People miss what changed while they were away");
  });

  /**
   * §2: "an item may be **unlinked** from any opportunity; that shows as a
   * small advisory gap, never a block." So null is a state the read carries,
   * not an error and not an empty string that would render as a blank line.
   */
  it("reports an unlinked item as null rather than as empty", async () => {
    calls.single = { ...pageRow("soc-7"), opportunity: null };

    const item = await getItemByKey(WORKSPACE, "soc-7");

    expect(item?.opportunityTitle).toBeNull();
  });

  // The layer returns a stage; it never asks the database for one.
  it("derives the stage and asks for none", async () => {
    calls.single = pageRow("soc-12", [
      { kind: "prd", versions: [{ no: 1, at: "2026-02-01T00:00:00+00:00", content: {} }] },
    ]);

    const item = await getItemByKey(WORKSPACE, "soc-12");

    expect(item?.stage).toBe("define");
    expect(calls.select.join(" ")).not.toContain("stage");
  });
});
