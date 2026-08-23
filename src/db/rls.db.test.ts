import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The two invariants CLAUDE.md calls non-negotiable, proved against a real
 * Postgres rather than asserted in TypeScript:
 *
 *   1. A member of workspace A cannot read workspace B's rows.
 *   2. `artifact_version` and `activity` refuse UPDATE and DELETE — to
 *      *everyone*, including the RLS-bypassing service role.
 *
 * Users are impersonated the way PostgREST does it: `set local role
 * authenticated` plus a `request.jwt.claims` carrying the subject. That is what
 * `auth.uid()` reads, so the policies run exactly as they do in production —
 * no mocks, no second code path.
 *
 * Every test runs inside a transaction that is rolled back, so the suite leaves
 * no residue and can run against any environment that has the schema.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

if (OFFLINE) {
  // Written straight to stderr: vitest intercepts console.* and hides it behind
  // a reporter flag, and a security boundary going unverified must not be
  // something you have to opt in to seeing.
  process.stderr.write(
    [
      "",
      "\u001b[33m  ============================================================\u001b[0m",
      "\u001b[33m  SKIPPED: database tests did not run.\u001b[0m",
      "",
      "  DATABASE_URL is not set, so RLS product isolation and the",
      "  append-only guarantee were NOT verified by this run. These",
      "  cover a security boundary \u2014 a green suite is not proof that",
      "  it holds.",
      "",
      "  To run them: copy .env.example to .env.local, set DATABASE_URL",
      "  to the session-mode connection string (port 5432), then rerun",
      "  pnpm test.",
      "\u001b[33m  ============================================================\u001b[0m",
      "",
      "",
    ].join("\n"),
  );
}

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

const USER_A = "aaaaaaaa-1111-4000-8000-00000000000a";
const USER_B = "bbbbbbbb-1111-4000-8000-00000000000b";
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
 * Asserts one statement is rejected with `pattern`, wrapped in a savepoint.
 *
 * Postgres aborts the entire transaction on the first error, so a second
 * expected-failure assertion in the same test would otherwise see only
 * "current transaction is aborted" and never the constraint's own message.
 * The savepoint is rolled back, leaving the surrounding transaction usable.
 */
async function rejectsWith(tx: Tx, statement: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => statement(sp as Tx))).rejects.toThrow(pattern);
}

/** Two workspaces, one per user, each with a product, item and version. */
async function seedTwoWorkspaces(tx: Tx) {
  for (const [id, email] of [
    [USER_A, "rls-a@example.test"],
    [USER_B, "rls-b@example.test"],
  ] as const) {
    await tx`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values (${id}, ${INSTANCE}, 'authenticated', 'authenticated', ${email}, '',
              now(), now(), now())`;
  }

  const made: Record<string, { workspace: string; product: string; version: string }> = {};

  for (const [key, user, name, slug] of [
    ["a", USER_A, "Workspace A", "alpha"],
    ["b", USER_B, "Workspace B", "beta"],
  ] as const) {
    const [ws] = await tx<{ id: string }[]>`
      insert into workspace (name) values (${name}) returning id`;
    const workspaceId = ws!.id;

    await tx`insert into membership (workspace_id, user_id, role, all_products)
             values (${workspaceId}, ${user}, 'owner', true)`;

    const [product] = await tx<{ id: string }[]>`
      insert into product (workspace_id, name, slug, key_prefix)
      values (${workspaceId}, ${name}, ${slug}, substring(${slug} from 1 for 3)) returning id`;

    const [item] = await tx<{ id: string }[]>`
      insert into item (workspace_id, product_id, type, title)
      values (${workspaceId}, ${product!.id}, 'feature', ${`${name} item`}) returning id`;

    const [artifact] = await tx<{ id: string }[]>`
      insert into artifact (workspace_id, item_id, kind)
      values (${workspaceId}, ${item!.id}, 'prd') returning id`;

    const [version] = await tx<{ id: string }[]>`
      insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                    content_hash, authored_by_kind, authored_by_user_id)
      values (${workspaceId}, ${artifact!.id}, 1, ${tx.json({ body: name })}, ${`hash-${key}`},
              'human', ${user}) returning id`;

    made[key] = { workspace: workspaceId, product: product!.id, version: version!.id };
  }

  return made;
}

/** Becomes `user` for the rest of the transaction, exactly as PostgREST does. */
async function actAs(tx: Tx, user: string) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

