import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The two tables T1.1 adds, proved against a real Postgres.
 *
 * Three things are only true if the database says so, and none of them can be
 * checked in TypeScript:
 *
 *   1. **Isolation.** A member of workspace A cannot read B's gaps or
 *      decisions. This is the security boundary CLAUDE.md calls non-negotiable,
 *      and it is enforced by policy, not by the query layer remembering a
 *      filter — so it has to be tested with the filter deliberately absent.
 *   2. **Append-only on `decision`.** The trigger is the layer the service role
 *      cannot bypass, which is the only layer that actually holds.
 *   3. **The resolution shape on `gap`.** §5 stamps accepted and excluded gaps
 *      with who and why; a CHECK is what makes that a fact rather than a habit.
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

const USER_A = "aaaaaaaa-2222-4000-8000-00000000000a";
const USER_B = "bbbbbbbb-2222-4000-8000-00000000000b";
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

/** Asserts one statement is rejected, inside a savepoint so the tx stays usable. */
async function rejectsWith(tx: Tx, statement: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => statement(sp as Tx))).rejects.toThrow(pattern);
}

/** Becomes `user` for the rest of the transaction, exactly as PostgREST does. */
async function actAs(tx: Tx, user: string) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

/** Two workspaces, each with a product, an item, a gap and a decision. */
async function seedTwoWorkspaces(tx: Tx) {
  for (const [id, email] of [
    [USER_A, "gap-a@example.test"],
    [USER_B, "gap-b@example.test"],
  ] as const) {
    await tx`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values (${id}, ${INSTANCE}, 'authenticated', 'authenticated', ${email}, '',
              now(), now(), now())`;
  }

  const made: Record<string, { workspace: string; product: string; item: string; gap: string }> =
    {};

  for (const [key, user, name, slug] of [
    ["a", USER_A, "Gaps A", "gaps-a"],
    ["b", USER_B, "Gaps B", "gaps-b"],
  ] as const) {
    const [ws] = await tx<
      { id: string }[]
    >`insert into workspace (name) values (${name}) returning id`;
    const workspace = ws!.id;

    await tx`insert into membership (workspace_id, user_id, role, all_products)
             values (${workspace}, ${user}, 'owner', true)`;

    const [product] = await tx<{ id: string }[]>`
      insert into product (workspace_id, name, slug, key_prefix)
      values (${workspace}, ${name}, ${slug}, substring(${slug} from 1 for 3)) returning id`;

    const [item] = await tx<{ id: string }[]>`
      insert into item (workspace_id, product_id, type, title, flow_intent)
      values (${workspace}, ${product!.id}, 'feature', ${`${name} item`}, 'value') returning id`;

    const [gap] = await tx<{ id: string }[]>`
      insert into gap (workspace_id, item_id, check_id, tag, evidence)
      values (${workspace}, ${item!.id}, 'MN-2', 'must',
              ${`${name}: 'nearby' — same venue, or within 100 m?`}) returning id`;

    await tx`
      insert into decision (workspace_id, product_id, item_id, statement, reason, decided_by_user_id)
      values (${workspace}, ${product!.id}, ${item!.id},
              ${`${name}: dropping video for V1`}, 'Capacity', ${user})`;

    made[key] = { workspace, product: product!.id, item: item!.id, gap: gap!.id };
  }

  return made;
}

