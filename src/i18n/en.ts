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
    // §12 (v2.12): the code step carries two distinct errors, never one
    // standing in for the other. A wrong code told it expired sends someone to
    // their inbox for a code that was already there.
    codeRejected: "That code isn't right. Check it, or ask for a new one.",
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
  /** §4 sidebar nav. Keys match `NavEntry.label` in src/lib/routes.ts. */
  nav: {
    list: "List",
    triage: "Triage",
    analytics: "Analytics",
    settings: "Settings",
    /** Appended to an unbuilt destination's accessible name, never painted. */
    notYet: "not built yet",
  },
  /** §13's three buckets. mono-micro headers, so §3 uppercases them in CSS. */
  buckets: {
    your_move: "Your move",
    at_risk: "At risk",
    flowing: "Flowing",
  },
  /** §3's four stages, as the pipeline strip and the meters name them. */
  stages: {
    discover: "Discover",
    define: "Define",
    design: "Design",
    handed_over: "Handed over",
  },
  /** §4's seven item types, for the row's outline badge. */
  itemTypes: {
    feature: "Feature",
    enhancement: "Enhancement",
    technical: "Technical",
    content: "Content",
    experiment: "Experiment",
    fix: "Fix",
    spike: "Spike",
  },
  list: {
    title: "Your work",
    /** §4 subtitle slot — instructional copy lives here and only here. */
    subtitle: "Sorted by what needs you, not by when it was made.",
    /** §8: the strip's leading label, before the per-stage segments. */
    allStages: "All",
    /** §8 gap chips overflow at two: "+3". */
    moreGaps: (count: number) => `+${count}`,
    /** §8's idle row. Park itself is a later ticket; the chip renders regardless. */
    park: "Park?",
    /** §8 item row: the overflow menu's accessible name. */
    itemMenu: (title: string) => `Actions for ${title}`,
    openItem: "Open",
    copyKey: "Copy key",
    /**
     * §10: meters render hollow with this line until an AI key exists — "never
     * zeros, never red". ui-footnote, per §10.
     */
    noScoring: "Connect AI to activate scoring",
    /** §8 empty states: "Nothing needs you right now," never "No data". */
    emptyTitle: "Nothing needs you right now",
    emptyAction: "Add an item",
    /**
     * A filter that matches nothing is a different situation from an empty
     * workspace — one is "you have no work", the other is "not here". §8 gives
     * each one line and one action.
     */
    emptyFilteredTitle: "Nothing here with those filters",
    emptyFilteredAction: "Clear filters",
    /** §8 row: mono-readout freshness beside the dot. */
    freshness: (relative: string) => `updated ${relative}`,
  },
  /** Relative time for the row's mono-readout. §12: calm, never exact-to-the-second. */
  relativeTime: {
    justNow: "just now",
    minutes: (n: number) => `${n}m ago`,
    hours: (n: number) => `${n}h ago`,
    days: (n: number) => `${n}d ago`,
    weeks: (n: number) => `${n}w ago`,
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
