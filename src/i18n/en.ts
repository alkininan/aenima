/**
 * English strings. The shape of this object *is* the Dictionary type, so `tr`
 * and `nl` cannot be added half-finished — a missing key is a type error.
 *
 * design-spec.md §12 governs the voice: sentence case everywhere including
 * buttons, no exclamation marks, calm vocabulary. §10 governs the degraded
 * states — nothing here says "failed" or "invalid" at a person.
 *
 * §12 also asks for +30% width headroom for TR/NL, which is why nothing below
 * is written to fit a fixed box.
 */
export const en = {
  common: {
    appName: "aenima",
    continue: "Continue",
    back: "Back",
    retry: "Try again",
    signOut: "Sign out",
  },
  signIn: {
    title: "Sign in",
    // §12: no account enumeration, so the copy never implies an account exists.
    emailLabel: "Email",
    // §4 subtitle slot: instructional copy lives here and only here, never in a
    // field's helper line (§8).
    emailSubtitle: "We'll send a six-digit code.",
    sendCode: "Send code",
    emailInvalid: "That doesn't look like an email address yet.",
    codeTitle: "Enter your code",
    // §12 (v2.7): stated flatly. `shouldCreateUser` is true in `requestCode`, so
    // sign-in creates the account and every valid address receives a code — the
    // old conditional hedged against a branch that does not exist. Still says the
    // same words for every address, which is what keeps it non-enumerating.
    codeSentTo: (email: string) => `Code sent to ${email}`,
    codeLabel: "Six-digit code",
    codeSubtitle: "The code works for about ten minutes.",
    codeIncomplete: "That's not six digits yet.",
    codeRejected: "That code didn't work. Check it, or ask for a new one.",
    codeExpired: "That code has expired. Ask for a new one.",
    resend: "Send a new code",
    /**
     * §8 (v2.10): the cooldown counts down inside the control's own label. One
     * string with the clock interpolated rather than a label plus a separate
     * counter — §12 reserves +30% for TR/NL and the parenthetical does not sit
     * in the same place in every language.
     */
    resendIn: (clock: string) => `Send a new code (${clock})`,
    // §12 (v2.10): states the cause and stops there. The old line — "that's a
    // few codes in a short while" — implied the person had been excessive, when
    // the product was the one that left the button live between attempts.
    rateLimited: "Too many requests. Wait a moment before asking for another code.",
    unavailable: "Sign-in is unavailable right now.",
  },
  workspace: {
    // First run: §16 defers real onboarding, so the workspace gets a plain name.
    defaultName: "My workspace",
    signedInAs: (email: string) => `Signed in as ${email}`,
    creating: "Setting up your workspace",
  },
  errors: {
    // design-spec.md §10: one line, one action, never a stack trace.
    notFound: "That page isn't here.",
    unexpected: "Something went wrong on our side.",
    backToApp: "Back to your workspace",
  },
} as const;

export type Dictionary = typeof en;