describe.skipIf(OFFLINE)("RLS — gaps and decisions are workspace-isolated", () => {
  // Deliberately unfiltered selects: if the policy is what holds, then asking
  // for everything must still return only one workspace's rows.
  it("shows a member only their own workspace's gaps", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const rows = await tx<{ evidence: string }[]>`select evidence from gap`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.evidence).toContain("Gaps A");
    });
  });

  it("shows a member only their own workspace's decisions", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_B);

      const rows = await tx<{ statement: string }[]>`select statement from decision`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.statement).toContain("Gaps B");
    });
  });

  it("hides the other workspace's gap even when asked for by id", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const rows = await tx`select id from gap where id = ${made.b!.gap}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("refuses to write a gap into another workspace", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into gap (workspace_id, item_id, check_id, tag, evidence)
          values (${made.b!.workspace}, ${made.b!.item}, 'X-1', 'should', 'crossing tenants')`,
        /row-level security/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("gap — §5's transitions are the point", () => {
  it("moves open → accepted with the accepter stamped", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await tx`
        update gap
           set disposition = 'accepted',
               resolved_by_user_id = ${USER_A},
               resolved_at = now(),
               resolution_note = 'Accepted for V1; revisit at scale.'
         where id = ${made.a!.gap}`;

      const [row] = await tx<{ disposition: string; resolved_by_user_id: string }[]>`
        select disposition, resolved_by_user_id from gap where id = ${made.a!.gap}`;

      expect(row!.disposition).toBe("accepted");
      expect(row!.resolved_by_user_id).toBe(USER_A);
    });
  });

  // §15 records reopens, so the lifecycle is not one-way.
  it("moves accepted → open again, clearing the stamp", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await tx`update gap set disposition = 'accepted', resolved_by_user_id = ${USER_A},
                              resolved_at = now(), resolution_note = 'For now.'
                where id = ${made.a!.gap}`;
      await tx`update gap set disposition = 'open', resolved_by_user_id = null,
                              resolved_at = null, resolution_note = null
                where id = ${made.a!.gap}`;

      const [row] = await tx<{ disposition: string }[]>`
        select disposition from gap where id = ${made.a!.gap}`;
      expect(row!.disposition).toBe("open");
    });
  });

  /**
   * §5: accepted and excluded gaps are "stamped with the accepter's name". The
   * CHECK is what stops an acceptance with nobody's name on it — the exact
   * record §8 needs when it asks who agreed to ship without offline handling.
   */
  it("refuses an accepted gap with no accepter, no time, or no reason", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await rejectsWith(
        tx,
        (sp) => sp`update gap set disposition = 'accepted' where id = ${made.a!.gap}`,
        /gap_resolution_shape/,
      );
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'excluded', resolved_by_user_id = ${USER_A},
                         resolved_at = now(), resolution_note = '   '
           where id = ${made.a!.gap}`,
        /gap_resolution_shape/,
      );
    });
  });

  it("refuses a stamp on a gap that is still open", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set resolved_by_user_id = ${USER_A}, resolved_at = now(),
                         resolution_note = 'accepted without saying so'
           where id = ${made.a!.gap}`,
        /gap_resolution_shape/,
      );
    });
  });

  /**
   * §2: every mutating action writes an activity row. The transition and its
   * ledger entry are asserted together, because a transition nobody recorded is
   * exactly the history §15 says is load-bearing going missing.
   */
  it("records a transition in the ledger", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await tx`update gap set disposition = 'excluded', resolved_by_user_id = ${USER_A},
                              resolved_at = now(), resolution_note = 'Not applicable here.'
                where id = ${made.a!.gap}`;
      await tx`
        insert into activity (workspace_id, product_id, actor_kind, actor_user_id, action,
                              trigger_source, subject_table, subject_id)
        values (${made.a!.workspace}, ${made.a!.product}, 'human', ${USER_A}, 'gap.excluded',
                'user', 'gap', ${made.a!.gap})`;

      const rows = await tx<{ action: string; subject_id: string }[]>`
        select action, subject_id from activity where subject_table = 'gap'`;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ action: "gap.excluded", subject_id: made.a!.gap });
    });
  });
});

describe.skipIf(OFFLINE)("decision — append-only, like the ledger", () => {
  // The trigger, not the policy: this runs as the table owner, which RLS and
  // grants both let through. It is the layer that actually holds.
  it("refuses UPDATE and DELETE to everyone, service role included", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      const [row] = await tx<{ id: string }[]>`select id from decision limit 1`;

      await rejectsWith(
        tx,
        (sp) => sp`update decision set reason = 'rewritten' where id = ${row!.id}`,
        /append-only/i,
      );
      await rejectsWith(tx, (sp) => sp`delete from decision where id = ${row!.id}`, /append-only/i);
    });
  });

  /**
   * §11's revert-as-new-version, applied to decisions: correcting one is
   * logging another that points at it. Without the self-reference, "superseded"
   * would be a claim in prose that nothing could answer.
   */
  it("supersedes by logging a new decision that names the old one", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const [original] = await tx<{ id: string }[]>`select id from decision limit 1`;
      await tx`
        insert into decision (workspace_id, product_id, item_id, statement, reason,
                              decided_by_user_id, supersedes_id)
        values (${made.a!.workspace}, ${made.a!.product}, ${made.a!.item},
                'Video is back in for V1', 'Capacity freed up', ${USER_A}, ${original!.id})`;

      const [row] = await tx<{ statement: string }[]>`
        select statement from decision where supersedes_id = ${original!.id}`;
      expect(row!.statement).toBe("Video is back in for V1");

      // And the superseded one is still there, unchanged. That is the point.
      const still = await tx`select id from decision where id = ${original!.id}`;
      expect(still).toHaveLength(1);
    });
  });

  it("attaches to a product without an item", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await tx`
        insert into decision (workspace_id, product_id, statement, reason, decided_by_user_id)
        values (${made.a!.workspace}, ${made.a!.product},
                'Sprints start Mondays, two weeks', 'Matches the dev team', ${USER_A})`;

      const rows = await tx`select id from decision where item_id is null`;
      expect(rows).toHaveLength(1);
    });
  });

  /**
   * The 0003 lesson, held forward. An append-only table cannot let a parent
   * delete rewrite or remove its rows, so every parent reference is RESTRICT —
   * and the refusal names `decision`, rather than surfacing as an append-only
   * error from a delete the caller aimed at a product.
   */
  it("blocks a product delete legibly, naming itself", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);

      await rejectsWith(
        tx,
        (sp) => sp`delete from product where id = ${made.a!.product}`,
        /decision/i,
      );
    });
  });
});
