"use server";

import { createClient } from "@/lib/supabase/server";
import {
  classifyAuthError,
  isValidEmail,
  isValidOtp,
  normalizeEmail,
  normalizeOtp,
  type RequestCodeResult,
  type VerifyCodeResult,
} from "@/lib/auth/otp";

/**
 * product-spec.md §12: passwordless, six-digit codes, rate-limited, and **no
 * account enumeration**.
 *
 * The last one shapes the code, not just the copy. `shouldCreateUser` stays at
 * its default of true, so an unknown address takes exactly the same path as a
 * known one — same work, same result, same message. Nothing branches on whether
 * an account exists, because a branch is an oracle.
 */
export async function requestCode(email: string): Promise<RequestCodeResult> {
  if (!isValidEmail(email)) return { status: "invalid-email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      // Left at the default deliberately: turning it off would make an unknown
      // address fail differently from a known one, which is enumeration.
      shouldCreateUser: true,
    },
  });

  const classified = classifyAuthError(error);
  if (classified === "rate-limited") return { status: "rate-limited" };
  if (classified) return { status: "unavailable" };

  return { status: "sent" };
}

export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  if (!isValidEmail(email) || !isValidOtp(code)) return { status: "invalid-code" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: normalizeOtp(code),
    type: "email",
  });

  const classified = classifyAuthError(error);
  if (classified === "expired") return { status: "expired" };
  if (classified === "invalid-code") return { status: "invalid-code" };
  if (classified === "rate-limited") return { status: "rate-limited" };
  if (classified) return { status: "unavailable" };

  return { status: "verified" };
}
