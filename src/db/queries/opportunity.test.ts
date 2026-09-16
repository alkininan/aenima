import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Everything the layer asked PostgREST for, in order. */
const calls = vi.hoisted(() => ({
  from: [] as string[],
  select: [] as string[],
  eq: [] as [string, unknown][],
  /**
   * Both arguments, unlike `item.test.ts`'s recorder: this layer orders an
   * *embedded* table, and which table is in the options rather than in the
   * column name. A recorder that kept only `ascending` could not tell an
   * ordered embed from an ordered outer read.
   */
  order: [] as [string, { ascending?: boolean; referencedTable?: string } | undefined][],
  rows: [] as unknown[],
  single: null as unknown,
}));

/**
 * The recording PostgREST stand-in `item.test.ts` uses, verbatim in behaviour:
 * every filter method returns the builder, and the builder is thenable, so
 * `await`ing it anywhere in the chain resolves.
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
    order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
      calls.order.push([column, options]);
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

import { getOpportunityByKey, listOpportunities } from "@/db/queries/opportunity";

const WORKSPACE = "11111111-1111-4000-8000-000000000001";
const PRODUCT = "22222222-2222-4000-8000-000000000002";

/** A row shaped the way PostgREST returns the embedded tree. */
const pageRow = (
  key: string,
  items: { key: string; artifacts: { kind: string; versions: number }[] }[] = [],
) => ({
  id: "33333333-3333-4000-8000-000000000003",
  key,
  title: "New users don't return after week 1",
  summary: "Retention drops sharply between day 3 and day 7.",
  product: { name: "Sociera" },
  item: items.map((entry) => ({
    key: entry.key,
    title: `Item ${entry.key}`,
    type: "feature",
    artifact: entry.artifacts.map((a) => ({
      kind: a.kind,
      artifact_version: [{ count: a.versions }],
    })),
  })),
});

/**
 * What the opportunity layer asks the database for.
 *
 * Isolation itself is proved against a real Postgres in `rls.db.test.ts` — the
 * database is what enforces it. What is provable here is the other half: that
 * this layer asks correctly in the first place, names the tenant it is reading,
 * and turns "no row" into null rather than into something a page would render.
 */
beforeEach(() => {
  calls.from = [];
  calls.select = [];
  calls.eq = [];
  calls.order = [];
  calls.rows = [];
  calls.single = null;
});

describe("listOpportunities", () => {
  it("names both the workspace and the product it is reading", async () => {
    calls.rows = [];

    await listOpportunities(WORKSPACE, PRODUCT);

    expect(calls.from).toEqual(["opportunity"]);
    expect(calls.eq).toEqual([
      ["workspace_id", WORKSPACE],
      ["product_id", PRODUCT],
    ]);
  });
});

/**
 * `listOpportunities` predates this ticket and no criterion names it. Its one
 * test is here because the file is the layer's, not the ticket's, and a query
 * that names its tenant is the thing CLAUDE.md asks of every one of them.
 */

describe("getOpportunityByKey", () => {
  /**
   * The tenant filter is the half of product isolation this layer owns. RLS is
   * the other half and it is not a reason to omit this one — CLAUDE.md asks
   * every query to state the tenant it reads.
   */
  it("filters on the workspace and the key, in one request", async () => {
    calls.single = pageRow("soc-3");

    await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(calls.from).toEqual(["opportunity"]);
    expect(calls.eq).toEqual([
      ["workspace_id", WORKSPACE],
      ["key", "soc-3"],
    ]);
  });

  /**
   * §2's tree in one round trip. Fetching the items separately — or their
   * artifacts per item — is the N+1 that works perfectly with three items and
   * falls over on a real product. Only counting the requests can see it.
   */
  it("fetches the items and their artifacts with the opportunity", async () => {
    calls.single = pageRow("soc-3", [
      { key: "soc-1", artifacts: [{ kind: "prd", versions: 2 }] },
      { key: "soc-2", artifacts: [{ kind: "brief", versions: 1 }] },
      { key: "soc-5", artifacts: [] },
    ]);

    const opportunity = await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(calls.from).toHaveLength(1);
    expect(calls.select[0]).toContain(
      "item(key, title, type, artifact(kind, artifact_version(count)))",
    );
    expect(opportunity?.items.map((item) => item.key)).toEqual(["soc-1", "soc-2", "soc-5"]);
  });

  /**
   * PostgREST orders an embed only when asked. Unordered, the item list can
   * come back in a different order on two reads of the same page — which is
   * what `OpportunityPageDetail.items` promising "creation order" would be
   * lying about, and what a person watching a list reshuffle under them would
   * see. The order is on the *embedded* table, so `referencedTable` is the
   * half of this assertion that matters.
   */
  it("asks for the items in creation order, on the embed", async () => {
    calls.single = pageRow("soc-3", [{ key: "soc-1", artifacts: [] }]);

    await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(calls.order).toEqual([
      ["created_at", { ascending: true, referencedTable: "item" }],
      // Not a total order on its own: rows from one statement share `now()`,
      // which is why `drizzle/0015`'s backfill tie-breaks the same way.
      ["key", { ascending: true, referencedTable: "item" }],
    ]);
  });

  /** The layer returns a stage; it never asks the database for one. */
  it("derives each item's stage and asks for none", async () => {
    calls.single = pageRow("soc-3", [
      { key: "soc-1", artifacts: [{ kind: "prd", versions: 1 }] },
      { key: "soc-2", artifacts: [{ kind: "prd", versions: 0 }] },
    ]);

    const opportunity = await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(calls.select[0]).not.toContain("stage");
    expect(opportunity?.items.map((item) => item.stage)).toEqual(["define", "discover"]);
  });

  it("carries the opportunity's own name and its product", async () => {
    calls.single = pageRow("soc-3");

    const opportunity = await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(opportunity?.key).toBe("soc-3");
    expect(opportunity?.title).toBe("New users don't return after week 1");
    expect(opportunity?.summary).toBe("Retention drops sharply between day 3 and day 7.");
    expect(opportunity?.productName).toBe("Sociera");
  });

  /**
   * §2 makes `summary` optional, so an opportunity with only a title is a legal
   * one. Null rather than an empty string, which would render as a blank line.
   */
  it("reports a missing summary as null rather than as empty", async () => {
    calls.single = { ...pageRow("soc-3"), summary: null };

    const opportunity = await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(opportunity?.summary).toBeNull();
  });

  /**
   * **A key that does not exist and a key in another workspace are the same
   * answer.** The read filters `workspace_id` and RLS narrows it again as the
   * user, so both come back as no row, and the page turns both into the same
   * 404. Telling them apart would answer "does this key exist somewhere?".
   */
  it("returns null for a key it cannot see, as for one that does not exist", async () => {
    calls.single = null;

    const opportunity = await getOpportunityByKey(WORKSPACE, "aur-9");

    expect(opportunity).toBeNull();
  });

  /** An opportunity nobody has bet on yet is a normal state, not a hole. */
  it("returns an empty item list rather than failing when nothing is linked", async () => {
    calls.single = pageRow("soc-3");

    const opportunity = await getOpportunityByKey(WORKSPACE, "soc-3");

    expect(opportunity?.items).toEqual([]);
  });
});
