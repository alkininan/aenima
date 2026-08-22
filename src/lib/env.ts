/**
 * Browser-safe environment access.
 *
 * Both values here are public by design — they are the pair `@supabase/ssr`
 * needs on the client. Secrets live in `env.server.ts`, which imports
 * `server-only`, so this module can be pulled into a client component without
 * dragging a service-role accessor into the bundle with it.
 */

export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
};
