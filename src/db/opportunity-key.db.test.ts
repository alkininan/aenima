import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { migrationGate } from "@/test/migration-gate";

/**
 * Opportunity keys, against a real Postgres — `item-key.db.test.ts` one table
 * over, because the whole rule lives in a trigger and a trigger is not
 * observable from TypeScript.
 *
 * `soc-3` is what people say out loud, and it is what makes `/o/<key>` a URL
 * someone can read into a phone. Three properties matter and none can be
 * checked without inserting a row:
 *
 *   1. The counter is per product. Two products number independently.
 *   2. It leaves no gaps and starts at 1.
 *   3. **A key the client supplies is ignored.** The one that would rot
 *      silently: a `DEFAULT` would be overridden by any insert naming the
 *      column, and everything would look right until two opportunities shared a
 *      name.
 *
 * Runs as the service role rather than through RLS: the subject is the trigger,
 * and the isolation boundary is `rls.db.test.ts`'s subject. Every test runs in a
 * transaction that is rolled back.
 *
 * **While this migration is still on a branch these tests skip, and say so.**
 * `migrationGate` is the rule (src/test/migration-gate.ts, T0.26): a migration
 * is applied by a human in a later run than the one that wrote it
 * (docs/guidelines.md §5 step 6), so between those two runs the column this
 * file is about does not exist anywhere. Once the file is on `origin/main` that
 * licence ends and a missing column is a real failure — a database behind the
 * code, not a ticket in flight. Nothing here is conditional on what the trigger
 * *does*: the assertions are the real ones or the file is silent.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

/** Whether `drizzle/0016` has been applied to the database this suite points at. */
async function keyColumnExists(): Promise<boolean> {
  if (!sql) return false;
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'opportunity' and column_name = 'key'
    ) as exists`;
  return rows[0]?.exists === true;
}

const gate = OFFLINE
  ? { skip: false }
  : migrationGate({
      file: "drizzle/0016_opportunity_keys.sql",
      present: await keyColumnExists(),
      subject: "the trigger, the per-product counter and the refusal of a client-supplied key",
    });

if (OFFLINE) {
  // Straight to stderr: vitest hides console.* behind a reporter flag, and an
  // unverified invariant must not be something you opt in to seeing.
  process.stderr.write(
    "\nopportunity-key.db.test.ts skipped: no DATABASE_URL. The key trigger, the\n" +
      "per-product counter and the refusal of a client-supplied key are unverified\n" +
      "in this run.\n\n",
  );
}

afterAll(async () => {
  await sql?.end();
});

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

/** A workspace with two products, so per-product numbering has something to be. */
async function twoProducts(tx: Tx) {
  const [workspace] = await tx<{ id: string }[]>`
    insert into workspace (name) values ('Opportunity keys') returning id`;
  const workspaceId = workspace!.id;

  const products = await tx<{ id: string; key_prefix: string }[]>`
    insert into product (workspace_id, name, slug, key_prefix)
    values (${workspaceId}, 'Sociera', 'sociera', 'soc'),
           (${workspaceId}, 'Aurenza', 'aurenza', 'aur')
    returning id, key_prefix`;

  return {
    workspaceId,
    sociera: products.find((p) => p.key_prefix === "soc")!.id,
    aurenza: products.find((p) => p.key_prefix === "aur")!.id,
  };
}

/** Inserts an opportunity, optionally trying to name it, and returns its key. */
async function addOpportunity(
  tx: Tx,
  workspaceId: string,
  productId: string,
  title: string,
  key?: string,
): Promise<string> {
  const rows =
    key === undefined
      ? await tx<{ key: string }[]>`
          insert into opportunity (workspace_id, product_id, title)
          values (${workspaceId}, ${productId}, ${title})
          returning key`
      : await tx<{ key: string }[]>`
          insert into opportunity (workspace_id, product_id, title, key)
          values (${workspaceId}, ${productId}, ${title}, ${key})
          returning key`;

  return rows[0]!.key;
}

describe.skipIf(OFFLINE || gate.skip)("opportunity keys", () => {
  it("numbers from one, without gaps", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      const keys = [
        await addOpportunity(tx, workspaceId, sociera, "first"),
        await addOpportunity(tx, workspaceId, sociera, "second"),
        await addOpportunity(tx, workspaceId, sociera, "third"),
      ];

      expect(keys).toEqual(["soc-1", "soc-2", "soc-3"]);
    });
  });

  it("counts per product, not per workspace", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera, aurenza } = await twoProducts(tx);

      await addOpportunity(tx, workspaceId, sociera, "s1");
      await addOpportunity(tx, workspaceId, sociera, "s2");
      const first = await addOpportunity(tx, workspaceId, aurenza, "a1");
      const second = await addOpportunity(tx, workspaceId, aurenza, "a2");

      // Aurenza starts at 1 despite two Sociera opportunities already existing.
      expect([first, second]).toEqual(["aur-1", "aur-2"]);
    });
  });

  /**
   * The load-bearing one. `NEW.key` is overwritten unconditionally rather than
   * defaulted, so an insert that names the column is ignored rather than
   * honoured — which is what stops a client from choosing an identifier it
   * could collide with.
   */
  it("ignores a key the client supplies", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      const key = await addOpportunity(tx, workspaceId, sociera, "presumptuous", "zzz-999");

      expect(key).toBe("soc-1");
    });
  });

  // And it does not merely ignore the value — it keeps counting correctly
  // afterwards, which a naive "overwrite only when null" would not.
  it("keeps its own count after an insert tried to name itself", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      await addOpportunity(tx, workspaceId, sociera, "one");
      await addOpportunity(tx, workspaceId, sociera, "two", "soc-999");
      const third = await addOpportunity(tx, workspaceId, sociera, "three");

      expect(third).toBe("soc-3");
    });
  });

  /**
   * The backstop behind the counter, provoked with an UPDATE for the reason
   * `item-key.db.test.ts` gives: the trigger overwrites every INSERT, so a
   * duplicate cannot be inserted even deliberately. What is asserted is that
   * the constraint exists and bites, not the race itself.
   */
  it("refuses two opportunities sharing a key in one workspace", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);
      await addOpportunity(tx, workspaceId, sociera, "first");
      await addOpportunity(tx, workspaceId, sociera, "second");

      await expect(
        tx`update opportunity set key = 'soc-1'
            where title = 'second' and workspace_id = ${workspaceId}`,
      ).rejects.toThrow(/opportunity_workspace_key/);
    });
  });

  /**
   * An item and an opportunity in the same product **can** share a key, and
   * that is the design rather than an oversight: the two counters are
   * independent and the two unique constraints are on different tables, which
   * is what "mirroring `item.key`" asks for. `/i/soc-1` and `/o/soc-1` tell
   * them apart; a person saying "soc-1" does not. Held here so the day someone
   * decides the spoken ambiguity is not worth it, a test says what changed.
   */
  it("numbers independently of item keys in the same product", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      await tx`insert into item (workspace_id, product_id, type, title)
               values (${workspaceId}, ${sociera}, 'feature', 'an item')`;
      const key = await addOpportunity(tx, workspaceId, sociera, "an opportunity");

      expect(key).toBe("soc-1");
    });
  });
});