describe.skipIf(OFFLINE)("RLS — product isolation is a security boundary", () => {
  it("shows a member only their own workspace", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const rows = await tx<{ name: string }[]>`select name from workspace`;
      expect(rows.map((r) => r.name)).toEqual(["Workspace A"]);
    });
  });

  it("hides the other workspace's products, items and versions", async () => {
    await rolledBack(async (tx) => {
      await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const [counts] = await tx<{ products: string; items: string; versions: string }[]>`
        select (select count(*) from product)          as products,
               (select count(*) from item)             as items,
               (select count(*) from artifact_version) as versions`;

      expect(Number(counts!.products)).toBe(1);
      expect(Number(counts!.items)).toBe(1);
      expect(Number(counts!.versions)).toBe(1);
    });
  });

  // The one that matters: naming B's row explicitly still returns nothing.
  it("returns nothing when A asks for B's rows by id", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      const rows = await tx`select id from workspace where id = ${made.b!.workspace}`;
      expect(rows).toHaveLength(0);

      const versions = await tx`
        select id from artifact_version where id = ${made.b!.version}`;
      expect(versions).toHaveLength(0);
    });
  });

  it("refuses to let A write into B's workspace", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await actAs(tx, USER_A);

      await expect(
        tx`insert into product (workspace_id, name, slug, key_prefix)
           values (${made.b!.workspace}, 'Trespass', 'trespass', 'tre')`,
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("sees both workspaces again once RLS is not in play", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      // No impersonation: the migration role bypasses RLS, which is exactly why
      // the isolation above is worth proving rather than assuming.
      //
      // Scoped to the two ids this test created. Asserting on the whole table
      // would make the result depend on whatever else the database holds —
      // `pnpm db:seed` alone would turn this red.
      const rows = await tx<{ name: string }[]>`
        select name from workspace
         where id in (${made.a!.workspace}, ${made.b!.workspace})
         order by name`;
      expect(rows.map((r) => r.name)).toEqual(["Workspace A", "Workspace B"]);
    });
  });
});

describe.skipIf(OFFLINE)("append-only — artifact_version", () => {
  it("refuses UPDATE even to the RLS-bypassing role", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await expect(
        tx`update artifact_version set content = ${tx.json({ tampered: true })}
            where id = ${made.a!.version}`,
      ).rejects.toThrow(/append-only/i);
    });
  });

  it("refuses DELETE even to the RLS-bypassing role", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await expect(tx`delete from artifact_version where id = ${made.a!.version}`).rejects.toThrow(
        /append-only/i,
      );
    });
  });

  // Deleting the parent must not launder the guard through a cascade.
  it("refuses to let a parent delete cascade the versions away", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      await expect(tx`delete from workspace where id = ${made.a!.workspace}`).rejects.toThrow(
        /violates foreign key constraint/i,
      );
    });
  });

  it("assigns version numbers itself, ignoring what the client asks for", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const [artifact] = await tx<{ id: string; workspace_id: string }[]>`
        select a.id, a.workspace_id from artifact a
         where a.workspace_id = ${made.a!.workspace} limit 1`;

      // Ask for 999 twice; the trigger should hand back 2 then 3.
      const [second] = await tx<{ version_no: number }[]>`
        insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                      content_hash, authored_by_kind, authored_by_agent)
        values (${artifact!.workspace_id}, ${artifact!.id}, 999, ${tx.json({ v: 2 })}, 'h2',
                'agent', 'claude-opus-5')
        returning version_no`;
      const [third] = await tx<{ version_no: number }[]>`
        insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                      content_hash, authored_by_kind, authored_by_agent)
        values (${artifact!.workspace_id}, ${artifact!.id}, 999, ${tx.json({ v: 3 })}, 'h3',
                'agent', 'claude-opus-5')
        returning version_no`;

      expect(second!.version_no).toBe(2);
      expect(third!.version_no).toBe(3);
    });
  });

  // §2: the agent is a first-class actor, not a null user_id.
  it("requires exactly one actor identity, matching the actor kind", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const [artifact] = await tx<{ id: string; workspace_id: string }[]>`
        select a.id, a.workspace_id from artifact a
         where a.workspace_id = ${made.a!.workspace} limit 1`;

      // 'agent' with no agent named, and no human either.
      await rejectsWith(
        tx,
        (sp) => sp`insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                                 content_hash, authored_by_kind)
                   values (${artifact!.workspace_id}, ${artifact!.id}, 1, ${sp.json({})}, 'h', 'agent')`,
        /actor_shape/i,
      );

      // 'human' wearing an agent's name.
      await rejectsWith(
        tx,
        (sp) => sp`insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                                 content_hash, authored_by_kind, authored_by_agent)
                   values (${artifact!.workspace_id}, ${artifact!.id}, 1, ${sp.json({})}, 'h', 'human', 'claude')`,
        /actor_shape/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("append-only — activity", () => {
  it("refuses UPDATE and DELETE on the ledger", async () => {
    await rolledBack(async (tx) => {
      const made = await seedTwoWorkspaces(tx);
      const [row] = await tx<{ id: string }[]>`
        insert into activity (workspace_id, actor_kind, actor_user_id, action,
                              trigger_source, subject_table, subject_id)
        values (${made.a!.workspace}, 'human', ${USER_A}, 'item.created', 'user',
                'item', ${made.a!.product})
        returning id`;

      await rejectsWith(
        tx,
        (sp) => sp`update activity set action = 'rewritten' where id = ${row!.id}`,
        /append-only/i,
      );
      await rejectsWith(tx, (sp) => sp`delete from activity where id = ${row!.id}`, /append-only/i);
    });
  });
});

describe.skipIf(OFFLINE)("there is no status column anywhere", () => {
  it("has none, in any table", async () => {
    if (!sql) return;
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name
        from information_schema.columns
       where table_schema = 'public' and column_name in ('status', 'stage', 'state')`;
    expect(rows).toEqual([]);
  });
});
