import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * `writeRun` against a real Postgres — the translation from `GapWrite[]` into
 * SQL, and §5's "no partial gaps".
 *
 * **This is the file whose absence let a runtime defect ship to a smoke run.**
 * Everything above this layer is unit-tested against a mock of `writeRun`, so
 * the reconciler's decisions were covered and their execution was not: the gap
 * inserts, the ledger rows, the close, the retry field, and whether any of it is
 * atomic. A jsonb binding that threw on every call passed the whole suite.
 *
 * **How it rolls back.** `writeRun` calls `sharedDbClient()` and then
 * `sql.begin(...)`. The client is mocked to hand it this test's transaction
 * handle, so its `begin` opens a *savepoint* inside a transaction the test
 * discards. The SQL is real, the schema is real, the constraints and triggers
 * are real, and nothing survives the test — which matters more than usual here,
 * because `scoring_run` is append-only and its rows could not be cleaned up
 * afterwards even by hand.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

type Tx = postgres.TransactionSql;

/** The handle `writeRun` will find when it asks for the shared client. */
const injected = vi.hoisted(() => ({ tx: null as unknown }));

vi.mock("@/db/client", () => ({
  sharedDbClient: () => ({ db: null, sql: injected.tx }),
  createDbClient: () => ({ db: null, sql: injected.tx }),
  closeSharedDbClient: async () => {},
}));

/**
 * A transaction handle that answers to `begin`.
 *
 * `writeRun` opens its own transaction, and postgres.js spells a *nested* one
 * `savepoint` rather than `begin` — same semantics, different name, and the
 * name is what the code under test calls. The proxy bridges the two so the
 * transaction being tested is real and this test's outer one still discards it.
 */
function asClient(tx: Tx): Tx {
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "begin") return target.savepoint.bind(target);
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Tx;
}

const { writeRun } = await import("@/db/queries/scoring");

afterAll(async () => {
  await sql?.end();
});

const USER = "cccccccc-4444-4000-8000-00000000000c";
const INSTANCE = "00000000-0000-0000-0000-000000000000";

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

type World = {
  workspaceId: string;
  productId: string;
  itemId: string;
  artifactId: string;
  versionId: string;
};

async function seedWorld(tx: Tx): Promise<World> {
  await tx`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (${USER}, ${INSTANCE}, 'authenticated', 'authenticated',
            'write-path@example.test', '', now(), now(), now())`;

  const [ws] = await tx<{ id: string }[]>`
    insert into workspace (name) values ('Write path') returning id`;
  const workspaceId = ws!.id;

  await tx`insert into membership (workspace_id, user_id, role, all_products)
           values (${workspaceId}, ${USER}, 'owner', true)`;

  const [product] = await tx<{ id: string }[]>`
    insert into product (workspace_id, name, slug, key_prefix)
    values (${workspaceId}, 'Write path', 'write-path', 'wri') returning id`;

  const [item] = await tx<{ id: string }[]>`
    insert into item (workspace_id, product_id, type, title, flow_intent)
    values (${workspaceId}, ${product!.id}, 'feature', 'Ghost mode', 'value') returning id`;

  const [artifact] = await tx<{ id: string }[]>`
    insert into artifact (workspace_id, item_id, kind)
    values (${workspaceId}, ${item!.id}, 'prd') returning id`;

  const [version] = await tx<{ id: string }[]>`
    insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                  content_hash, authored_by_kind, authored_by_agent)
    values (${workspaceId}, ${artifact!.id}, 1, ${tx.json({ body: "# Ghost mode" })},
            'hash-1', 'agent', 'seed') returning id`;

  return {
    workspaceId,
    productId: product!.id,
    itemId: item!.id,
    artifactId: artifact!.id,
    versionId: version!.id,
  };
}

