import { describe, expect, it } from "vitest";

import {
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  classifyAuthError,
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
    expect(classifyAuthError({ message: "email rate limit exceeded" })).toBe("rate-limited");
  });

  it("separates an expired code from a wrong one", () => {
    expect(classifyAuthError({ code: "otp_expired" })).toBe("expired");
    expect(classifyAuthError({ message: "Token has expired or is invalid" })).toBe("expired");
    expect(classifyAuthError({ code: "invalid_credentials" })).toBe("invalid-code");
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
