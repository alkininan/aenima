import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import { roundCount } from "@/lib/authoring/rounds";
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
 * **Until migration 0015 is applied this file skips, and says so.** The run that
 * wrote it holds a credential that cannot apply a migration (guidelines §5, the
 * capability boundary); the table exists once the human answers `apply`.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const APPLIED = sql
  ? (
      await sql<{ present: boolean }[]>`
        select to_regclass('public.refinement_round') is not null as present`
    )[0]!.present
  : false;

if (sql && !APPLIED) {
  process.stderr.write(
    [
      "",
      "[33m  ============================================================[0m",
      "[33m  SKIPPED: refinement_round tests did not run.[0m",
      "",
      "  The table does not exist on this database: migration",
      "  drizzle/0015_refinement_round.sql has not been applied. The",
      "  round ledger's key, shape, append-only guarantee and RLS were",
      "  NOT verified by this run.",
      "[33m  ============================================================[0m",
      "",
      "",
    ].join("\n"),
  );
}

const SKIP = OFFLINE || !APPLIED;

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

function round(seeded: Seeded, overrides: Partial<RoundWrite> = {}): RoundWrite {
  return {
    sectionId: "scheduling",
    checkId: "prd-4",
    roundNo: 1,
    outcome: "held",
    reason: "No evidence is attached.",
    evidence: "Propose 2 time options",
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
