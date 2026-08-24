import type { ApplicabilityCondition, ConditionalLayer, RubricCheck, SkillPack } from "./types";

/**
 * The Feature PRD rubric — product-spec.md §7.2, "the master rubric", and
 * Appendix B's interview bank, transcribed.
 *
 * **This file is a transcription, not a draft.** §7.2's wording is law and §18
 * makes English the authoring source, so the prose below is copied rather than
 * improved: a check that reads awkwardly reads awkwardly in the spec, and the
 * place to fix that is the spec. §5 makes the budget zero-sum — a new check
 * takes its points from an existing one — so nothing here may be added without
 * something being taken away, and `validatePack` refuses a pack where that
 * happened by accident.
 *
 * Three things §7.2 does not state, decided on the ticket rather than here:
 *
 * 1. **Check ids.** §7.2 numbers its rows and never names them; the `MN-2` and
 *    `SF-1` ids elsewhere in the spec are *requirement* IDs inside a PRD, not
 *    rubric checks (§7.4: "MN-4 defines a disabled condition on this screen").
 *    So the ids are the row numbers, `prd-1` … `prd-20`, and every one traces
 *    back to the line it came from.
 *
 * 2. **Where check 20 lives.** §7.2's header says "20 checks, 100 points, 9
 *    Musts", and its twenty rows sum to 105 with ten Musts. Rows 1–19 sum to
 *    exactly 100 with exactly nine Musts, and row 20 is marked `5*` — "Enters
 *    via applicability; denominator renormalizes". §4 calls safety a layer that
 *    "floats above all types", so it is a layer here rather than a rubric check.
 *    The arithmetic is not ambiguous once you do it.
 *
 * 3. **That check 15 is conditional too.** "(list-rendering surfaces only)" is
 *    an applicability condition stated as plainly as check 16's, and §4's engine
 *    "governs individual checks".
 */

/* -------------------------------------------------------------------------- */
/* §4's applicability conditions                                              */
/* -------------------------------------------------------------------------- */

/** §7.2 check 15's own parenthetical. */
const LIST_SURFACE: ApplicabilityCondition = {
  id: "list-rendering-surface",
  when: "The feature renders a list, so it has empty and first-use states.",
};

/**
 * §4, verbatim on the example: "'offline behavior' applies to a
 * network-dependent mobile screen, not to an admin dashboard."
 */
const NETWORK_DEPENDENT: ApplicabilityCondition = {
  id: "network-dependent-surface",
  when: "The feature depends on the network or on a permission, so it can be denied, offline or degraded.",
};

/**
 * §4's safety layer: "user-to-user visibility, interaction, or location → 'how
 * could this be misused against a person, and what protects them?' as a Must,
 * weight 5".
 */
const SAFETY_SURFACE: ApplicabilityCondition = {
  id: "user-to-user-or-location",
  when: "The feature carries user-to-user visibility, interaction, or location.",
};

/* -------------------------------------------------------------------------- */
/* §7.2 — the twenty rows                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Rows 1–19. These are the rubric, and they sum to 100 with nine Musts —
 * `prd-6`, `9`, `10`, `11`, `14`, `15`, `16`, `17`, `19`.
 */
const CHECKS: RubricCheck[] = [
  {
    id: "prd-1",
    prose: "Problem written without the solution hidden inside it",
    tag: "should",
    points: 5,
  },
  { id: "prd-2", prose: "Points to an opportunity", tag: "should", points: 3 },
  {
    id: "prd-3",
    prose: "Audience defined behaviorally (could filter a user database)",
    tag: "should",
    points: 4,
  },
  { id: "prd-4", prose: "Evidence attached", tag: "should", points: 2 },
  { id: "prd-5", prose: "Assumptions + how we'd notice they're wrong", tag: "should", points: 3 },
  {
    id: "prd-6",
    prose: 'Hypothesis: "We believe [change] → [outcome], measured by [metric]"',
    tag: "must",
    points: 6,
  },
  {
    id: "prd-7",
    prose: "Metric has baseline + target (or an instrumentation plan if new)",
    tag: "should",
    points: 4,
  },
  {
    id: "prd-8",
    prose: 'Kill/rollback line ("if blocks rise 20%, we pull it")',
    tag: "should",
    points: 4,
  },
  { id: "prd-9", prose: "Every story has a stable requirement ID", tag: "must", points: 6 },
  {
    id: "prd-10",
    prose: "Every story has testable GWT acceptance criteria",
    tag: "must",
    points: 10,
  },
  { id: "prd-11", prose: "Explicit out-of-scope list", tag: "must", points: 5 },
  {
    id: "prd-12",
    prose: "Side effects: other flows, emails, notifications, systems, teams this touches",
    tag: "should",
    points: 4,
  },
  { id: "prd-13", prose: "Ship scope: platforms, locales, audience", tag: "should", points: 4 },
  {
    id: "prd-14",
    prose: "Per story: what the user sees on failure (EARS)",
    tag: "must",
    points: 8,
  },
  {
    id: "prd-15",
    prose: "Empty / first-use states (list-rendering surfaces only)",
    tag: "must",
    points: 6,
    appliesWhen: LIST_SURFACE,
  },
  {
    id: "prd-16",
    prose: "Permission-denied, offline, degraded behavior (conditional)",
    tag: "must",
    points: 6,
    appliesWhen: NETWORK_DEPENDENT,
  },
  {
    id: "prd-17",
    prose:
      "Every user action has a named tracking event per convention; the hypothesis metric is computable from them",
    tag: "must",
    points: 8,
  },
  {
    id: "prd-18",
    prose: "Data footprint declared, personal data flagged (triggers compliance layer)",
    tag: "should",
    points: 4,
  },
  {
    id: "prd-19",
    prose: "Misreading sweep: no sentence two developers could read two ways",
    tag: "must",
    points: 8,
  },
];

