import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted so the `vi.mock` factory below can close over them: the factory runs
 * when `./actions` is imported, which is before a plain `const` at this level
 * would have been initialised.
 */
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

import { requestCode, verifyCode } from "./actions";

/**
 * How the sign-in email is *shaped* — not what it says.
 *
 * Supabase decides between a magic link and a six-digit code from the email
 * template alone: `{{ .ConfirmationURL }}` in the template sends a link,
 * `{{ .Token }}` sends a code. The `signInWithOtp` call itself has no switch
 * for this, which is exactly what makes the arguments worth pinning here —
 * nothing about the code reads as "this is what decides the email".
 *
 * The trap is `emailRedirectTo`. It is the obvious-looking addition: it is a
 * documented option, it takes a URL, and adding it reads like an improvement
 * ("send people back to where they started"). What it actually does is supply
 * the redirect target embedded *inside* a link, so pairing it with an OTP
 * template is incoherent at best, and folklore widely — and wrongly — credits
 * it with flipping the flow. Either way it does not belong in a product that
 * only ever wants a code (product-spec.md §12).
 *
 * A regression here is invisible to every other gate. Types pass, lint passes,
 * the action still returns `{ status: "sent" }`, and the only evidence is a
 * link sitting in someone's inbox — which then has to be traced back through
 * the template settings, the auth logs and the call site to find one added
 * option. That round trip is the cost this test exists to avoid.
 */
describe("requestCode", () => {
  beforeEach(() => {
    auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("asks for a code and nothing else", async () => {
    await requestCode("person@example.com");

    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
    const [args] = auth.signInWithOtp.mock.calls[0] ?? [];

    expect(args.options).not.toHaveProperty("emailRedirectTo");
    // Catches the near-misses too — `redirectTo`, or whatever a future option
    // is named — since any of them means someone is reaching for a link.
    expect(Object.keys(args.options ?? {}).filter((key) => /redirect/i.test(key))).toEqual([]);
  });

  // §12: an unknown address must take the same path as a known one, so this
  // stays true. Dropping it would turn the form into an enumeration oracle.
  it("keeps creating users, so an unknown address behaves like a known one", async () => {
    await requestCode("person@example.com");

    const [args] = auth.signInWithOtp.mock.calls[0] ?? [];
    expect(args.options?.shouldCreateUser).toBe(true);
  });

  it("does not spend a send on an address that cannot be one", async () => {
    expect(await requestCode("not-an-email")).toEqual({ status: "invalid-email" });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("verifyCode", () => {
  beforeEach(() => {
    auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  /**
   * The companion mistake to the one above, and just as quiet: `"magiclink"`
   * and `"signup"` each verify a code for only one kind of user, so choosing
   * either leaves half the sign-ins failing on a valid code. `"email"` is the
   * type that covers both new and returning users.
   */
  it('verifies with type "email", which covers new and returning users alike', async () => {
    await verifyCode("person@example.com", "123456");

    const [args] = auth.verifyOtp.mock.calls[0] ?? [];
    expect(args.type).toBe("email");
  });
});
