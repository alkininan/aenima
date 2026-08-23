import type { Database } from "@/db/database.types";
import { isStale, stageBaseline, STALE_MULTIPLIER } from "@/lib/baselines";
import { STAGES, type Stage } from "@/lib/stage";

/**
 * Bucket assignment — product-spec.md §13's three buckets, as a pure function.
 *
 * Same shape and the same reasons as `src/lib/stage.ts`: no I/O, every branch
 * covered without a database, and the clock passed in rather than read, because
 * "older than 5 days" and "past 1.5× the baseline" are time-dependent claims
 * that are miserable to assert against a moving `Date.now()`.
 *
 * §13 in full:
 *
 * - **Your move** — "anything awaiting a human: sign-offs, exclusion confirms,
 *   triage items, walkthrough answers, stalled packets (>48 h). Always on top."
 * - **At risk** — "score regressed this week, a handover-blocking gap older than
 *   5 days, or time-in-stage past ~1.5× the learned baseline."
 * - **Flowing** — "everything else, by recent activity."
 *
 * Most of Your move and one third of At risk cannot happen yet: there is no
 * packet table, no intake, no walkthrough and no score. Those inputs are typed
 * as `never` below rather than omitted, exactly as `StageInput.signedPacket`
 * is — so the rules §13 states are visible here in full, and switching one on is
 * a change to a field's type rather than a rule someone has to remember to come
 * back and write.
 */

type ItemType = Database["public"]["Enums"]["item_type"];
type GapTag = Database["public"]["Enums"]["gap_tag"];

/** §13, in priority order. Your move is "always on top", so it is first. */
export const BUCKETS = ["your_move", "at_risk", "flowing"] as const;

export type Bucket = (typeof BUCKETS)[number];

/** §13's "handover-blocking gap older than 5 days". */
export const BLOCKING_GAP_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * §13's at-risk sort: "blocking-gap age 40%, regression size 30%, staleness
 * ratio 20%, handover proximity 10% (weights tunable)".
 *
 * **Tunable defaults, not law.** §19 open item 4 lists them as "shipped as
 * defaults above; tune after four weeks of real use", so treat a change here as
 * configuration rather than as a spec revision.
 */
export const SORT_WEIGHTS = {
  blockingGapAge: 0.4,
  regression: 0.3,
  staleness: 0.2,
  handoverProximity: 0.1,
} as const;

/** One open gap, reduced to what a bucket rule reads. */
export type OpenGap = {
  tag: GapTag;
  /**
   * When the gap was *raised*, in epoch ms.
   *
   * Raised, not reopened: §5 lets an accepted gap go back to open, and that
   * transition leaves `created_at` where it was. "Older than 5 days" is read
   * here as how long the gap has existed, which is the plain sense of the words
   * and the more conservative of the two readings — a debt that was accepted and
   * then reopened is not a new debt.
   */
  createdAt: number;
};

export type BucketInput = {
  type: ItemType;
  stage: Stage;
  /** Open gaps only. Accepted and excluded ones are settled, not awaited. */
  openGaps: readonly OpenGap[];
  /** Derived, never stored — see `deriveStageEntry`. Epoch ms. */
  stageEnteredAt: number;
  /** Epoch ms. Orders Flowing, and nothing else. */
  lastActivityAt: number;
  /** The clock, passed in. */
  now: number;

  /**
   * §13's "sign-offs" and "stalled packets (>48 h)".
   *
   * No packet table exists, so nothing can observe a signature — the same
   * absence `StageInput.signedPacket` describes, and typed the same way. See
   * that field for why this is `never` and not `boolean`.
   */
  awaitingSignoff?: never;
  /** §13's "triage items". No intake router until Phase 4. */
  awaitingTriage?: never;
  /** §13's "walkthrough answers". The ceremony is Phase 5. */
  awaitingWalkthrough?: never;
  /** §13's "exclusion confirms". The negotiation protocol is Phase 2. */
  awaitingExclusionConfirm?: never;
  /**
   * §13's "score regressed this week", and the size of the drop that
   * `SORT_WEIGHTS.regression` weighs. Scores arrive in Phase 2.
   */
  scoreRegression?: never;
};

/**
 * The stage at which an open Must gap starts awaiting a human.
 *
 * §13 puts "exclusion confirms" in Your move — a Must gap is a debt someone has
 * to accept, exclude or close, and that is a person's move by definition. But
 * only once the item has reached the stage that raises it: a gap on a Discover
 * item is the system noticing the brief is thin, which is the work rather than a
 * decision waiting on someone.
 */
