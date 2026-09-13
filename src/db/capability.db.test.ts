import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * TC4 → AC4 (T0.10). The credential every script, test and run is handed cannot change
 * schema — by capability, not by the guard's parsing. `DATABASE_URL` in `.env.local` is
 * `aenima_pipeline`, which starts every connection as `service_role`: DML on every row,
 * RLS bypassed as the app's direct connection always has, and no CREATE anywhere in `public`,
 * no ownership, no reach into the `drizzle` schema where the migration ledger lives.
 * docs/guidelines.md §5, the capability boundary.
 *
 * Every statement here runs inside a transaction that is rolled back, so a statement that
 * unexpectedly succeeded would still leave nothing behind — and the test would say so.
 * `42501` is Postgres's insufficient_privilege.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

type Tx = postgres.TransactionSql;

/** Runs `body` in a transaction that always rolls back; returns the error it threw, if any. */
async function refusal(body: (tx: Tx) => Promise<unknown>): Promise<{ code?: string } | null> {
  const sentinel = new Error("rollback");
  let caught: { code?: string } | null = null;
  try {
    await sql!.begin(async (tx) => {
      try {
        await body(tx);
      } catch (error) {
        caught = error as { code?: string };
      }
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  return caught;
}

describe.skipIf(OFFLINE)("the pipeline's credential", () => {
  it("logs in as aenima_pipeline and runs as service_role", async () => {
    const [who] = await sql!`select session_user, current_user`;
    expect(who).toEqual({ session_user: "aenima_pipeline", current_user: "service_role" });
  });

  it("reads and writes rows past RLS, which is what the direct connection is for", async () => {
    const refused = await refusal(async (tx) => {
      const [ws] = await tx<{ id: string }[]>`
        insert into workspace (name) values ('Capability') returning id`;
      const [seen] = await tx<{ n: number }[]>`
        select count(*)::int as n from workspace where id = ${ws!.id}`;
      expect(seen!.n).toBe(1);
    });
    expect(refused).toBeNull();
  });

  it("cannot create a table in public", async () => {
    const refused = await refusal((tx) => tx`create table public.t0_10_probe (id int)`);
    expect(refused?.code).toBe("42501");
  });

  it("cannot alter a table it does not own", async () => {
    const refused = await refusal((tx) => tx`alter table workspace add column t0_10_probe int`);
    expect(refused?.code).toBe("42501");
  });

  it("cannot add a policy, which only an owner may", async () => {
    const refused = await refusal(
      (tx) => tx`create policy t0_10_probe on workspace for select to anon using (true)`,
    );
    expect(refused?.code).toBe("42501");
  });

  it("cannot create a schema", async () => {
    const refused = await refusal((tx) => tx`create schema t0_10_probe`);
    expect(refused?.code).toBe("42501");
  });

  it("cannot reach the migration ledger, so drizzle-kit migrate has nowhere to start", async () => {
    const refused = await refusal((tx) => tx`select count(*) from drizzle.__drizzle_migrations`);
    expect(refused?.code).toBe("42501");
  });

  // The two statements drizzle-orm's migrator issues before it reads the ledger
  // (node_modules/drizzle-orm/pg-core/dialect.js, migrate). `pnpm db:migrate` with this
  // credential dies on the first of them; drizzle-kit's renderer swallows the message.
  it("is refused on the migrator's first statement, create schema if not exists", async () => {
    const refused = await refusal((tx) => tx`create schema if not exists drizzle`);
    expect(refused?.code).toBe("42501");
  });

  it("is refused on the migrator's second, create table if not exists in that schema", async () => {
    const refused = await refusal(
      (tx) => tx`create table if not exists drizzle.__drizzle_migrations (id serial primary key)`,
    );
    expect(refused?.code).toBe("42501");
  });

  it("cannot become postgres", async () => {
    const refused = await refusal((tx) => tx`set local role postgres`);
    expect(refused?.code).toBe("42501");
  });
});
