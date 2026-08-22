import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local on its own. Node's own loader does the
// job, so no dotenv dependency is needed; generate works without it, push and
// migrate need DATABASE_URL to be there.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine for `generate`, which only diffs the schema files.
}

/**
 * Drizzle against the Supabase Postgres.
 *
 * `DATABASE_URL` must be a **session-mode** or direct connection (port 5432).
 * The transaction pooler on 6543 cannot run the DDL that push and migrate
 * issue. Supabase Dashboard → Connect → "Session pooler" is the string to use.
 *
 * `auth` is in `schemaFilter`'s exclusion by omission: we reference
 * `auth.users` by id but never own or migrate it.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
