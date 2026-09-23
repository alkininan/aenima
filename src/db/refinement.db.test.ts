import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import { roundCount } from "@/lib/authoring/rounds";
import { parseSections, sectionHash } from "@/lib/authoring/sections";
import { migrationGate } from "@/test/migration-gate";
import type { RoundWrite } from "@/lib/authoring/loop";

vi.mock("server-only", () => ({}));

/**
 * `refinement_round` and `writeRound` against a real Postgres — T3.1's ledger.
 *
 * What only the database can say:
 *
 *   1. **The addendum's key is a constraint.** Two rounds on one (artifact,
 *      section, check) are two rows, and a second row with the same round
 *      number is refused — the count cannot be written twice (AA3).
 *   2. **The open question is a round row marked surfaced**, round 3 and only
 *      round 3, and no table of its own exists (AA2).
 *   3. **A revised round cuts its version in the same transaction**, attributed
 *      to the author agent, and both writes leave a ledger row.
 *   4. **Append-only and isolated**, the same three layers and the same RLS
 *      every other ledger has.
 *
 * `writeRound` runs inside this test's transaction the way `scoring-write`
 * runs `writeRun`: the shared client is mocked to hand it a handle whose
 * `begin` is a savepoint, and the outer transaction is discarded.
 *
 * **While a migration of this table is still on a branch this file skips, and
 * says so.** `migrationGate` is the rule (src/test/migration-gate.ts, T0.26):
 * the run that writes a migration holds a credential that cannot apply one
 * (guidelines §5, the capability boundary), so the table exists once the human
 * answers `apply`. Once the file is on `origin/main` the licence ends and a
 * missing table is a real failure rather than a ticket in flight. Two
 * migrations gate this suite, so each is asked about on its own: only the one
 * that is missing says whether this is a ticket in flight.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

/**
 * The table *and* the cycle T3.2's AA1 keys it by. A database holding 0015 but
 * not 0017 has a round ledger with no cycle, and every assertion below is about
 * the cycle's ledger — so the gate reads the column, not only the table, and
 * asks about each migration on its own.
 */
const APPLIED = sql
  ? (
      await sql<{ table: boolean; cycle: boolean }[]>`
        select to_regclass('public.refinement_round') is not null as "table",
               exists (select 1 from information_schema.columns
                        where table_schema = 'public'
                          and table_name = 'refinement_round'
                          and column_name = 'cycle_no') as cycle`
    )[0]!
  : { table: false, cycle: false };

const SUBJECT = "the round ledger's key, shape, append-only guarantee and RLS";

const GATES = sql
  ? [
      migrationGate({
        file: "drizzle/0015_refinement_round.sql",
        present: APPLIED.table,
        subject: SUBJECT,
      }),
      migrationGate({
        file: "drizzle/0017_refinement_cycles.sql",
        present: APPLIED.cycle,
        subject: SUBJECT,
      }),
    ]
  : [];

const SKIP = OFFLINE || GATES.some((gate) => gate.skip);

type Tx = postgres.TransactionSql;

const injected = vi.hoisted(() => ({ tx: null as unknown }));

vi.mock("@/db/client", () => ({
  sharedDbClient: () => ({ db: null, sql: injected.tx }),
  createDbClient: () => ({ db: null, sql: injected.tx }),
  closeSharedDbClient: async () => {},
}));

/** `writeRound` opens its own transaction; inside the test's, that is a savepoint. */
function asClient(tx: Tx): Tx {
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "begin") return target.savepoint.bind(target);
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Tx;
}

const { readRounds, writeRound } = await import("@/db/queries/refinement");

afterAll(async () => {
  await sql?.end();
});

const USER_A = "aaaaaaaa-5555-4000-8000-00000000000a";
const USER_B = "bbbbbbbb-5555-4000-8000-00000000000b";

async function rolledBack(fn: (tx: Tx) => Promise<void>): Promise<void> {
  if (!sql) throw new Error("no database");
  const sentinel = Symbol("rollback");
  try {
    await sql.begin(async (tx) => {
      injected.tx = asClient(tx);
      await fn(tx);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  } finally {
    injected.tx = null;
  }
}

async function rejectsWith(tx: Tx, statement: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => statement(sp as Tx))).rejects.toThrow(pattern);
}

async function actAs(tx: Tx, user: string) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

type Seeded = {
  workspace: string;
  product: string;
  item: string;
  artifact: string;
  version: string;
};

