import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The two tables T2.3 adds, and the fourth gap disposition, proved against a
 * real Postgres.
 *
 * Four things only the database can say, and none of them is checkable in
 * TypeScript:
 *
 *   1. **§5's cache is a constraint.** One artifact version scored against one
 *      rubric version can only ever have produced one run. The unique index is
 *      what makes "asking twice and getting two different scores" impossible
 *      rather than merely avoided by a code path that remembers to look first.
 *   2. **Both tables are append-only.** The trigger is the layer the service
 *      role cannot bypass, which is the only layer that actually holds.
 *   3. **Isolation.** A member of workspace A cannot read B's runs or their
 *      check results — tested with the filter deliberately absent.
 *   4. **The resolution shape still holds with `closed` in it.** A machine
 *      closes a gap with a time and no name; an accepted one still needs all
 *      three parts of a human's stamp.
 *
 * Users are impersonated the way PostgREST does it, and every test runs inside
 * a transaction that is rolled back — see rls.db.test.ts for the long form.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

const USER_A = "aaaaaaaa-3333-4000-8000-00000000000a";
const USER_B = "bbbbbbbb-3333-4000-8000-00000000000b";
const INSTANCE = "00000000-0000-0000-0000-000000000000";

type Tx = postgres.TransactionSql;

async function rolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!sql) throw new Error("no database");
  const sentinel = Symbol("rollback");
  let captured: T;

  try {
    await sql.begin(async (tx) => {
      captured = await fn(tx);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }

  return captured!;
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
  run: string;
};

/** Two workspaces, each with an item, a PRD version and one scoring run. */
async function seedTwoWorkspaces(tx: Tx): Promise<Record<string, Seeded>> {
  for (const [id, email] of [
    [USER_A, "score-a@example.test"],
    [USER_B, "score-b@example.test"],
  ] as const) {
    await tx`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values (${id}, ${INSTANCE}, 'authenticated', 'authenticated', ${email}, '',
              now(), now(), now())`;
  }

  const made: Record<string, Seeded> = {};

  for (const [key, user, name, slug] of [
    ["a", USER_A, "Scores A", "scores-a"],
    ["b", USER_B, "Scores B", "scores-b"],
  ] as const) {
    const [ws] = await tx<{ id: string }[]>`
      insert into workspace (name) values (${name}) returning id`;
    const workspace = ws!.id;

    await tx`insert into membership (workspace_id, user_id, role, all_products)
             values (${workspace}, ${user}, 'owner', true)`;

    const [product] = await tx<{ id: string }[]>`
      insert into product (workspace_id, name, slug, key_prefix)
      values (${workspace}, ${name}, ${slug}, substring(${slug} from 1 for 3)) returning id`;

    const [item] = await tx<{ id: string }[]>`
      insert into item (workspace_id, product_id, type, title, flow_intent)
      values (${workspace}, ${product!.id}, 'feature', ${`${name} item`}, 'value') returning id`;

    const [artifact] = await tx<{ id: string }[]>`
      insert into artifact (workspace_id, item_id, kind)
      values (${workspace}, ${item!.id}, 'prd') returning id`;

    const [version] = await tx<{ id: string }[]>`
      insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                    content_hash, authored_by_kind, authored_by_user_id)
      values (${workspace}, ${artifact!.id}, 1, ${tx.json({ body: `${name} PRD` })},
              ${`${name}-hash`}, 'human', ${user}) returning id`;

    const [run] = await tx<{ id: string }[]>`
      insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                               pack_id, pack_version, protocol_version,
                               provider, model, conditions_met, earned, denominator)
      values (${workspace}, ${item!.id}, ${artifact!.id}, ${version!.id},
              'feature-prd', '1.0.0', '1.0.0', 'anthropic', 'pinned-model',
              ${["user-to-user-or-location"]}, 58, 99) returning id`;

    await tx`
      insert into scoring_check_result (workspace_id, run_id, check_id, tag, points,
                                        passed, requirement_id, quote, note)
      values (${workspace}, ${run!.id}, 'prd-19', 'must', 8, false, 'GM-2',
              ${`${name} quote`}, 'Two readings possible.')`;

    made[key] = {
      workspace,
      product: product!.id,
      item: item!.id,
      artifact: artifact!.id,
      version: version!.id,
      run: run!.id,
    };
  }

  return made;
}

describe.skipIf(OFFLINE)("§5's cache is a constraint, not a convention", () => {
  it("refuses a second run for the same version and rubric version", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      // The failure this prevents: two runs against one immutable version,
      // reporting two different scores for text that did not change.
      await rejectsWith(
        tx,
        (sp) => sp`
          insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                   pack_id, pack_version, protocol_version,
                                   provider, model, conditions_met, earned, denominator)
          values (${a.workspace}, ${a.item}, ${a.artifact}, ${a.version},
                  'feature-prd', '1.0.0', '1.0.0', 'anthropic', 'pinned-model', ${[]}, 61, 99)`,
        /scoring_run_cache_key/i,
      );
    });
  });

  it("allows a run for the same version under a new rubric version", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      // §5 versions rubrics like documents, and editing one triggers a
      // re-baseline pass. The old run stays; the new one sits beside it.
      const rows = await tx<{ id: string }[]>`
        insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                 pack_id, pack_version, protocol_version,
                                 provider, model, conditions_met, earned, denominator)
        values (${a.workspace}, ${a.item}, ${a.artifact}, ${a.version},
                'feature-prd', '1.1.0', '1.0.0', 'anthropic', 'pinned-model', ${[]}, 61, 99)
        returning id`;

      expect(rows).toHaveLength(1);
    });
  });

  it("allows a run for the same version under a new protocol version", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      // The protocol is the other half of the prompt (`src/lib/scoring/prompt.ts`)
      // and editing it changes verdicts exactly as editing a rubric does. In the
      // key for that reason: without it, a protocol edit would keep serving the
      // score the old question produced.
      const rows = await tx<{ id: string }[]>`
        insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                 pack_id, pack_version, protocol_version,
                                 provider, model, conditions_met, earned, denominator)
        values (${a.workspace}, ${a.item}, ${a.artifact}, ${a.version},
                'feature-prd', '1.0.0', '1.1.0', 'anthropic', 'pinned-model', ${[]}, 61, 99)
        returning id`;

      expect(rows).toHaveLength(1);
    });
  });

  it("refuses a run that earned more than it was scored out of", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                   pack_id, pack_version, protocol_version,
                                   provider, model, conditions_met, earned, denominator)
          values (${a.workspace}, ${a.item}, ${a.artifact}, ${a.version},
                  'feature-prd', '2.0.0', '1.0.0', 'anthropic', 'pinned-model', ${[]}, 120, 99)`,
        /scoring_run_earned_bounded/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("runs are history", () => {
  it("refuses an UPDATE on a run, service role included", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);

      // Not a policy — a trigger. This connection is the service role and
      // bypasses RLS entirely, which is the point of testing it here.
      await rejectsWith(
        tx,
        (sp) => sp`update scoring_run set earned = 99 where id = ${made.a!.run}`,
        /append-only/i,
      );
    });
  });

  it("refuses a DELETE on a run", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);

      await rejectsWith(
        tx,
        (sp) => sp`delete from scoring_run where id = ${made.a!.run}`,
        /append-only/i,
      );
    });
  });

  it("refuses an UPDATE on a check result", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);

      await rejectsWith(
        tx,
        (sp) => sp`
          update scoring_check_result set passed = true
           where workspace_id = ${made.a!.workspace}`,
        /append-only/i,
      );
    });
  });

  it("refuses a DELETE on a check result", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);

      await rejectsWith(
        tx,
        (sp) => sp`
          delete from scoring_check_result where workspace_id = ${made.a!.workspace}`,
        /append-only/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("§1 law 3 — a verdict's shape", () => {
  it("refuses a failure whose reading is null, not merely empty", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into scoring_check_result (workspace_id, run_id, check_id, tag, points,
                                            passed, requirement_id, quote, note)
          values (${a.workspace}, ${a.run}, 'prd-10', 'must', 10, false, null, null, null)`,
        /scoring_check_result_evidence_shape/i,
      );
    });
  });

  it("refuses a pass carrying evidence, because a pass has no gap", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into scoring_check_result (workspace_id, run_id, check_id, tag, points,
                                            passed, requirement_id, quote, note)
          values (${a.workspace}, ${a.run}, 'prd-10', 'must', 10, true, null, 'a quote', null)`,
        /scoring_check_result_evidence_shape/i,
      );
    });
  });

  it("allows a failure whose quote is null, because some fail on an absence", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      const rows = await tx<{ id: string }[]>`
        insert into scoring_check_result (workspace_id, run_id, check_id, tag, points,
                                          passed, requirement_id, quote, note)
        values (${a.workspace}, ${a.run}, 'prd-8', 'should', 4, false, null, null,
                'No kill or rollback line anywhere.')
        returning id`;

      expect(rows).toHaveLength(1);
    });
  });
});

describe.skipIf(OFFLINE)("gap — the fourth disposition", () => {
  it("closes with a time and no name, which is what a machine may write", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${a.workspace}, ${a.item}, 'prd-19', 'must', 'GM-2: two readings.')
        returning id`;

      await tx`
        update gap set disposition = 'closed', resolved_at = now()
         where id = ${gap!.id}`;

      const rows = await tx<{ disposition: string; resolved_by_user_id: string | null }[]>`
        select disposition::text as disposition, resolved_by_user_id
          from gap where id = ${gap!.id}`;

      expect(rows[0]!.disposition).toBe("closed");
      expect(rows[0]!.resolved_by_user_id).toBeNull();
    });
  });

  it("refuses a closed gap that names a resolver", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${a.workspace}, ${a.item}, 'prd-19', 'must', 'GM-2: two readings.')
        returning id`;

      // `closed` is the machine saying reality moved. A name on it would make it
      // look like §5's accepted — a person taking the debt — which it is not.
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'closed', resolved_at = now(),
                         resolved_by_user_id = ${USER_A}, resolution_note = 'done'
           where id = ${gap!.id}`,
        /gap_resolution_shape/i,
      );
    });
  });

  it("refuses an accepted gap whose note is null, not merely empty", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${a.workspace}, ${a.item}, 'prd-16', 'must', 'No offline behaviour.')
        returning id`;

      // The three-valued-logic hole 0009 closes: `length(btrim(null)) > 0` is
      // NULL rather than false, and a CHECK whose expression is NULL passes. A
      // named debt with no reason recorded is §1 law 7 with the point removed.
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'accepted', resolved_at = now(),
                         resolved_by_user_id = ${USER_A}, resolution_note = null
           where id = ${gap!.id}`,
        /gap_resolution_shape/i,
      );
    });
  });

  it("still requires all three parts of a human's stamp on an accepted gap", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      const [gap] = await tx<{ id: string }[]>`
        insert into gap (workspace_id, item_id, check_id, tag, evidence)
        values (${a.workspace}, ${a.item}, 'prd-16', 'must', 'No offline behaviour.')
        returning id`;

      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'accepted', resolved_at = now()
           where id = ${gap!.id}`,
        /gap_resolution_shape/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("RLS — runs are workspace-isolated", () => {
  it("shows a member only their own workspace's runs", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      // Deliberately unfiltered: if the policy is what holds, asking for
      // everything still returns one workspace's rows.
      const rows = await tx<{ model: string }[]>`select model from scoring_run`;
      expect(rows).toHaveLength(1);
    });
  });

  it("shows a member only their own workspace's check results", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_B);

      const rows = await tx<{ quote: string }[]>`select quote from scoring_check_result`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.quote).toContain("Scores B");
    });
  });

  it("hides the other workspace's run even when asked for by id", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const rows = await tx`select id from scoring_run where id = ${made.b!.run}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("refuses a member writing a run at all", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      // There is no INSERT policy on purpose: a client that could write its own
      // run row could write its own score.
      await rejectsWith(
        tx,
        (sp) => sp`
          insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                   pack_id, pack_version, protocol_version,
                                   provider, model, conditions_met, earned, denominator)
          values (${made.a!.workspace}, ${made.a!.item}, ${made.a!.artifact}, ${made.a!.version},
                  'feature-prd', '9.9.9', '1.0.0', 'anthropic', 'mine', ${[]}, 100, 100)`,
        /row-level security/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("§5's queue", () => {
  it("holds the next attempt on the artifact, which survives a failed run", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const a = made.a!;

      await tx`
        update artifact set next_scoring_attempt_at = now() + interval '15 minutes'
         where workspace_id = ${a.workspace} and id = ${a.artifact}`;

      const rows = await tx<{ next: Date | null }[]>`
        select next_scoring_attempt_at as next from artifact where id = ${a.artifact}`;

      expect(rows[0]!.next).not.toBeNull();
    });
  });
});
