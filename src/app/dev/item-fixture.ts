import type { ActivityView } from "@/app/i/[key]/ActivityFeed";
import type { ArtifactView } from "@/app/i/[key]/ArtifactList";
import type { DecisionView } from "@/app/i/[key]/DecisionList";
import type { GapView } from "@/app/i/[key]/GapList";
import type { ItemHeaderData } from "@/app/i/[key]/ItemHeader";

/**
 * The item-page fixture.
 *
 * `/i/<key>` is behind the proxy, so the browser tests cannot reach it — the
 * same wall `/app` is behind. This is the preview they drive instead, and per
 * the build log it renders from a Server Component so the boundary the real page
 * has exists here too.
 *
 * Every case the page has to survive is represented once: an artifact with
 * versions and a body, one with none, all three gap dispositions, a superseded
 * decision and the one that replaced it, and a ledger with both actor kinds.
 * Real data cannot show most of that — no seeded item has any activity at all,
 * and only one has gaps.
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

export const ITEM_GAPS: GapView[] = [
  {
    id: "g1",
    checkId: "MN-2",
    tag: "must",
    disposition: "open",
    evidence: "'nearby' — same venue, or within 100 m? Two readings possible.",
    resolvedBy: null,
    resolutionNote: null,
  },
  {
    id: "g2",
    checkId: "MN-7",
    tag: "should",
    disposition: "accepted",
    evidence: "No offline behaviour described for the digest list.",
    resolvedBy: { kind: "self" },
    resolutionNote: "Accepted for V1 — the list is server-rendered and rarely opened offline.",
  },
  {
    id: "g3",
    checkId: "SF-1",
    tag: "must",
    disposition: "excluded",
    evidence: "No user-to-user visibility on this surface.",
    resolvedBy: { kind: "other" },
    resolutionNote: "Excluded: the digest has no interpersonal surface.",
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