/** One run's worth of arguments, with only what a test varies left open. */
function runFor(world: World, over: Partial<Parameters<typeof writeRun>[0]> = {}) {
  return {
    workspaceId: world.workspaceId,
    productId: world.productId,
    itemId: world.itemId,
    artifactId: world.artifactId,
    versionId: world.versionId,
    packId: "feature-prd",
    packVersion: "1.0.0",
    protocolVersion: "1.0.0",
    provider: "anthropic" as const,
    model: "claude-sonnet-5",
    conditionsMet: ["user-to-user-or-location"],
    earned: 58,
    denominator: 99,
    verdicts: [
      {
        checkId: "prd-19",
        tag: "must" as const,
        points: 8,
        passed: false,
        requirementId: "GM-2",
        quote: "WHEN the member leaves the venue",
        note: "Leaves how?",
        evidence: "GM-2: 'WHEN the member leaves the venue' — Leaves how?",
      },
      {
        checkId: "prd-1",
        tag: "should" as const,
        points: 5,
        passed: true,
        requirementId: null,
        quote: null,
        note: null,
        evidence: "",
      },
    ],
    gapWrites: [],
    clippedChecks: [],
    actor: { kind: "agent" as const, name: "scorer" },
    ...over,
  };
}

/**
 * The ledger as §15 reads it.
 *
 * `jsonb_typeof` is selected alongside because the failure this guards against
 * is invisible otherwise: JSON stored as a jsonb *string* rather than an object
 * looks identical when printed and answers null to every `->>`.
 */
const ledger = (tx: Tx, workspaceId: string) =>
  tx<
    {
      action: string;
      subject_table: string;
      metadata: Record<string, unknown>;
      shape: string;
      check_id: string | null;
      reason: string | null;
      clipped: string | null;
      subject_id: string;
    }[]
  >`
    select action, subject_table, subject_id, metadata,
           jsonb_typeof(metadata) as shape,
           metadata->>'checkId' as check_id,
           metadata->>'reason' as reason,
           metadata->>'clipped' as clipped
      from activity
     where workspace_id = ${workspaceId} order by occurred_at, action`;

/**
 * The `score.recorded` row for one run, selected by that run's own id.
 *
 * Never by position. `occurred_at` defaults to `now()`, which is
 * transaction-*start* time and therefore constant, so every row a test writes
 * inside one transaction carries the same timestamp, `order by occurred_at`
 * ties, and `.at(-1)` picks whichever tied row the server happened to return
 * last. `writeRun` returns the run id precisely so an assertion has a
 * discriminator the database is obliged to honour — here `subject_id`, which is
 * what a `score.recorded` row names: the run is the subject, so the id is a
 * column rather than a metadata key the way it is on the `gap.*` rows.
 */
const scoreRecorded = async (tx: Tx, workspaceId: string, runId: string) =>
  (await ledger(tx, workspaceId)).find(
    (row) => row.action === "score.recorded" && row.subject_id === runId,
  );

beforeEach(() => {
  injected.tx = null;
});

describe.skipIf(OFFLINE)("writeRun — the run and its verdicts", () => {
  it("writes the run, its check results and one ledger row", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);

      const runId = await writeRun(runFor(world));

      const [run] = await tx<
        { earned: number; denominator: number; protocol_version: string }[]
      >`select earned, denominator, protocol_version from scoring_run where id = ${runId}`;
      expect(run).toMatchObject({ earned: 58, denominator: 99, protocol_version: "1.0.0" });

      const results = await tx<
        { check_id: string; passed: boolean; note: string | null }[]
      >`select check_id, passed, note from scoring_check_result where run_id = ${runId}`;
      expect(results).toHaveLength(2);
      // A pass stores no evidence at all — the constraint says so, and this is
      // the writer actually obeying it rather than the constraint catching it.
      expect(results.find((r) => r.check_id === "prd-1")?.note).toBeNull();
      expect(results.find((r) => r.check_id === "prd-19")?.note).toBe("Leaves how?");

      const rows = await ledger(tx, world.workspaceId);
      expect(rows.map((r) => r.action)).toEqual(["score.recorded"]);
      // An object, not a string that looks like one — see `logActivity`.
      expect(rows[0]!.shape).toBe("object");
    });
  });

  it("records which checks had their evidence clipped, and says null when none did", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);

      const plain = await writeRun(runFor(world));
      expect(plain).toBeTruthy();
      // Null rather than "" on an ordinary run, so `->> 'clipped' is not null`
      // is the whole query for "which runs shortened evidence".
      const ordinary = await scoreRecorded(tx, world.workspaceId, plain);
      expect(ordinary).toBeDefined();
      expect(ordinary!.clipped).toBeNull();

      // A second version, because one artifact version scores exactly once.
      const [next] = await tx<{ id: string }[]>`
        insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                      content_hash, authored_by_kind, authored_by_agent)
        values (${world.workspaceId}, ${world.artifactId}, 2,
                ${tx.json({ body: "# Ghost mode v2" })}, 'hash-2', 'agent', 'seed')
        returning id`;

      const shortened = await writeRun(
        runFor({ ...world, versionId: next!.id }, { clippedChecks: ["prd-19", "prd-8"] }),
      );

      // The gap text carries the elision mark a reader sees; this is the part
      // that says which run did the shortening.
      const clipped = await scoreRecorded(tx, world.workspaceId, shortened);
      expect(clipped).toBeDefined();
      expect(clipped!.clipped).toBe("prd-19 prd-8");
    });
  });

  it("clears the retry a failed run queued", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      await tx`update artifact set next_scoring_attempt_at = now()
                where id = ${world.artifactId}`;

      await writeRun(runFor(world));

      const [artifact] = await tx<{ next: Date | null }[]>`
        select next_scoring_attempt_at as next from artifact where id = ${world.artifactId}`;
      expect(artifact!.next).toBeNull();
    });
  });
});

