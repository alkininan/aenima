/**
 * Database tests read their connection string from .env.local, the same file
 * `pnpm dev` and `pnpm db:migrate` use. Node's own loader does it — no dotenv.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the suite skips loudly rather than failing. See rls.db.test.ts.
}