async function seed(tx: Tx, user: string, email: string, name: string): Promise<Seeded> {
  await tx`select app.seed_user(${user}, ${email})`;
  const [ws] = await tx<
    { id: string }[]
  >`insert into workspace (name) values (${name}) returning id`;
  const workspace = ws!.id;
  await tx`insert into membership (workspace_id, user_id, role, all_products)
           values (${workspace}, ${user}, 'owner', true)`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [product] = await tx<{ id: string }[]>`
    insert into product (workspace_id, name, slug, key_prefix)
    values (${workspace}, ${name}, ${slug}, substring(${slug} from 1 for 3)) returning id`;
  const [item] = await tx<{ id: string }[]>`
    insert into item (workspace_id, product_id, type, title)
    values (${workspace}, ${product!.id}, 'feature', ${`${name} item`}) returning id`;
  const [artifact] = await tx<{ id: string }[]>`
    insert into artifact (workspace_id, item_id, kind)
    values (${workspace}, ${item!.id}, 'prd') returning id`;
  const [version] = await tx<{ id: string }[]>`
    insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                  content_hash, authored_by_kind, authored_by_user_id)
    values (${workspace}, ${artifact!.id}, 1, ${tx.json({ body: BODY })},
            'hash', 'human', ${user}) returning id`;
  return {
    workspace,
    product: product!.id,
    item: item!.id,
    artifact: artifact!.id,
    version: version!.id,
  };
}

const BODY = "## Scheduling\nPropose 2 time options.\n";

/** The section's text in the seeded human version, hashed — the cycle's baseline. */
const BASE_HASH = sectionHash(parseSections(BODY), "scheduling")!;

function round(seeded: Seeded, overrides: Partial<RoundWrite> = {}): RoundWrite {
  return {
    sectionId: "scheduling",
    checkId: "prd-4",
    cycleNo: 1,
    baseSectionHash: BASE_HASH,
    roundNo: 1,
    outcome: "held",
    reason: "No evidence is attached.",
    reasonTruncated: false,
    evidence: "Propose 2 time options",
    evidenceTruncated: false,
    authorPosition: "Nobody has shared evidence yet.",
    versionId: seeded.version,
    outsideSections: null,
    revisedBody: null,
    ...overrides,
  };
}

const write = (seeded: Seeded, overrides: Partial<RoundWrite> = {}) =>
  writeRound({
    workspaceId: seeded.workspace,
    productId: seeded.product,
    itemId: seeded.item,
    artifactId: seeded.artifact,
    round: round(seeded, overrides),
    actor: { kind: "agent", name: "author" },
  });

describe.skipIf(SKIP)("the round ledger's key — TA3 → AA3", () => {
  it("holds two rounds on one (artifact, section, check) as two rows, counting to the highest round number", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { roundNo: 1 });
      await write(a, { roundNo: 2 });

      const rows = await readRounds(a.workspace, a.artifact);
      expect(rows).toHaveLength(2);
      expect(roundCount(rows, "scheduling", "prd-4")).toBe(2);
    });
  });

  it("refuses a second row with the same round number on the same key", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { roundNo: 1 });
      await expect(tx.savepoint(() => write(a, { roundNo: 1 }))).rejects.toThrow(
        /refinement_round_key/,
      );
    });
  });

  // T3.2's TA1 → AA1. The cycle sits above the round number in the key, so a
  // check the human reopened starts again at round one without colliding with
  // the cycle it already spent — and the spent cycle's rows are still there.
  it("T3.2's TA1 → AA1: lets a reopened check start again at round one on the next cycle", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { roundNo: 1 });
      await write(a, { roundNo: 2 });
      await write(a, { roundNo: 3, outcome: "surfaced", outsideSections: null });

      await write(a, { cycleNo: 2, baseSectionHash: "the-humans-rewrite", roundNo: 1 });

      const rows = await readRounds(a.workspace, a.artifact);
      expect(rows).toHaveLength(4);
      expect(rows.filter((row) => row.cycleNo === 1)).toHaveLength(3);
      // The surfaced row is exactly as it was written — history does not change.
      const surfaced = rows.find((row) => row.outcome === "surfaced")!;
      expect(surfaced).toMatchObject({ cycleNo: 1, roundNo: 3, baseSectionHash: BASE_HASH });
    });
  });

  it("T3.2's TA1 → AA1: refuses a round with no cycle at all", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await expect(tx.savepoint(() => write(a, { cycleNo: 0 }))).rejects.toThrow(
        /refinement_round_cycle/,
      );
    });
  });
});

describe.skipIf(SKIP)("the open question — TA2 → AA2", () => {
  it("is round 3 marked surfaced, carrying no version and no stray sections", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { roundNo: 1 });
      await write(a, { roundNo: 2 });
      await write(a, { roundNo: 3, outcome: "surfaced" });

      const rows = await readRounds(a.workspace, a.artifact);
      expect(rows.filter((r) => r.outcome === "surfaced")).toEqual([
        expect.objectContaining({
          roundNo: 3,
          checkId: "prd-4",
          evidence: "Propose 2 time options",
        }),
      ]);
    });
  });

  it("cannot be written before round 3, and there is no round 4", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await rejectsWith(
        tx,
        () => write(a, { roundNo: 2, outcome: "surfaced" }),
        /refinement_round_shape/,
      );
      await rejectsWith(
        tx,
        () => write(a, { roundNo: 3, outcome: "held" }),
        /refinement_round_shape/,
      );
      await rejectsWith(
        tx,
        () => write(a, { roundNo: 4, outcome: "surfaced" }),
        /refinement_round_shape/,
      );
    });
  });

  it("has no table of its own in the database", async () => {
    await rolledBack(async (tx) => {
      const tables = await tx<{ table_name: string }[]>`
        select table_name from information_schema.tables
         where table_schema = 'public' and table_name ilike '%question%'`;
      expect(tables).toEqual([]);
    });
  });
});