describe.skipIf(OFFLINE)("writeRun — GapWrite becomes SQL", () => {
  it("raises a gap with the pack's tag and the rendered evidence", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);

      await writeRun(
        runFor(world, {
          gapWrites: [
            { kind: "insert", checkId: "prd-19", tag: "must", evidence: "GM-2: two readings." },
          ],
        }),
      );

      const [gap] = await tx<
        { check_id: string; tag: string; disposition: string; evidence: string }[]
      >`select check_id, tag, disposition::text as disposition, evidence from gap
         where workspace_id = ${world.workspaceId}`;
      expect(gap).toMatchObject({
        check_id: "prd-19",
        tag: "must",
        disposition: "open",
        evidence: "GM-2: two readings.",
      });

      const rows = await ledger(tx, world.workspaceId);
      expect(rows.map((r) => r.action).sort()).toEqual(["gap.raised", "score.recorded"]);
    });
  });

  it("restates an open gap without raising a second one", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${world.workspaceId}, ${world.itemId}, 'prd-19', 'must', 'old reading')
        returning id`;

      await writeRun(
        runFor(world, {
          gapWrites: [
            { kind: "update", gapId: gap!.id, checkId: "prd-19", evidence: "new reading" },
          ],
        }),
      );

      const gaps = await tx<{ evidence: string }[]>`
        select evidence from gap where workspace_id = ${world.workspaceId}`;
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.evidence).toBe("new reading");

      const rows = await ledger(tx, world.workspaceId);
      expect(rows.map((r) => r.action).sort()).toEqual(["gap.restated", "score.recorded"]);
    });
  });

  it("closes a gap with a time, no name, and the reason in the ledger", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${world.workspaceId}, ${world.itemId}, 'prd-15', 'must', 'no empty state')
        returning id`;

      await writeRun(
        runFor(world, {
          gapWrites: [
            {
              kind: "close",
              gapId: gap!.id,
              checkId: "prd-15",
              reason: "no-longer-applicable",
            },
          ],
        }),
      );

      const [closed] = await tx<
        { disposition: string; resolved_by_user_id: string | null; resolved_at: Date | null }[]
      >`select disposition::text as disposition, resolved_by_user_id, resolved_at
          from gap where id = ${gap!.id}`;
      expect(closed).toMatchObject({ disposition: "closed", resolved_by_user_id: null });
      expect(closed!.resolved_at).not.toBeNull();

      const rows = await ledger(tx, world.workspaceId);
      const entry = rows.find((r) => r.action === "gap.closed");
      // The row cannot say why it closed, so the ledger has to — and it has to
      // answer a `->>` to be of any use in saying it.
      expect(entry?.shape).toBe("object");
      expect(entry?.check_id).toBe("prd-15");
      expect(entry?.reason).toBe("no longer applicable");
    });
  });
});