const GAPS_AWAIT_A_HUMAN_FROM: Stage = "define";

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** §13's "handover-blocking" gap: a Must, which is what blocks handover. */
function blockingGaps(openGaps: readonly OpenGap[]): readonly OpenGap[] {
  return openGaps.filter((gap) => gap.tag === "must");
}

/** The oldest blocking gap's age in ms, or 0 when there is none. */
function oldestBlockingGapAge(input: BucketInput): number {
  const ages = blockingGaps(input.openGaps).map((gap) => input.now - gap.createdAt);
  return ages.length === 0 ? 0 : Math.max(...ages);
}

/**
 * §13's Your move: "anything awaiting a human".
 *
 * Today that is one thing — an open Must gap on an item far enough along that
 * the gap is a decision rather than the work in progress. The other four sources
 * §13 names are the `never` fields above.
 */
function awaitsAHuman(input: BucketInput): boolean {
  if (stageIndex(input.stage) < stageIndex(GAPS_AWAIT_A_HUMAN_FROM)) return false;
  return blockingGaps(input.openGaps).length > 0;
}

/** §13's At risk, minus the regression third, which needs scores. */
function atRisk(input: BucketInput): boolean {
  if (oldestBlockingGapAge(input) > BLOCKING_GAP_AGE_MS) return true;
  return isStale(input.type, input.stage, input.now - input.stageEnteredAt);
}

/**
 * Which bucket an item belongs in.
 *
 * The order is the priority: an item that qualifies for both Your move and At
 * risk is a Your move item, because §13 puts that bucket "always on top" and an
 * item cannot be in two. Nothing is dropped — the three are a partition, and
 * Flowing is "everything else".
 */
export function assignBucket(input: BucketInput): Bucket {
  if (awaitsAHuman(input)) return "your_move";
  if (atRisk(input)) return "at_risk";
  return "flowing";
}

/**
 * §13's at-risk ordering, as a single score — higher sorts first.
 *
 * Each term is normalised to roughly 0–1 before its weight applies, so the
 * percentages in §13 mean what they look like. Two of the four are always zero
 * today and say so:
 *
 * - **Blocking-gap age** (40%): the oldest Must gap's age against the 5-day
 *   threshold, so a gap at exactly the threshold contributes 1. Uncapped above
 *   that — a 40-day gap should outrank a 6-day one, and clamping would flatten
 *   precisely the items that most need the top of the list.
 * - **Regression size** (30%): `scoreRegression` is `never`, so this is 0 for
 *   every item until Phase 2. Written out rather than omitted so the weight is
 *   visibly reserved rather than silently redistributed.
 * - **Staleness ratio** (20%): time-in-stage against the (type, stage) baseline.
 *   0 where the appendix gives no baseline.
 * - **Handover proximity** (10%): how far along §3's stages the item is, so that
 *   between two equally troubled items the one nearer handover surfaces first.
 */
export function sortWeight(input: BucketInput): number {
  const gapAge = oldestBlockingGapAge(input) / BLOCKING_GAP_AGE_MS;

  // Reserved, and 0 for every input this type can currently express.
  const regression = 0;

  const baseline = stageBaseline(input.type, input.stage);
  const staleness =
    baseline === null ? 0 : (input.now - input.stageEnteredAt) / (baseline * STALE_MULTIPLIER);

  // `handed_over` is the last stage and unreachable, so in practice this runs
  // 0 → 2/3 across the three stages an item can actually be in.
  const proximity = stageIndex(input.stage) / (STAGES.length - 1);

  return (
    SORT_WEIGHTS.blockingGapAge * Math.max(0, gapAge) +
    SORT_WEIGHTS.regression * regression +
    SORT_WEIGHTS.staleness * Math.max(0, staleness) +
    SORT_WEIGHTS.handoverProximity * proximity
  );
}

/**
 * §13's within-bucket order: At risk by the weighted score above, Flowing "by
 * recent activity", and Your move by the same score as At risk — the bucket is
 * a queue of things owed a person, and the oldest debt is the most owed.
 *
 * Stable on ties: two items with identical scores keep the order they arrived
 * in, which is the query's `created_at` and therefore reproducible.
 */
export function compareInBucket(bucket: Bucket, a: BucketInput, b: BucketInput): number {
  if (bucket === "flowing") return b.lastActivityAt - a.lastActivityAt;
  return sortWeight(b) - sortWeight(a);
}
