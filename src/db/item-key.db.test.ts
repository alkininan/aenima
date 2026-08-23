import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Item keys, against a real Postgres — because the whole rule lives in a
 * trigger, and a trigger is not observable from TypeScript.
 *
 * `soc-12` is what people say out loud, so three properties matter and none of
 * them can be checked without inserting a row:
 *
 *   1. The counter is per product. Two products number independently, so
 *      `aur-1` and `soc-1` coexist.
 *   2. It leaves no gaps and starts at 1.
 *   3. **A key the client supplies is ignored.** This is the one that would
 *      rot silently: a `DEFAULT` would be overridden by any insert that names
 *      the column, and everything would look right until two rows shared a
 *      name. The same discipline `artifact_version.version_no` is under.
 *
 * Runs as the service role rather than through RLS: the subject here is the
 * trigger, and the isolation boundary is `rls.db.test.ts`'s subject. Every test
 * runs in a transaction that is rolled back — the harness is
 * `bootstrap.db.test.ts`'s, in miniature.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

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
    insert into workspace (name) values ('Keys') returning id`;
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

/** Inserts an item, optionally trying to name it, and returns the key it got. */
async function addItem(
  tx: Tx,
  workspaceId: string,
  productId: string,
  title: string,
  key?: string,
): Promise<string> {
  const rows =
    key === undefined
      ? await tx<{ key: string }[]>`
          insert into item (workspace_id, product_id, type, title)
          values (${workspaceId}, ${productId}, 'feature', ${title})
          returning key`
      : await tx<{ key: string }[]>`
          insert into item (workspace_id, product_id, type, title, key)
          values (${workspaceId}, ${productId}, 'feature', ${title}, ${key})
          returning key`;

  return rows[0]!.key;
}

describe.skipIf(OFFLINE)("item keys", () => {
  it("numbers from one, without gaps", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      const keys = [
        await addItem(tx, workspaceId, sociera, "first"),
        await addItem(tx, workspaceId, sociera, "second"),
        await addItem(tx, workspaceId, sociera, "third"),
      ];

      expect(keys).toEqual(["soc-1", "soc-2", "soc-3"]);
    });
  });

  it("counts per product, not per workspace", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera, aurenza } = await twoProducts(tx);

      await addItem(tx, workspaceId, sociera, "s1");
      await addItem(tx, workspaceId, sociera, "s2");
      const first = await addItem(tx, workspaceId, aurenza, "a1");
      const second = await addItem(tx, workspaceId, aurenza, "a2");

      // Aurenza starts at 1 despite two Sociera items already existing.
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

      const key = await addItem(tx, workspaceId, sociera, "presumptuous", "zzz-999");

      expect(key).toBe("soc-1");
    });
  });

  // And it does not merely ignore the value — it keeps counting correctly
  // afterwards, which a naive "overwrite only when null" would not.
  it("keeps its own count after an insert tried to name itself", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);

      await addItem(tx, workspaceId, sociera, "one");
      await addItem(tx, workspaceId, sociera, "two", "soc-999");
      const third = await addItem(tx, workspaceId, sociera, "three");

      expect(third).toBe("soc-3");
    });
  });

  /**
   * The backstop behind the counter. A MAX+1 read can hand the same number to
   * two concurrent inserts, and this constraint is what turns that into a
   * failed insert rather than two items sharing a name.
   *
   * Provoked with an UPDATE, because the trigger makes it unprovokable any
   * other way: every INSERT has its key overwritten, so a duplicate cannot be
   * inserted even deliberately. The race it actually guards is not reproducible
   * inside one transaction, so what is asserted here is that the constraint
   * exists and bites — not the race itself.
   */
  it("refuses two items sharing a key in one workspace", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId, sociera } = await twoProducts(tx);
      await addItem(tx, workspaceId, sociera, "first");
      await addItem(tx, workspaceId, sociera, "second");

      await expect(
        tx`update item set key = 'soc-1'
            where title = 'second' and workspace_id = ${workspaceId}`,
      ).rejects.toThrow(/item_workspace_key/);
    });
  });

  // Prefixes are unique per workspace, which is what keeps item keys unique
  // there too — the reason `key_prefix` is a column rather than three letters
  // sliced off the slug.
  it("refuses two products sharing a key prefix", async () => {
    await rolledBack(async (tx) => {
      const { workspaceId } = await twoProducts(tx);

      await expect(
        tx`insert into product (workspace_id, name, slug, key_prefix)
           values (${workspaceId}, 'Social', 'social', 'soc')`,
      ).rejects.toThrow(/product_workspace_key_prefix/);
    });
  });
});