describe.skipIf(OFFLINE)("§1 law 7 — checked at write time, not read time", () => {
  it("refuses to restate a gap accepted since the reconciler read it", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${world.workspaceId}, ${world.itemId}, 'prd-19', 'must', 'the accepted reading')
        returning id`;

      // The window: the reconciler read this gap as open and decided to restate
      // it; a person accepts it before the transaction runs.
      await tx`
        update gap set disposition = 'accepted', resolved_at = now(),
                       resolved_by_user_id = ${USER}, resolution_note = 'Shipping anyway.'
         where id = ${gap!.id}`;

      await writeRun(
        runFor(world, {
          gapWrites: [
            { kind: "update", gapId: gap!.id, checkId: "prd-19", evidence: "machine reading" },
          ],
        }),
      );

      const [after] = await tx<{ evidence: string; disposition: string }[]>`
        select evidence, disposition::text as disposition from gap where id = ${gap!.id}`;
      // A named person's debt, untouched.
      expect(after).toMatchObject({
        evidence: "the accepted reading",
        disposition: "accepted",
      });

      // And no ledger row claiming a restatement that did not happen.
      const rows = await ledger(tx, world.workspaceId);
      expect(rows.map((r) => r.action)).toEqual(["score.recorded"]);
    });
  });

  it("refuses to close a gap accepted since the reconciler read it", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${world.workspaceId}, ${world.itemId}, 'prd-16', 'must', 'no offline behaviour')
        returning id`;

      await tx`
        update gap set disposition = 'accepted', resolved_at = now(),
                       resolved_by_user_id = ${USER}, resolution_note = 'Rarely offline.'
         where id = ${gap!.id}`;

      await writeRun(
        runFor(world, {
          gapWrites: [{ kind: "close", gapId: gap!.id, checkId: "prd-16", reason: "passed" }],
        }),
      );

      const [after] = await tx<{ disposition: string; resolution_note: string | null }[]>`
        select disposition::text as disposition, resolution_note from gap where id = ${gap!.id}`;
      expect(after).toMatchObject({
        disposition: "accepted",
        resolution_note: "Rarely offline.",
      });

      const rows = await ledger(tx, world.workspaceId);
      expect(rows.map((r) => r.action)).toEqual(["score.recorded"]);
    });
  });
});

describe.skipIf(OFFLINE)("§5 — no partial gaps", () => {
  it("writes nothing at all when a later gap write fails", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);

      // A first insert that would succeed, then one the database refuses:
      // `gap_evidence_len` caps evidence at 2000 characters. Anything that
      // fails part-way through is the shape being tested — the specific
      // constraint is only a way to fail after the run row already exists.
      const doomed = writeRun(
        runFor(world, {
          gapWrites: [
            { kind: "insert", checkId: "prd-19", tag: "must", evidence: "a real gap" },
            { kind: "insert", checkId: "prd-17", tag: "must", evidence: "x".repeat(2100) },
          ],
        }),
      );

      await expect(doomed).rejects.toThrow(/gap_evidence_len/i);

      // The run row, the check results, the first gap and every ledger row are
      // gone with it. An item carrying debts no score explains is what §5's
      // "a failed run writes nothing" is protecting against, and the next run
      // would find that first gap open and restate it forever.
      const runs = await tx`select id from scoring_run where workspace_id = ${world.workspaceId}`;
      const results = await tx`
        select id from scoring_check_result where workspace_id = ${world.workspaceId}`;
      const gaps = await tx`select id from gap where workspace_id = ${world.workspaceId}`;
      const rows = await ledger(tx, world.workspaceId);

      expect(runs).toHaveLength(0);
      expect(results).toHaveLength(0);
      expect(gaps).toHaveLength(0);
      expect(rows).toHaveLength(0);
    });
  });

  it("leaves the retry field alone when the write fails", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      await tx`update artifact set next_scoring_attempt_at = '2026-01-01T00:00:00Z'
                where id = ${world.artifactId}`;

      await expect(
        writeRun(
          runFor(world, {
            gapWrites: [{ kind: "insert", checkId: "prd-17", tag: "must", evidence: "" }],
          }),
        ),
      ).rejects.toThrow();

      // Clearing it inside a transaction that rolled back would have dropped a
      // queued re-score on the floor.
      const [artifact] = await tx<{ next: Date | null }[]>`
        select next_scoring_attempt_at as next from artifact where id = ${world.artifactId}`;
      expect(artifact!.next).not.toBeNull();
    });
  });
});
