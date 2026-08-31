import type { ActivityView } from "@/app/i/[key]/ActivityFeed";
import type { ArtifactView } from "@/app/i/[key]/ArtifactList";
import type { DecisionView } from "@/app/i/[key]/DecisionList";
import type { GapView } from "@/app/i/[key]/GapList";
import type { ItemHeaderData } from "@/app/i/[key]/ItemHeader";
import { composeRunView, type RunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

/**
 * The item-page fixture.
 *
 * `/i/<key>` is behind the proxy, so the browser tests cannot reach it — the
 * same wall `/app` is behind. This is the preview they drive instead, and per
 * the build log it renders from a Server Component so the boundary the real page
 * has exists here too.
 *
 * Every case the page has to survive is represented once: an artifact with
 * versions and a body, one with none, all four gap dispositions, a superseded
 * decision and the one that replaced it, and a ledger with both actor kinds.
 * Real data cannot show most of that — no seeded item has any activity at all,
 * and only one has gaps.
 *
 * **The run is the exception, and it is deliberately not invented.** `ITEM_RUN`
 * is Ghost mode's real run — the conditions, the verdicts, the points and the
 * arithmetic from the marking scheme in docs/build-log.md — composed through
 * the same `composeRunView` the real page calls. So `/dev/item` renders what
 * `/i/soc-9` renders, and an assertion that holds here is an assertion about
 * the product rather than about a mock. A fixture that made its own numbers up
 * could pass every test while the page showed something else.
 *
 * **And the gaps agree with it.** `ITEM_GAPS` is not a free list of dispositions
 * beside a run: every row is one `reconcileGaps` could have written against these
 * verdicts, because a gap that contradicts the run on the same screen is a state
 * `/i/<key>` cannot produce, and a test asserting against one measures the mock.
 * `run-view.test.ts` holds that as a rule so this file cannot drift out of it.
 *
 * DELETE BEFORE LAUNCH, with everything else under /dev.
 */

/** A fixed clock, so relative timestamps do not change between runs. */
export const ITEM_NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

export const ITEM_HEADER: ItemHeaderData = {
  key: "soc-12",
  title: "Weekly digest email",
  type: "feature",
  stage: "design",
  productName: "Sociera",
  opportunityTitle: "People miss what changed while they were away",
};

export const ITEM_ARTIFACTS: ArtifactView[] = [
  {
    kind: "brief",
    versionCount: 1,
    newestAt: ITEM_NOW - 12 * DAY,
    currentVersionNo: 1,
    currentBody:
      "People miss what changed while they were away, and come back to a wall of " +
      "notifications they cannot triage.\n\nA weekly digest collapses that into one " +
      "readable summary — deltas, not a state dump.",
  },
  {
    kind: "prd",
    versionCount: 3,
    newestAt: ITEM_NOW - 2 * DAY,
    currentVersionNo: 3,
    currentBody: "Weekly digest email — PRD draft 3",
  },
  // An artifact someone opened and never wrote into. It advances no stage and it
  // is not hidden: starting is a fact worth keeping.
  {
    kind: "design_package",
    versionCount: 0,
    newestAt: null,
    currentVersionNo: null,
    currentBody: null,
  },
];

/**
 * §5's four dispositions — and only two kinds of them reach the page (§13).
 *
 * The check ids are **rubric check ids**, as T2.3 made them: a gap names a
 * check, a story names a requirement, and the requirement id lives inside the
 * evidence where §7.2 puts it (build log, open question 11). The `GM-*` and
 * `MN-*` labels below are requirement ids inside §5's own sentence shape, which
 * is exactly where they belong.
 *
 * The last two exist to be **absent** from the rendered list. An open Should
 * lives under the score, where its check explains it; a closed gap renders
 * nowhere, because the check passing is the record.
 *
 * **Every row here is one `reconcileGaps` could have written against
 * `GHOST_MODE_RUN`**, and that is a constraint rather than a nicety. The
 * reconciler's table is total: a verdict that fails and has no open gap raises
 * one, a verdict that passes closes the open gap it finds, and only `accepted`
 * and `excluded` survive a verdict either way because they carry a name. So a
 * gap open on a check the run *passed* is a state the product cannot reach, and
 * a browser test asserting against one proves something about the mock rather
 * than about the page — the same objection that keeps §8's `--success`-at-100
 * branch unwritten. `run-view.test.ts` holds the pairing as a rule; the map:
 *
 * | gap | check's verdict | why the pairing is legal |
 * |---|---|---|
 * | `prd-10` open Must | unclear | fails, nothing settled → an open gap |
 * | `prd-16` accepted | passed | a name outranks a pass; it stays accepted |
 * | `prd-20` excluded | passed | same, and it is the layer check §4 let in |
 * | `prd-8` open Should | unclear | fails; §13 files it under the score |
 * | `prd-19` closed | passed | the re-score found it passing and closed it |
 */
export const ITEM_GAPS: GapView[] = [
  // The failing Must. Its evidence is the same sentence `renderEvidence` builds
  // from the run's own three parts, because reconcile wrote it from them.
  {
    id: "g1",
    checkId: "prd-10",
    tag: "must",
    disposition: "open",
    evidence:
      "GM-4: 'Members someone has blocked never see them at a venue, ghost mode on or off.' — " +
      "GM-4 is prose. The other four stories carry Given/When/Then.",
    resolvedBy: null,
    resolutionNote: null,
  },
  {
    id: "g2",
    checkId: "prd-16",
    tag: "must",
    disposition: "accepted",
    evidence: "MN-7: no offline behaviour described for the digest list.",
    resolvedBy: { kind: "self" },
    resolutionNote: "Accepted for V1 — the list is server-rendered and rarely opened offline.",
  },
  {
    id: "g3",
    checkId: "prd-20",
    tag: "must",
    disposition: "excluded",
    evidence: "No user-to-user visibility on this surface.",
    resolvedBy: { kind: "other" },
    resolutionNote: "Excluded: the digest has no interpersonal surface.",
  },
  // §13 files this under the score rather than here. It must not render.
  {
    id: "g4",
    checkId: "prd-8",
    tag: "should",
    disposition: "open",
    evidence: "There is no kill or rollback line anywhere in the document.",
    resolvedBy: null,
    resolutionNote: null,
  },
  // Closed by a re-score that found the check passing — a time, no name, no
  // note, and no line on the page. This is soc-9's real one: `prd-19` closed
  // when the protocol change made it pass.
  {
    id: "g5",
    checkId: "prd-19",
    tag: "must",
    disposition: "closed",
    evidence: "MN-2: 'nearby' — same venue, or within 100 m? Two readings possible.",
    resolvedBy: null,
    resolutionNote: null,
  },
];

export const ITEM_DECISIONS: DecisionView[] = [
  {
    id: "d2",
    statement: "Digest ships weekly, not daily",
    reason: "Daily was the original plan; the open rate did not justify the send volume.",
    decidedBy: { kind: "self" },
    decidedAt: ITEM_NOW - 3 * DAY,
    superseded: false,
    supersedes: true,
  },
  {
    id: "d1",
    statement: "Digest ships daily",
    reason: "Matches the cadence people already check the app on.",
    decidedBy: { kind: "other" },
    decidedAt: ITEM_NOW - 20 * DAY,
    superseded: true,
    supersedes: false,
  },
];

export const ITEM_ACTIVITY: ActivityView[] = [
  {
    id: "a1",
    action: "gap.opened",
    actor: { kind: "agent", name: "scorer" },
    occurredAt: ITEM_NOW - 2 * DAY,
  },
  { id: "a2", action: "decision.logged", actor: { kind: "self" }, occurredAt: ITEM_NOW - 3 * DAY },
  {
    id: "a3",
    action: "item.created",
    actor: { kind: "other" },
    occurredAt: ITEM_NOW - 20 * DAY,
  },
];

/* -------------------------------------------------------------------------- */
/* The run — Ghost mode's, exactly                                            */
/* -------------------------------------------------------------------------- */

/**
 * Ghost mode's stored run, from the marking scheme in docs/build-log.md.
 *
 * Three conditions were answered in the scoring pass: no list surface,
 * network-dependent, user-to-user. So `prd-15` renormalizes **out** (−6) and
 * the safety layer's `prd-20` renormalizes **in** (+5), and the denominator is
 * **99** — the one number that proves both directions ran.
 *
 * Five checks came back unclear against the shipped protocol, costing
 * 3 + 4 + 10 + 8 + 8 = 33, so the run earned **66 of 99**. (The answer key says
 * 58: it is labelled against what the rubric *should* find, and `prd-19` passes
 * on the shipped prompt. That gap is a recorded open question about the rubric,
 * not about this surface — and a fixture that quietly used 58 would be asserting
 * a run the product does not currently produce.)
 *
 * The quotes are real text from `scripts/seed-prd.ts`. Two failures are
 * *absences* — there is nothing to quote, and a null quote is legal and
 * different from a missing one.
 */
const GHOST_MODE_RUN: StoredRunInput = {
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: new Date(ITEM_NOW - 4 * 60 * 60 * 1000).toISOString(),
  nextScoringAttemptAt: null,
  earned: 66,
  denominator: 99,
  // §4's other half, as the run recorded it (drizzle/0011). `prd-15` is the
  // −6 in 99, and its condition is the pack's own sentence — written
  // affirmatively, stored here because it was false of this PRD.
  notAsked: [
    {
      checkId: "prd-15",
      tag: "must",
      points: 6,
      conditionWhen: "The feature renders a list, so it has empty and first-use states.",
    },
  ],
  results: [
    {
      checkId: "prd-1",
      tag: "should",
      points: 5,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-2",
      tag: "should",
      points: 3,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-3",
      tag: "should",
      points: 4,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-4",
      tag: "should",
      points: 2,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    // An absence: three assumptions, and no detection signal for any of them.
    {
      checkId: "prd-5",
      tag: "should",
      points: 3,
      passed: false,
      requirementId: null,
      quote: null,
      note: "Three assumptions are listed, and none of them says how we would notice it was wrong.",
    },
    {
      checkId: "prd-6",
      tag: "must",
      points: 6,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-7",
      tag: "should",
      points: 4,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    // The other absence: no kill or rollback line exists to quote.
    {
      checkId: "prd-8",
      tag: "should",
      points: 4,
      passed: false,
      requirementId: null,
      quote: null,
      note: "There is no kill or rollback line anywhere in the document.",
    },
    {
      checkId: "prd-9",
      tag: "must",
      points: 6,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-10",
      tag: "must",
      points: 10,
      passed: false,
      requirementId: "GM-4",
      quote: "Members someone has blocked never see them at a venue, ghost mode on or off.",
      note: "GM-4 is prose. The other four stories carry Given/When/Then.",
    },
    {
      checkId: "prd-11",
      tag: "must",
      points: 5,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-12",
      tag: "should",
      points: 4,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-13",
      tag: "should",
      points: 4,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-14",
      tag: "must",
      points: 8,
      passed: false,
      requirementId: "GM-3",
      quote:
        "Given ghost mode is on, when I look at the venue screen, then a persistent indicator tells me that other members cannot see me here.",
      note: "GM-3 and GM-4 describe no failure behaviour. GM-1, GM-2 and GM-5 do.",
    },
    // prd-15 is absent by construction: it renormalized out, so the run holds
    // no verdict for it and `composeRunView` renders it as not asked.
    {
      checkId: "prd-16",
      tag: "must",
      points: 6,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-17",
      tag: "must",
      points: 8,
      passed: false,
      requirementId: null,
      quote: "Events: `GhostOn`, `ghost_mode_toggled`.",
      note: "The two event names disagree on convention, there is no off event, and the hypothesis metric is not computable from either.",
    },
    {
      checkId: "prd-18",
      tag: "should",
      points: 4,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-19",
      tag: "must",
      points: 8,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
    {
      checkId: "prd-20",
      tag: "must",
      points: 5,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
  ],
};

/** The run as the page composes it — through the real composer, not by hand. */
export const ITEM_RUN: RunView = composeRunView(featurePrdPack, GHOST_MODE_RUN);

/**
 * The same run with §5's queue holding a retry — §10's warning dot and
 * "scored 4h ago — retrying".
 *
 * A provider outage cannot be staged in a browser test, and it is the one
 * freshness state that must never read as an error. So it is a fixture, reached
 * at `/dev/item?run=retrying` — `/dev/primitives` has no meter on it.
 */
export const ITEM_RUN_RETRYING: RunView = composeRunView(featurePrdPack, {
  ...GHOST_MODE_RUN,
  nextScoringAttemptAt: new Date(ITEM_NOW + 15 * 60 * 1000).toISOString(),
});
