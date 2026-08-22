/**
 * Email one-time codes — product-spec.md §12: "passwordless (6-digit codes,
 * ~10-minute expiry, rate-limited, no account enumeration)."
 *
 * Supabase issues, stores and expires the code itself; the expiry below is the
 * project setting restated so the UI can describe it honestly and so a drift
 * between the two is a failing test rather than a surprise.
 *
 * Nothing here reveals whether an account exists. That is not a UI nicety —
 * a form that answers "no such account" is an account-enumeration oracle, so
 * the *result type* has no branch for it.
 */

/** §12: six digits. */
export const OTP_LENGTH = 6;

/** §12: "~10-minute expiry". Must match Auth → Email → OTP Expiration. */
export const OTP_EXPIRY_SECONDS = 600;

/** Digits only — no whitespace, no letters, no partial codes. */
const OTP_PATTERN = /^\d{6}$/;

/**
 * Deliberately permissive: this rejects obvious typos so we do not burn a
 * request, and leaves real deliverability to the mail server. An over-strict
 * regex rejects valid addresses, which is a worse failure than a wasted send.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

/** Strips the spaces and dashes people paste in from a mail client. */
export function normalizeOtp(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function isValidOtp(raw: string): boolean {
  return OTP_PATTERN.test(normalizeOtp(raw));
}

/**
 * What a sign-in attempt can come back as.
 *
 * `sent` is returned whether or not an account exists — same shape, same
 * timing path, same copy. There is no `unknown-account` member and there must
 * never be one.
 */
export type RequestCodeResult =
  | { status: "sent" }
  | { status: "invalid-email" }
  | { status: "rate-limited" }
  | { status: "unavailable" };

export type VerifyCodeResult =
  | { status: "verified" }
  | { status: "invalid-code" }
  | { status: "expired" }
  | { status: "rate-limited" }
  | { status: "unavailable" };

/**
 * Maps a Supabase auth error onto the results above.
 *
 * Anything unrecognised becomes `unavailable` rather than being passed through:
 * provider error strings leak whether an address is known, which is the exact
 * thing §12 forbids.
 */
export function classifyAuthError(
  error: { status?: number | undefined; code?: string | undefined; message?: string } | null,
): "rate-limited" | "invalid-code" | "expired" | "unavailable" | null {
  if (!error) return null;

  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "rate-limited";
  }
  if (error.code === "otp_expired") return "expired";
  if (error.code === "otp_disabled" || error.code === "invalid_credentials") {
    return "invalid-code";
  }

  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("expired")) return "expired";
  if (message.includes("rate limit")) return "rate-limited";
  if (message.includes("invalid") || message.includes("token")) return "invalid-code";

  return "unavailable";
}
