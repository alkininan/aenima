import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * First-run bootstrap, against a real Postgres.
 *
 * `public.bootstrap_workspace` is the only sanctioned way a user with no
 * membership gets a workspace — no INSERT policy on `workspace` can be
 * satisfied without one, and the request path holds no service-role key. Its
 * contract is therefore worth proving rather than assuming:
 *
 *   1. It returns the workspace row. The caller used to re-read `workspace`
 *      for it, which Next's fetch memoization answered from a pre-write
 *      response — see src/db/queries/workspace.test.ts.
 *   2. It is idempotent. Concurrent render passes all reach it, and settling
 *      on one workspace is what lets every caller succeed.
 *   3. It still refuses to mint a second workspace, which is the property the
 *      old `RAISE` was protecting.
 *
 * Users are impersonated the way PostgREST does it, and every test runs inside
 * a transaction that is rolled back — see rls.db.test.ts, which sets out the
 * same harness at length.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

const USER = "cccccccc-1111-4000-8000-00000000000c";
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

/** A signed-in human who has never had a workspace. */
async function freshUser(tx: Tx) {
  await tx`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (${USER}, ${INSTANCE}, 'authenticated', 'authenticated',
            'bootstrap@example.test', '', now(), now(), now())`;
}

/** Becomes `user` for the rest of the transaction, exactly as PostgREST does. */
async function actAs(tx: Tx, user: string) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

type WorkspaceRow = { id: string; name: string; timezone: string; locale: string };

const bootstrap = (tx: Tx, name: string) =>
  tx<WorkspaceRow[]>`select id, name, timezone, locale from public.bootstrap_workspace(${name})`;

describe.skipIf(OFFLINE)("bootstrap_workspace", () => {
  it("returns the workspace it created, not just an id", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      await actAs(tx, USER);

      const rows = await bootstrap(tx, "Acme");

      // The whole point of the fix: everything the caller needs arrives on the
      // write, so it never has to read back for it.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "Acme", timezone: "UTC", locale: "en" });
      expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it("makes the caller an Owner who can see every product", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      await actAs(tx, USER);

      const [workspace] = await bootstrap(tx, "Acme");

      const members = await tx<{ role: string; all_products: boolean }[]>`
        select role, all_products from membership
         where workspace_id = ${workspace!.id} and user_id = ${USER}`;

      expect(members).toEqual([{ role: "owner", all_products: true }]);
    });
  });

  // §2: every mutating action writes an activity row.
  it("records the creation in the ledger", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      await actAs(tx, USER);

      const [workspace] = await bootstrap(tx, "Acme");

      const rows = await tx<{ action: string; actor_kind: string; actor_user_id: string }[]>`
        select action, actor_kind, actor_user_id from activity
         where workspace_id = ${workspace!.id}`;

      expect(rows).toEqual([
        { action: "workspace.created", actor_kind: "human", actor_user_id: USER },
      ]);
    });
  });

  /**
   * The regression the incident actually produced. Three render passes reached
   * this function inside 30ms; the old version let one through and raised
   * `unique_violation` at the other two, which surfaced as "Could not create
   * workspace: caller already belongs to a workspace".
   */
  it("hands the same workspace back on a second call instead of raising", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      await actAs(tx, USER);

      const [first] = await bootstrap(tx, "Acme");
      const [second] = await bootstrap(tx, "Ignored");

      expect(second!.id).toBe(first!.id);
      // The name from the second call is ignored — the workspace already has
      // one, and a bootstrap is not a rename.
      expect(second!.name).toBe("Acme");
    });
  });

  it("never mints a second workspace for the same user", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      await actAs(tx, USER);

      await bootstrap(tx, "Acme");
      await bootstrap(tx, "Second");
      await bootstrap(tx, "Third");

      const [counts] = await tx<{ workspaces: string; memberships: string; events: string }[]>`
        select (select count(*) from membership where user_id = ${USER}) as memberships,
               (select count(*) from workspace) as workspaces,
               (select count(*) from activity where actor_user_id = ${USER}) as events`;

      expect(counts!.memberships).toBe("1");
      expect(counts!.workspaces).toBe("1");
      // A call that creates nothing writes no activity row either.
      expect(counts!.events).toBe("1");
    });
  });

  it("refuses a caller with no identity", async () => {
    await rolledBack(async (tx) => {
      await freshUser(tx);
      // No actAs: `auth.uid()` is null, exactly as for an anonymous request.

      await expect(bootstrap(tx, "Acme")).rejects.toThrow(/requires an authenticated caller/);
    });
  });
});
