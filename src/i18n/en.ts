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
import type { AcceptOutcome, ReopenOutcome } from "@/lib/gap-move";

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
  /** §7's five artifact packs, named as §7 names them. */
  artifactKinds: {
    brief: "Opportunity Brief",
    prd: "PRD",
    tech_spec: "Tech spec",
    design_package: "Design package",
    backlog: "Backlog refinement",
  },
  item: {
    backToList: "Back to the list",
    /** §8's section headings on the item page. mono-micro, so §3 uppercases them. */
    artifacts: "Artifacts",
    content: "Content",
    gaps: "Gaps",
    decisions: "Decisions",
    activity: "Activity",
    /** §3's derived stage, labelled so nobody reads it as a settable field. */
    stageLabel: "Stage",
    /**
     * §2 lineage: the opportunity an item came out of, which is the thing that
     * explains why it exists. Plain text for now — `/o/<key>` cannot be built
     * because opportunities have no key column (build log, open question 9).
     */
    opportunity: "Opportunity",
    /** §8: the 8h meter's own name, for the screen reader. */
    readiness: "Readiness",
    /**
     * §8's meter expansion — §1 law 3's "every score expands into the exact
     * quoted gap", as chrome around content the pack owns.
     *
     * **The check's own wording is not here, and that is deliberate.** A
     * check's prose and its applicability condition are pack content, versioned
     * with the rubric and translated by shipping a translated pack (§18) — see
     * `src/packs/types.ts`. Copying them into this file would make two sources
     * for one sentence that drift on the first version bump.
     */
    checks: "Checks",
    /** §12: calm vocabulary. A check that passed was answered, not "passed". */
    checkPassed: "Answered",
    /** §12 verbatim: "this section was unclear" — never test, fail, violation. */
    checkUnclear: "Unclear",
    /** §4: the check left the denominator. Not a pass, and not a failure. */
    checkNotAsked: "Not asked",
    /**
     * Why a check was not asked — and the polarity is the whole point.
     *
     * `ApplicabilityCondition.when` is written affirmatively ("The feature
     * renders a list, so it has empty and first-use states."), and a check is
     * not asked precisely because that is **false** of this artifact. Printing
     * the condition on its own states the opposite of the reason, so the
     * negation lives here, in the frame.
     *
     * One key rather than two, because TR and NL do not order the clauses the
     * way English does; and the second clause says nothing about the first's
     * grammar, so it survives a pack sentence that does not open "The feature".
     */
    checkNotAskedReason: (when: string) => `Only asked when: ${when} That is not true here.`,
    /**
     * §8's mono-readout percentage beside the track.
     *
     * The sign is here rather than in the component because it is not
     * punctuation, it is copy that moves: §12 renders numbers per locale and
     * Turkish writes the sign **first** — `%67`, not `67%`. A component that
     * concatenates `%` after the number has hard-coded English word order into
     * JSX, where no translator can reach it.
     */
    scorePercent: (score: number) => `${score}%`,
    /**
     * §4's renormalized denominator, said out loud.
     *
     * The arithmetic is invisible until someone asks why the denominator is 99
     * rather than 100, and the not-asked lines below are the answer — but only
     * once the number they explain is on screen.
     */
    pointsOf: (earned: number, of: number) => `${earned} of ${of} points`,
    /** §5: "Timestamps show freshness". The clock is the run's, not the item's. */
    scoredAt: (relative: string) => `scored ${relative}`,
    /**
     * §10: "freshness shows --warning dot + 'scored 6 h ago — retrying'; no
     * banners." §5 queues provider outages silently and the timestamp does the
     * honest work — this is the whole of what a person is told.
     */
    scoredRetrying: (relative: string) => `scored ${relative} — retrying`,
    /**
     * A run stored before aenima recorded what it did not ask — drizzle/0011.
     *
     * §1 law 3: "a number that cannot be interrogated does not ship." Such a run
     * lists its verdicts and stops short of the rubric, with nothing on the page
     * accounting for the difference, so the page says which it is rather than
     * letting the list read as complete. The missing lines are **not** filled in
     * from today's rubric: that is the defect 0011 removed.
     *
     * §12's voice — states the cause, blames nobody, offers the one thing that
     * changes it. No warning tone and no red: §0 law 1 keeps both off a score,
     * and an old run is not a fault, it is an old run.
     *
     * **Temporary.** Delete this with `RunView.notAskedUnrecorded` and its line
     * once no run predating 0011 remains — build log, open question 19.
     */
    checksNotAskedUnrecorded:
      "Scored before aenima recorded which checks it did not ask, so they are missing from " +
      "this list. A re-score adds them.",
    /**
     * §5 stamps provider, model and rubric version on every run, because a
     * number nobody can trace is a number nobody can argue with. mono-readout,
     * per §8.
     */
    provenance: (pack: string, version: string, model: string) => `${pack}@${version} · ${model}`,
    /**
     * §12: empty is the ordinary case here — most items own nothing yet — so it
     * reads as normal rather than as absence. Never "missing", never "none".
     */
    noArtifacts: "Nothing here yet. Artifacts appear as they are written.",
    noContent: "Nothing written yet.",
    noGaps: "No gaps yet. They appear when scoring runs.",
    /**
     * The same section, once a run exists — §13 narrows this list to open Musts
     * and gaps someone put their name to, and everything else lives under the
     * score. "No gaps yet" would be false here: there may be several, and they
     * are one click away.
     */
    noGapsScored: "Nothing owed here. Anything unclear is under the score.",
    noDecisions: "No decisions logged yet.",
    noActivity: "Nothing has happened to this item yet.",
    /** §7: how much history an artifact has, and when it last moved. */
    versionCount: (n: number) => (n === 1 ? "1 version" : `${n} versions`),
    /* ---------------------------------------------------------------- */
    /* §5's third negotiation move — "we accept this risk" (T2.5)         */
    /* ---------------------------------------------------------------- */
    /**
     * §5's own name for the move, and the disclosure that opens the form.
     *
     * §12: sentence case, calm, no exclamation. "Risk" rather than "gap"
     * because §5 names the move that way and §0 law 8 keeps one term per
     * concept — the thing being accepted is the risk; the gap is the record.
     */
    gapAccept: "Accept this risk",
    /** §8: a field shows one text, ever — its label. */
    gapAcceptReason: "Why this is acceptable",
    /**
     * §12's named confirm default. The disclosure above already says which move
     * this is, and §0 law 8 says one term per concept — repeating "Accept this
     * risk" on the button would say it twice on one control.
     */
    gapAcceptSubmit: "Looks right",
    /**
     * §1 law 4's "always undoable", as a standing control rather than a toast.
     * A debt can be handed back at any time by anyone who could have taken it.
     */
    gapReopen: "Reopen this gap",
    /**
     * What came of a move — §5's outcomes, one sentence each, **per move**.
     *
     * Keyed by intent first because one token serves two moves: both answer
     * `not-decider`, and "accepting a Must is the Decider's call" said to
     * someone who pressed *reopen* names a move they did not make. Inside each
     * move the record is exact over that move's own outcome set, so the
     * compiler names any sentence still missing and never asks for one the
     * database cannot produce — there is no reopen that wants a reason.
     *
     * These map a *kind*; no string the database produced ever reaches a person
     * (CLAUDE.md).
     *
     * §12 throughout: states the cause, blames nobody, never "failed" or
     * "invalid" at someone. §0 law 1 keeps the tone off Danger — none of these
     * is destructive and all of them are reversible.
     */
    gapMove: {
      accept: {
        accepted: "Accepted. It stays on the page with your name on it.",
        "reason-required": "Add a reason. It is the record of why this was accepted.",
        "reason-too-long": "That reason is longer than we can store. Try the short version.",
        "not-found": "That gap isn't here any more, so nothing was accepted.",
        "not-open": "This gap changed while you were writing, so nothing moved. Take another look.",
        "not-decider": "Accepting a Must is the Decider's call. An Owner can make it too.",
        "not-permitted": "Your role doesn't settle gaps. Someone with Product or Owner can.",
        unavailable: "That didn't go through. Try accepting it again.",
      } satisfies Record<AcceptOutcome, string>,
      reopen: {
        reopened: "Reopened. The record of why it was accepted is in the activity log.",
        "not-found": "That gap isn't here any more, so nothing was reopened.",
        "not-accepted":
          "This gap changed while you were writing, so nothing moved. Take another look.",
        "not-decider": "Reopening a Must is the Decider's call. An Owner can make it too.",
        "not-permitted": "Your role doesn't settle gaps. Someone with Product or Owner can.",
        unavailable: "That didn't go through. Try reopening it again.",
      } satisfies Record<ReopenOutcome, string>,
    },
    /**
     * The one answer that belongs to no move: the submission carried none.
     *
     * Only a hand-written POST reaches it — every form on the page carries its
     * intent and its gap. It still gets a sentence, because §12 has no copy for
     * a silent no-op and "nothing happened and nobody said so" is the one
     * outcome a person cannot act on.
     */
    gapMoveUnreadable: "That didn't arrive as a move, so nothing changed. Try it from the gap.",
    /** §5's three dispositions, as §5 names the moves that produce them. */
    gapOpen: "Open",
    gapAccepted: "Accepted",
    gapExcluded: "Excluded",
    /** §5's two tags. Only a Must blocks handover; a Should is advisory. */
    gapMust: "Must",
    gapShould: "Should",
    /**
     * §5: "converts it to an accepted gap stamped with the accepter's name."
     * The name is what the schema cannot give us yet — see src/lib/actor.ts.
     */
    settledBy: (actor: string) => `${actor} accepted this`,
    excludedBy: (actor: string) => `${actor} excluded this`,
    decidedBy: (actor: string) => `${actor} decided`,
    /** §11: a correction is a new decision that names the one it replaces. */
    supersededBy: "Superseded",
    supersedes: "Replaces an earlier decision",
    /**
     * The three things an actor can be. A uuid is not a name, so anyone who is
     * not the reader is "someone" — build log open question 2 owns the rest.
     */
    actorSelf: "You",
    actorOther: "Someone",
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