describe.skipIf(SKIP)("a round's outcome and what it carries", () => {
  it("cuts the revised version in the same transaction, attributed to the author, with both ledger rows", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      const revisedBody = "## Scheduling\nPropose 2 time options, or ask for a third.\n";

      const { versionId } = await write(a, { outcome: "revised", revisedBody });

      expect(versionId).not.toBeNull();
      const [version] = await tx<
        { version_no: number; body: string; kind: string; agent: string }[]
      >`
        select version_no, content->>'body' as body, authored_by_kind::text as kind,
               authored_by_agent as agent
          from artifact_version where id = ${versionId!}`;
      expect(version).toEqual({ version_no: 2, body: revisedBody, kind: "agent", agent: "author" });

      const [stored] = await tx<{ revised_version_id: string }[]>`
        select revised_version_id from refinement_round where artifact_id = ${a.artifact}`;
      expect(stored!.revised_version_id).toBe(versionId);

      const ledger = await tx<{ action: string; shape: string }[]>`
        select action, jsonb_typeof(metadata) as shape from activity
         where workspace_id = ${a.workspace} order by action`;
      expect(ledger).toEqual([
        { action: "artifact.version.added", shape: "object" },
        { action: "refinement.revised", shape: "object" },
      ]);
    });
  });

  it("writes a refused round with the sections it strayed into, and refuses one that names none", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { outcome: "refused", outsideSections: ["cancellation"] });
      const [stored] = await tx<{ outside_sections: string[] }[]>`
        select outside_sections from refinement_round where artifact_id = ${a.artifact}`;
      expect(stored!.outside_sections).toEqual(["cancellation"]);

      await rejectsWith(
        tx,
        () => write(a, { roundNo: 2, outcome: "refused", outsideSections: [] }),
        /refinement_round_shape/,
      );
      await rejectsWith(
        tx,
        () => write(a, { roundNo: 2, outcome: "revised", revisedBody: null }),
        /carries no body/,
      );
    });
  });
});

describe.skipIf(SKIP)("rounds are history, and workspace-isolated", () => {
  it("refuses UPDATE and DELETE, service role included", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a);
      await rejectsWith(tx, (sp) => sp`update refinement_round set round_no = 2`, /append-only/);
      await rejectsWith(tx, (sp) => sp`delete from refinement_round`, /append-only/);
    });
  });

  it("lets a member of one workspace read none of another's rounds", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      const b = await seed(tx, USER_B, "refine-b@example.test", "Refine B");
      await write(a);
      await write(b);

      await actAs(tx, USER_A);
      // No workspace filter on purpose: RLS is what is under test.
      const visible = await tx<{ workspace_id: string }[]>`
        select workspace_id from refinement_round`;
      expect(visible.map((row) => row.workspace_id)).toEqual([a.workspace]);
    });
  });
});

// T3.2's TA3 → AA3. An objection too long for a round is cut and recorded, and
// one whose quote had to be cut surfaces with no author position — a shape the
// table refused before 0017, which is why it could only be dropped.
describe.skipIf(SKIP)("an objection a round had to cut — TA3 → AA3", () => {
  it("stores the cut as a fact on the row", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, { reasonTruncated: true, evidenceTruncated: true });

      const [row] = await tx<{ reason_truncated: boolean; evidence_truncated: boolean }[]>`
        select reason_truncated, evidence_truncated from refinement_round
        where artifact_id = ${a.artifact}`;
      expect(row).toEqual({ reason_truncated: true, evidence_truncated: true });
    });
  });

  it("takes a surfacing the author never answered, at round one, with no position", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await write(a, {
        roundNo: 1,
        outcome: "surfaced",
        authorPosition: null,
        evidenceTruncated: true,
      });

      const rows = await readRounds(a.workspace, a.artifact);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ roundNo: 1, outcome: "surfaced", authorPosition: null });
    });
  });

  it("still requires a position of every outcome the author answered", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await expect(
        tx.savepoint(() => write(a, { outcome: "held", authorPosition: null })),
      ).rejects.toThrow(/refinement_round_shape/);
    });
  });

  it("refuses a surfacing past round three, so the cap is still the database's", async () => {
    await rolledBack(async (tx) => {
      const a = await seed(tx, USER_A, "refine-a@example.test", "Refine A");
      await expect(
        tx.savepoint(() => write(a, { roundNo: 4, outcome: "surfaced", authorPosition: null })),
      ).rejects.toThrow(/refinement_round_shape/);
    });
  });
});
