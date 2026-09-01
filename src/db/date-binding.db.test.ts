import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * A `Date` bound into a raw `sql` template, against a real Postgres — the
 * defect that broke §5's outage queue and §15's meter, and the shape of test
 * that would have caught it.
 *
 * **`drizzle(sql, { schema })` mutates the client it is handed.** It replaces
 * the type handlers on the postgres.js instance, so postgres.js's own `Date`
 * serializer stops running on raw tagged templates from that client and a
 * `Date` reaches the wire encoder unconverted:
 * `TypeError: The "string" argument must be of type string … Received an
 * instance of Date`. Drizzle's own query builder is unaffected — it converts
 * before it gets there — so this only bites the handful of `src/db/queries/*`
 * functions that use the raw `sql` from `sharedDbClient()`.
 *
 * **Why the existing db tests missed it.** They inject a transaction handle
 * taken straight from `postgres(...)`, never passed through `drizzle()`, so the
 * mutation that causes this is absent from the fixture. The client under test
 * here is built exactly the way `sharedDbClient()` builds it, which is the
 * whole point of the file: the bug lives in the wiring, not in the SQL.
 *
 * Both calls use ids that match nothing, so this writes no row and needs no
 * fixture — the failure is in binding the parameters, which happens either way.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

if (OFFLINE) {
  console.error("\n  date-binding.db.test: skipped — no DATABASE_URL.\n");
}

const client = OFFLINE
  ? null
  : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

// The mutation under test. `sharedDbClient()` does exactly this, and the raw
// `sql` the queries use is this same instance afterwards.
if (client) drizzle(client, {});

vi.mock("@/db/client", () => ({
  sharedDbClient: () => ({ db: null, sql: client }),
  createDbClient: () => ({ db: null, sql: client }),
  closeSharedDbClient: async () => {},
}));

const NOWHERE = "00000000-0000-0000-0000-000000000000";

afterAll(async () => {
  await client?.end();
});

describe.skipIf(OFFLINE)("a Date through a drizzle-wrapped client", () => {
  it("throws when bound raw — the mechanism, so nobody simplifies the fix away", async () => {
    // This is the assertion that explains the `.toISOString()` calls in
    // `scheduleRetry` and `listUsage`. If this ever stops throwing, drizzle
    // stopped mutating the client and those conversions become optional —
    // until then they are load-bearing and must not be tidied out.
    await expect(client!`select 1 where now() >= ${new Date()}`).rejects.toThrow(
      /must be of type string/,
    );
  });

  it("works when the query converts first", async () => {
    await expect(
      client!`select 1 where now() >= ${new Date().toISOString()}`,
    ).resolves.toBeDefined();
  });
});

describe.skipIf(OFFLINE)("the queries that bind a timestamp", () => {
  it("queues a retry — §5's outage path, which threw before this was fixed", async () => {
    const { scheduleRetry } = await import("./queries/scoring");

    // A provider outage is the only thing that reaches this line in production,
    // which is why it shipped broken: nothing else calls it.
    await expect(scheduleRetry(NOWHERE, NOWHERE, new Date())).resolves.toBeUndefined();
  });

  it("reads the usage meter over a window — §15's spend view", async () => {
    const { listUsage } = await import("./queries/ai-usage");

    await expect(listUsage(NOWHERE, new Date(Date.now() - 7 * 86_400_000))).resolves.toEqual([]);
  });
});
