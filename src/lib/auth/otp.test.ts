import { describe, expect, it } from "vitest";

import {
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  classifyAuthError,
  hasCodeExpired,
  isValidEmail,
  isValidOtp,
  normalizeEmail,
  normalizeOtp,
} from "@/lib/auth/otp";
import { AUTH_PROVIDERS, enabledProviders, isProviderEnabled } from "@/lib/auth/providers";

/** product-spec.md §12: 6-digit codes, ~10-minute expiry, rate-limited. */
describe("OTP shape", () => {
  it("is six digits with a ten-minute life", () => {
    expect(OTP_LENGTH).toBe(6);
    expect(OTP_EXPIRY_SECONDS).toBe(600);
  });

  it("accepts exactly six digits", () => {
    expect(isValidOtp("012345")).toBe(true);
    expect(isValidOtp("12345")).toBe(false);
    expect(isValidOtp("1234567")).toBe(false);
    expect(isValidOtp("")).toBe(false);
  });

  it("rejects anything that is not a digit", () => {
    expect(isValidOtp("12a456")).toBe(false);
    expect(isValidOtp("１２３４５６")).toBe(false);
  });

  // People paste "123 456" and "123-456" straight out of a mail client.
  it("forgives the spacing a paste brings with it", () => {
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
    expect(isValidOtp("123 456")).toBe(true);
  });
});

/**
 * §12 (v2.12): wrong and expired are two errors and the provider hands back
 * one, so the split is made here — against the clock we started when we sent
 * the code, which is the one piece of information the refusal does not carry.
 */
describe("telling a stale code from a wrong one", () => {
  const sentAt = 1_700_000_000_000;

  it("calls a code inside its window wrong, not expired", () => {
    expect(hasCodeExpired(sentAt, sentAt)).toBe(false);
    expect(hasCodeExpired(sentAt, sentAt + 1000)).toBe(false);
    // A second short of the full ten minutes is still a live code.
    expect(hasCodeExpired(sentAt, sentAt + OTP_EXPIRY_SECONDS * 1000 - 1000)).toBe(false);
  });

  it("calls a code past its window expired", () => {
    expect(hasCodeExpired(sentAt, sentAt + OTP_EXPIRY_SECONDS * 1000)).toBe(true);
    expect(hasCodeExpired(sentAt, sentAt + 60 * 60 * 1000)).toBe(true);
  });

  /**
   * The boundary goes to expired. Our clock and the provider's are not the same
   * clock, and at the edge "ask for a new one" is the advice that works whether
   * the code had a second left or none.
   */
  it("gives the boundary itself to expiry", () => {
    expect(hasCodeExpired(sentAt, sentAt + OTP_EXPIRY_SECONDS * 1000 - 1)).toBe(false);
    expect(hasCodeExpired(sentAt, sentAt + OTP_EXPIRY_SECONDS * 1000)).toBe(true);
  });
});

describe("email validation", () => {
  it("normalizes case and surrounding space", () => {
    expect(normalizeEmail("  Alkin@Example.COM ")).toBe("alkin@example.com");
  });

  it.each(["a@b.co", "alkin.inan@example.com", "first+tag@sub.example.co.uk", "ünal@example.com"])(
    "accepts %s",
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );

  it.each(["", "no-at-sign", "a@b", "a@@b.com", "spaced out@example.com", "a@b..com"])(
    "rejects %s",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );

  it("rejects an address past the addressable length", () => {
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

/**
 * §12: "no account enumeration". The result type is where that is enforced —
 * if a caller cannot express "no such account", it cannot leak it.
 */
describe("no account enumeration", () => {
  it("maps every unrecognised provider error to a single opaque outcome", () => {
    expect(classifyAuthError({ message: "User not found" })).toBe("unavailable");
    expect(classifyAuthError({ message: "Signups not allowed for otp" })).toBe("unavailable");
    expect(classifyAuthError({ status: 400, message: "Email address not authorized" })).toBe(
      "unavailable",
    );
  });

  it("recognises rate limiting, which is safe to surface", () => {
    expect(classifyAuthError({ status: 429 })).toBe("rate-limited");
    expect(classifyAuthError({ code: "over_email_send_rate_limit" })).toBe("rate-limited");
    expect(classifyAuthError({ code: "over_request_rate_limit" })).toBe("rate-limited");
    expect(classifyAuthError({ message: "email rate limit exceeded" })).toBe("rate-limited");
  });

  /**
   * `otp_disabled` is email OTP switched off for the project — ours to fix, not
   * the person's. It used to classify as a bad code, which asks someone to
   * re-check digits against a door that is bolted.
   */
  it("calls a disabled provider an outage, not a bad code", () => {
    expect(classifyAuthError({ code: "otp_disabled" })).toBe("unavailable");
  });

  /**
   * §12 (v2.12). The provider does not separate a wrong code from a stale one,
   * and this used to pretend it did: `otp_expired` was read as expiry, so a
   * mistyped digit was answered with "that code has expired" and sent people to
   * their inbox for a code already sitting in it.
   *
   * The message Supabase sends is the giveaway and it is asserted here in full
   * — "Token has expired or is invalid" is one string covering both causes, on
   * purpose, because a verify endpoint that distinguished them would be an
   * oracle for which codes exist. So the classifier reports the one answer it
   * was actually given.
   */
  it("reports a refused code as one answer, because that is what it gets", () => {
    expect(classifyAuthError({ code: "otp_expired" })).toBe("code-rejected");
    expect(classifyAuthError({ message: "Token has expired or is invalid" })).toBe("code-rejected");
    expect(classifyAuthError({ code: "invalid_credentials" })).toBe("code-rejected");
  });

  it("says nothing at all when there was no error", () => {
    expect(classifyAuthError(null)).toBeNull();
  });
});

/** §12: email, Google and Apple — only email ships in T0.4. */
describe("provider seam", () => {
  it("ships email only, with the other two declared and off", () => {
    expect(enabledProviders()).toEqual(["email"]);
    expect(isProviderEnabled("email")).toBe(true);
    expect(isProviderEnabled("google")).toBe(false);
    expect(isProviderEnabled("apple")).toBe(false);
  });

  it("keeps the seam present so turning one on is a one-line change", () => {
    expect(Object.keys(AUTH_PROVIDERS).sort()).toEqual(["apple", "email", "google"]);
  });
});
