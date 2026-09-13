import { defineConfig } from "drizzle-kit";

// drizzle-kit reads `.env.migrate`, never `.env.local`. The two files hold two
// roles: `.env.local`'s DATABASE_URL is the pipeline's role, which can read and
// write rows and cannot change schema, and is the one every script, test and
// dev server uses; `.env.migrate` holds the admin URL, exists only in the
// primary checkout, and is not carried into worktrees (`.worktreeinclude`). A
// run in a worktree has no admin URL on any path it reads, so `pnpm db:migrate`
// there has nothing to connect with — docs/guidelines.md §5. Node's own loader
// does the job, so no dotenv dependency is needed; generate works without the
// file, migrate needs it.
try {
  process.loadEnvFile(".env.migrate");
} catch {
  // No .env.migrate — fine for `generate`, which only diffs the schema files.
}

/**
 * Drizzle against the Supabase Postgres.
 *
 * `DATABASE_URL` here is `.env.migrate`'s and must be a **session-mode** or
 * direct connection (port 5432). The transaction pooler on 6543 cannot run the
 * DDL that push and migrate issue. Supabase Dashboard → Connect → "Session
 * pooler" is the string to use.
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
