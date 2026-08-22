/**
 * product-spec.md §12: identity is passwordless — email code, Google, Apple.
 *
 * Only email ships in T0.4. Google and Apple are declared but disabled, so the
 * seam exists without a dead button anywhere: the sign-in screen renders one
 * control per *enabled* provider, and today that is exactly one. Turning either
 * on is a single `false → true` here plus its handler; nothing else moves.
 */
export const AUTH_PROVIDERS = {
  email: { enabled: true },
  /** Deferred: needs a Google Cloud OAuth client. */
  google: { enabled: false },
  /** Deferred: needs a paid Apple developer account. */
  apple: { enabled: false },
} as const satisfies Record<string, { enabled: boolean }>;

export type AuthProvider = keyof typeof AUTH_PROVIDERS;

export function enabledProviders(): AuthProvider[] {
  return (Object.keys(AUTH_PROVIDERS) as AuthProvider[]).filter(
    (provider) => AUTH_PROVIDERS[provider].enabled,
  );
}

export function isProviderEnabled(provider: AuthProvider): boolean {
  return AUTH_PROVIDERS[provider].enabled;
}
