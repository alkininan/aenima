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

/**
 * §12: "~10-minute expiry". Must match Auth → Email → OTP Expiration.
 *
 * This is also the only thing that can tell a wrong code from a stale one —
 * see `hasCodeExpired`.
 */
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
  /** Never left this machine — not six digits, or not an address. */
  | { status: "malformed" }
  /**
   * The provider refused the code and would not say why. Wrong and expired
   * arrive here as the same answer; `hasCodeExpired` is what separates them.
   */
  | { status: "code-rejected" }
  | { status: "rate-limited" }
  | { status: "unavailable" };

/**
 * Was the code stale, or just wrong?
 *
 * Supabase will not say. A wrong code and an expired one both come back as
 * `otp_expired` carrying the message "Token has expired or is invalid" — one
 * answer, deliberately covering both, so that verifying is not an oracle for
 * which codes exist. Reading that as expiry is how a mistyped digit sent people
 * to their inbox to wait for a code that was already sitting there.
 *
 * We can answer it ourselves, because we know something the provider's reply
 * does not carry: when the code went out. Past `OTP_EXPIRY_SECONDS` it is
 * genuinely stale; inside that window the code is still live, so a refusal
 * means the digits were wrong.
 *
 * `sentAt` and `now` are epoch milliseconds. The comparison is `>=` so a code
 * refused exactly on the boundary reads as expired — the provider's clock and
 * ours are not the same clock, and at that edge "ask for a new one" is the
 * advice that works either way.
 */
export function hasCodeExpired(sentAt: number, now: number): boolean {
  return now - sentAt >= OTP_EXPIRY_SECONDS * 1000;
}

/**
 * Maps a Supabase auth error onto the results above.
 *
 * Anything unrecognised becomes `unavailable` rather than being passed through:
 * provider error strings leak whether an address is known, which is the exact
 * thing §12 forbids.
 */
export function classifyAuthError(
  error: { status?: number | undefined; code?: string | undefined; message?: string } | null,
): "rate-limited" | "code-rejected" | "unavailable" | null {
  if (!error) return null;

  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return "rate-limited";
  }

  /**
   * One outcome, because the provider gives one. `otp_expired` is what a wrong
   * code and a stale one both come back as — the name is the provider's, not a
   * finding about the code. Splitting it here is what put the expiry message in
   * front of people who had simply mistyped a digit; the split now happens
   * against our own send clock, in `hasCodeExpired`.
   */
  if (error.code === "otp_expired" || error.code === "invalid_credentials") {
    return "code-rejected";
  }

  /**
   * `otp_disabled` is email OTP being switched off for the project. That is our
   * misconfiguration, not a code anyone got wrong, and telling someone to check
   * their digits over it sends them round a loop that cannot close.
   */
  if (error.code === "otp_disabled") return "unavailable";

  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("rate limit")) return "rate-limited";
  if (message.includes("expired") || message.includes("token")) return "code-rejected";

  return "unavailable";
}