/**
 * Row 20, and §4's safety layer.
 *
 * It enters rather than leaves — the denominator goes to 105 when it applies —
 * which is why it is a layer and not one of the checks above.
 */
const SAFETY_LAYER: ConditionalLayer = {
  id: "safety",
  appliesWhen: SAFETY_SURFACE,
  checks: [
    {
      id: "prd-20",
      prose:
        "Safety (conditional, user-to-user/location features): misuse against a person + protections",
      tag: "must",
      points: 5,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Appendix B — the interview bank                                            */
/* -------------------------------------------------------------------------- */

/**
 * Appendix B's twenty questions, bound to the checks they close.
 *
 * The bank's numbering and §7.2's run in parallel — item 2 closes "points to an
 * opportunity", item 19 is the critic sweep that closes the misreading check,
 * item 20 is the safety question — so the binding is the numbering rather than
 * a judgement about which question serves which check.
 *
 * §6 is why the binding is required at all: "Every objection must bind to a
 * rubric check ID; unbound objections are discarded (the structural cure for
 * nitpicking)." A bank that could hold an unbound question would be a bank that
 * smuggles one in ahead of the critic.
 */
const INTERVIEW = [
  {
    checkId: "prd-1",
    prompt: "Forget the feature — what's going wrong for users right now?",
    criticTest:
      "delete the proposed solution from the answer; if nothing remains, it's a solution in disguise.",
  },
  {
    checkId: "prd-2",
    prompt: "Which bigger goal does this serve?",
    criticTest: "opportunity linked or created.",
  },
  {
    checkId: "prd-3",
    prompt: "Who exactly feels this — by what they do, not their age?",
    criticTest: "the description could filter a user database.",
  },
  {
    checkId: "prd-4",
    prompt: "What made you sure this is real?",
    criticTest: "≥1 attached artifact with a source.",
  },
  {
    checkId: "prd-5",
    prompt: "What are you quietly assuming — and how would you notice if it's wrong?",
    criticTest: "each assumption pairs with a detection signal.",
  },
  {
    checkId: "prd-6",
    prompt: "Complete: we believe ___ will lead to ___, measured by ___.",
    criticTest: "exact three-slot shape, measurable third slot.",
  },
  {
    checkId: "prd-7",
    prompt: "What's that number today, and where should it land?",
    criticTest: "baseline + target, or an instrumentation plan.",
  },
  {
    checkId: "prd-8",
    prompt: "What result would make you turn this off?",
    criticTest: "concrete threshold.",
  },
  {
    checkId: "prd-9",
    prompt: "Walk me through it as the user, step by step; I'll turn each into a story with an ID.",
    criticTest: "every capability became a story; no verb left storyless.",
  },
  {
    checkId: "prd-10",
    prompt:
      'Per story: "You\'re checked in, you tap wave — what must be true right after, and how fast?"',
    criticTest: "GWT with an observable outcome a tester can verify.",
  },
  {
    checkId: "prd-11",
    prompt: "What will people ask for that we're NOT doing this round?",
    criticTest: "adjacent-obvious exclusions named; an empty list on a Feature is bounced once.",
  },
  {
    checkId: "prd-12",
    prompt:
      "Beyond its own screens — what flows, emails, notifications, systems, or other people's work does this touch?",
    criticTest: "named surfaces and systems, cross-checked against the Figma map.",
  },
  {
    checkId: "prd-13",
    prompt: "Where does this ship — platforms, cities, everyone or a test group?",
    criticTest: "all three dimensions.",
  },
  {
    checkId: "prd-14",
    prompt: 'Per story: "It fails — network hiccup. What does the user see?"',
    criticTest: "a described behavior per failure, written down in EARS.",
  },
  {
    checkId: "prd-15",
    prompt: "First user, empty list — what's on the screen?",
    criticTest: 'content + a next action, not just "empty state exists."',
  },
  {
    checkId: "prd-16",
    prompt: "Location permission off. No internet. Walk me through each.",
    criticTest:
      'one behavior per condition; "ask for permission" alone fails (what if they refuse?).',
  },
  {
    checkId: "prd-17",
    prompt:
      "Which moments do we need to see in the data? I'll draft event names in your convention.",
    criticTest:
      "every user action has an event; the hypothesis metric is computable; misses are bounced with the missing event named.",
  },
  {
    checkId: "prd-18",
    prompt: "What does this store or read about a person — anything sensitive?",
    criticTest: "storage list present; the personal-data flag consistent with it.",
  },
  {
    // Appendix B item 19 is "Critic sweep, no question" — a stage direction
    // rather than something anyone says, so there is no prompt to transcribe.
    checkId: "prd-19",
    prompt: null,
    criticTest:
      "two-readings sentences returned as pointed choices (\"'nearby' — same venue, or 100 m? MN-2 could mean either\"), each resolution written into the doc.",
  },
  {
    checkId: "prd-20",
    prompt: "How could someone use this against another person at 2 a.m., and what stops them?",
    criticTest: "protections cited in the spec.",
  },
] satisfies SkillPack["interview"];

export const featurePrdPack: SkillPack = {
  id: "feature-prd",
  // First encoding of §7.2. The rubric's own content has not changed, so this
  // is 1.0.0 rather than a draft version — §5 versions rubrics like documents,
  // and this is the document as written.
  version: "1.0.0",
  artifactKind: "prd",
  checks: CHECKS,
  layers: [SAFETY_LAYER],
  interview: INTERVIEW,
};
