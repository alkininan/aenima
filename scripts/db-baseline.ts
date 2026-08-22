/**
 * Records already-applied migrations in `drizzle.__drizzle_migrations` without
 * re-running them.
 *
 * This project's schema was first applied by hand, so Drizzle had no record of
 * it and `drizzle-kit migrate` would have tried to replay 0000 and 0001 against
 * objects that already exist. Baselining writes the ledger Drizzle would have
 * written, so `migrate` becomes a no-op on an already-current database and
 * applies only genuinely new migrations from here on.
 *
 * Idempotent, and safe to point at any environment that is already current —
 * staging and production need exactly this treatment once each.
 *
 * The table shape, the hash (sha256 of the raw file) and the `created_at`
 * (the journal's `when`) mirror drizzle-orm's own migrator; see
 * node_modules/drizzle-orm/pg-core/dialect.js → `migrate()`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

const FOLDER = "drizzle";

/** A table every migration in this project creates, used as the proof-of-applied check. */
const SENTINEL_TABLE = "workspace";

type JournalEntry = { idx: number; when: number; tag: string };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("baseline: DATABASE_URL is not set. Copy .env.example to .env.local.");
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(join(FOLDER, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };

  const migrations = journal.entries.map((entry) => ({
    tag: entry.tag,
    when: entry.when,
    hash: createHash("sha256")
      .update(readFileSync(join(FOLDER, `${entry.tag}.sql`), "utf8"))
      .digest("hex"),
  }));

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  try {
    // Refuse to baseline a database the migrations were never applied to.
    // Marking them applied there would skip them forever and leave it empty.
    const [present] = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
         where table_schema = 'public' and table_name = ${SENTINEL_TABLE}
      ) as exists`;

    if (!present?.exists) {
      console.error(
        `baseline: public.${SENTINEL_TABLE} does not exist, so these migrations have\n` +
          "not actually been applied here. Run `pnpm db:migrate` instead — baselining\n" +
          "an empty database would mark them done and never apply them.",
      );
      process.exit(1);
    }

    // Same DDL drizzle-orm's migrator issues, so it adopts this table as its own.
    await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
    await sql`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`;

    const existing = await sql<{ hash: string }[]>`
      select hash from "drizzle"."__drizzle_migrations"`;
    const recorded = new Set(existing.map((row) => row.hash));

    let written = 0;
    for (const migration of migrations) {
      if (recorded.has(migration.hash)) {
        console.log(`baseline: ${migration.tag} already recorded.`);
        continue;
      }
      await sql`
        insert into "drizzle"."__drizzle_migrations" ("hash", "created_at")
        values (${migration.hash}, ${migration.when})`;
      console.log(`baseline: recorded ${migration.tag} (${migration.hash.slice(0, 12)}…).`);
      written += 1;
    }

    console.log(
      written === 0
        ? "baseline: nothing to do — every migration was already recorded."
        : `baseline: recorded ${written} migration(s) as already applied.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("baseline failed:", error);
  process.exit(1);
});
