import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Deleting an auth user, against a real Postgres.
 *
 * `activity.actor_user_id` and `artifact_version.authored_by_user_id` used to
 * reference `auth.users` with `ON DELETE SET NULL`. Nulling is an UPDATE, and
 * both tables refuse UPDATE, so the delete failed and no user who had ever
 * acted could be removed — which every user has, since first-run bootstrap
 * writes an activity row. `NO ACTION` and `RESTRICT` only trade that for a
 * foreign-key error; the constraint had to go.
 *
 * The requirement these tests hold to is "user deletable, ledger immutable":
 * the account can be erased, and not one ledger row moves. The actor id stays
 * behind as a recorded fact — product law 6, "who accepted this gap" stays
 * answerable.
 *
 * Same harness as rls.db.test.ts, which sets it out at length: PostgREST-style
 * impersonation where it matters, and a transaction rolled back at the end so
 * the suite leaves no residue.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

const USER = "eeeeeeee-1111-4000-8000-00000000000e";
const INSTANCE = "00000000-0000-0000-0000-000000000000";

type Tx = postgres.TransactionSql;

/** Runs `fn` in a transaction and always rolls it back. */
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

/**
 * A user who has left a mark on both append-only tables and on both mutable
 * ones — the four ways a row can point at `auth.users`.
 */
async function userWhoHasActed(tx: Tx) {
  await tx`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (${USER}, ${INSTANCE}, 'authenticated', 'authenticated',
            'deletion@example.test', '', now(), now(), now())`;

  const [ws] = await tx<{ id: string }[]>`
    insert into workspace (name) values ('Deletion') returning id`;
  const workspace = ws!.id;

  await tx`insert into membership (workspace_id, user_id, role, all_products)
           values (${workspace}, ${USER}, 'owner', true)`;

  const [product] = await tx<{ id: string }[]>`
    insert into product (workspace_id, name, slug, decider_user_id)
    values (${workspace}, 'Deletion', 'deletion', ${USER}) returning id`;

  const [item] = await tx<{ id: string }[]>`
    insert into item (workspace_id, product_id, type, title)
    values (${workspace}, ${product!.id}, 'feature', 'Item') returning id`;

  const [artifact] = await tx<{ id: string }[]>`
    insert into artifact (workspace_id, item_id, kind)
    values (${workspace}, ${item!.id}, 'prd') returning id`;

  const [version] = await tx<{ id: string }[]>`
    insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                  content_hash, authored_by_kind, authored_by_user_id)
    values (${workspace}, ${artifact!.id}, 1, ${tx.json({ body: "v1" })}, 'hash-del',
            'human', ${USER}) returning id`;

  const [event] = await tx<{ id: string }[]>`
    insert into activity (workspace_id, actor_kind, actor_user_id, action,
                          trigger_source, subject_table, subject_id)
    values (${workspace}, 'human', ${USER}, 'workspace.created', 'user', 'workspace',
            ${workspace}) returning id`;

  return { workspace, product: product!.id, version: version!.id, event: event!.id };
}

describe.skipIf(OFFLINE)("deleting an auth user", () => {
  it("succeeds even though the user has written to both append-only tables", async () => {
    await rolledBack(async (tx) => {
      await userWhoHasActed(tx);

      // The whole bug in one statement: this used to raise
      // "activity is append-only: UPDATE is not permitted".
      await expect(tx`delete from auth.users where id = ${USER}`).resolves.toBeDefined();

      const left = await tx<{ n: number }[]>`
        select count(*)::int as n from auth.users where id = ${USER}`;
      expect(left[0]!.n).toBe(0);
    });
  });

  it("leaves the ledger rows in place with their actor ids intact", async () => {
    await rolledBack(async (tx) => {
      const seeded = await userWhoHasActed(tx);

      await tx`delete from auth.users where id = ${USER}`;

      const events = await tx<{ id: string; actor_user_id: string; action: string }[]>`
        select id, actor_user_id, action from activity where workspace_id = ${seeded.workspace}`;
      const versions = await tx<{ id: string; authored_by_user_id: string }[]>`
        select id, authored_by_user_id from artifact_version
         where workspace_id = ${seeded.workspace}`;

      // Still one row each, still the same rows, still naming the same actor.
      // A ledger a parent delete can rewrite is not a ledger.
      expect(events).toEqual([
        { id: seeded.event, actor_user_id: USER, action: "workspace.created" },
      ]);
      expect(versions).toEqual([{ id: seeded.version, authored_by_user_id: USER }]);
    });
  });

  // The mutable tables are supposed to react, and this is what tells the two
  // halves apart: append-only rows are frozen, everything else cleans up.
  it("still cascades the membership and nulls the decider", async () => {
    await rolledBack(async (tx) => {
      const seeded = await userWhoHasActed(tx);

      await tx`delete from auth.users where id = ${USER}`;

      const members = await tx<{ n: number }[]>`
        select count(*)::int as n from membership where workspace_id = ${seeded.workspace}`;
      const [product] = await tx<{ decider_user_id: string | null }[]>`
        select decider_user_id from product where id = ${seeded.product}`;

      expect(members[0]!.n).toBe(0);
      expect(product!.decider_user_id).toBeNull();
    });
  });

  /**
   * The regression guard. Re-adding either constraint in any parent-blocking
   * form — SET NULL, NO ACTION, RESTRICT, CASCADE — breaks user deletion again,
   * and the three tests above would only catch it against a live database. This
   * one names the cause rather than the symptom.
   */
  it("keeps the append-only tables free of foreign keys into auth.users", async () => {
    if (!sql) throw new Error("no database");

    const constraints = await sql<{ table_name: string; constraint_name: string }[]>`
      select c.relname as table_name, con.conname as constraint_name
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_class f on f.oid = con.confrelid
        join pg_namespace fn on fn.oid = f.relnamespace
       where con.contype = 'f'
         and c.relname in ('activity', 'artifact_version')
         and fn.nspname = 'auth'`;

    expect(constraints).toEqual([]);
  });
});
