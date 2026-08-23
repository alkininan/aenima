import { describe, expect, it } from "vitest";

import { STALE_MULTIPLIER, stageBaseline } from "@/lib/baselines";
import {
  BLOCKING_GAP_AGE_MS,
  BUCKETS,
  SORT_WEIGHTS,
  assignBucket,
  compareInBucket,
  sortWeight,
  type BucketInput,
} from "@/lib/buckets";

/**
 * §13's three buckets, on the clock they are made of.
 *
 * Every input below passes `now` explicitly. That is the point of the function
 * taking it: "older than 5 days" and "past 1.5× the baseline" are claims about
 * two instants, and a test that read the real clock could only assert them
 * approximately — which is the difference between covering the boundary and
 * covering near it.
 */

const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** A Flowing feature: in Define, entered today, nothing outstanding. */
function item(overrides: Partial<BucketInput> = {}): BucketInput {
  return {
    type: "feature",
    stage: "define",
    openGaps: [],
    stageEnteredAt: NOW - DAY,
    lastActivityAt: NOW - DAY,
    now: NOW,
    ...overrides,
  };
}

const gapAged = (days: number) => ({ tag: "must" as const, createdAt: NOW - days * DAY });

describe("assignBucket", () => {
  it("puts an item with nothing outstanding in Flowing", () => {
    expect(assignBucket(item())).toBe("flowing");
  });

  // §13's Flowing is "everything else" — a partition, not a filter. An item
  // with no gaps, no history and no baseline still has to land somewhere.
  it("never returns anything outside the three buckets, even for an empty item", () => {
    const bare = item({ type: "spike", stage: "discover", openGaps: [] });

    expect(BUCKETS).toContain(assignBucket(bare));
    expect(assignBucket(bare)).toBe("flowing");
  });

  describe("your move", () => {
    // §13: "anything awaiting a human". A Must gap is a debt someone has to
    // accept, exclude or close.
    it("takes an item with an open Must gap once it has reached Define", () => {
      expect(assignBucket(item({ openGaps: [gapAged(1)] }))).toBe("your_move");
    });

    it("takes one in Design too", () => {
      expect(assignBucket(item({ stage: "design", openGaps: [gapAged(1)] }))).toBe("your_move");
    });

    /**
     * A gap on a Discover item is the system noticing the brief is thin, which
     * is the work in progress rather than a decision waiting on a person. §13's
     * Your move is for things *awaiting* someone.
     */
    it("leaves a Discover item alone, however many Must gaps it has", () => {
      const early = item({ stage: "discover", openGaps: [gapAged(1), gapAged(2)] });

      expect(assignBucket(early)).toBe("flowing");
    });

    // Should gaps are advisory. Only a Must blocks handover, and only a block
    // is owed a decision.
    it("ignores Should gaps", () => {
      const advisory = item({ openGaps: [{ tag: "should", createdAt: NOW - DAY }] });

      expect(assignBucket(advisory)).toBe("flowing");
    });

    /**
     * §13 puts Your move "always on top", so an item that qualifies for both
     * lands there. This one has a 40-day gap — comfortably at risk as well.
     */
    it("outranks at risk when an item qualifies for both", () => {
      const both = item({ openGaps: [gapAged(40)] });

      expect(assignBucket(both)).toBe("your_move");
    });
  });

  describe("at risk", () => {
    /**
     * §13: "a handover-blocking gap older than 5 days". Discover keeps the item
     * out of Your move, which is what lets the ageing rule be seen on its own.
     */
    it("takes an item whose blocking gap has passed five days", () => {
      const aged = item({ stage: "discover", openGaps: [gapAged(6)] });

      expect(assignBucket(aged)).toBe("at_risk");
    });

    it("does not take one a day short of five", () => {
      const fresh = item({ stage: "discover", openGaps: [gapAged(4)] });

      expect(assignBucket(fresh)).toBe("flowing");
    });

    // The boundary itself: "older than" is strict, so five days exactly is not
    // yet older than five days.
    it("treats exactly five days as not yet older than five days", () => {
      const exact = item({
        stage: "discover",
        openGaps: [{ tag: "must", createdAt: NOW - BLOCKING_GAP_AGE_MS }],
      });
      const past = item({
        stage: "discover",
        openGaps: [{ tag: "must", createdAt: NOW - BLOCKING_GAP_AGE_MS - 1 }],
      });

      expect(assignBucket(exact)).toBe("flowing");
      expect(assignBucket(past)).toBe("at_risk");
    });

    // Only a Must blocks handover, so only a Must can age into at-risk.
    it("never ages a Should gap into at risk", () => {
      const advisory = item({
        stage: "discover",
        openGaps: [{ tag: "should", createdAt: NOW - 90 * DAY }],
      });

      expect(assignBucket(advisory)).toBe("flowing");
    });

    /** §13: "time-in-stage past ~1.5× the learned baseline". */
    it("takes an item that has outstayed 1.5x its baseline", () => {
      const baseline = stageBaseline("feature", "define")!;
      const stale = item({ stageEnteredAt: NOW - baseline * STALE_MULTIPLIER - 1 });

      expect(assignBucket(stale)).toBe("at_risk");
    });

    it("leaves one sitting exactly on 1.5x alone", () => {
      const baseline = stageBaseline("feature", "define")!;
      const onTheLine = item({ stageEnteredAt: NOW - baseline * STALE_MULTIPLIER });

      expect(assignBucket(onTheLine)).toBe("flowing");
    });

    /**
     * A spike is "its own timebox" in every Appendix A column — the appendix
     * declines to seed one, so nothing here may invent a deadline for it.
     */
    it("never calls a spike stale, however long it has sat", () => {
      const ancient = item({ type: "spike", stage: "define", stageEnteredAt: NOW - 365 * DAY });

      expect(stageBaseline("spike", "define")).toBeNull();
      expect(assignBucket(ancient)).toBe("flowing");
    });

    // A backfilled or skewed timestamp can put stage entry in the future. That
    // is not an item ageing, and it must not read as one.
    it("does not read a future stage entry as an ageing item", () => {
      const skewed = item({ stageEnteredAt: NOW + 30 * DAY });

      expect(assignBucket(skewed)).toBe("flowing");
    });
  });
});

describe("sortWeight", () => {
  // §13: "blocking-gap age 40%". At exactly the threshold the term contributes
  // its full weight, which is what makes the percentage mean something.
  it("gives a gap at the five-day threshold the full blocking-gap weight", () => {
    const base = item({ stage: "discover" });
    const threshold = item({
      stage: "discover",
      openGaps: [{ tag: "must", createdAt: NOW - BLOCKING_GAP_AGE_MS }],
    });

    expect(sortWeight(threshold) - sortWeight(base)).toBeCloseTo(SORT_WEIGHTS.blockingGapAge, 10);
  });

  /**
   * Deliberately uncapped above the threshold: a 40-day gap must outrank a
   * 6-day one. Clamping at 1 would flatten exactly the items that most need the
   * top of the list.
   */
  it("keeps ranking gaps that are far past the threshold", () => {
    const older = item({ stage: "discover", openGaps: [gapAged(40)] });
    const old = item({ stage: "discover", openGaps: [gapAged(6)] });

    expect(sortWeight(older)).toBeGreaterThan(sortWeight(old));
  });

  it("ranks on the oldest blocking gap when there are several", () => {
    const many = item({ stage: "discover", openGaps: [gapAged(1), gapAged(30), gapAged(2)] });
    const oneOld = item({ stage: "discover", openGaps: [gapAged(30)] });

    expect(sortWeight(many)).toBeCloseTo(sortWeight(oneOld), 10);
  });

  // §13: "handover proximity 10%" — between two equally troubled items, the one
  // nearer handover surfaces first.
  it("breaks a tie on how near handover the item is", () => {
    const later = item({ stage: "design", stageEnteredAt: NOW, lastActivityAt: NOW });
    const earlier = item({ stage: "discover", stageEnteredAt: NOW, lastActivityAt: NOW });

    expect(sortWeight(later)).toBeGreaterThan(sortWeight(earlier));
  });

  // No gaps, no staleness, sitting in the first stage: every weighted term is
  // zero and the score is zero. Worth pinning, because a non-zero floor would
  // quietly make the proximity term do nothing.
  it("scores a completely untroubled Discover item at zero", () => {
    const calm = item({ stage: "discover", stageEnteredAt: NOW });

    expect(sortWeight(calm)).toBe(0);
  });

  /**
   * The regression term is reserved, not redistributed. Until Phase 2 no input
   * can move it, so the weights that *are* live sum to 0.7 rather than 1 — the
   * 30% is being held, and this is what says so.
   */
  it("holds the regression weight rather than spreading it over the others", () => {
    expect(SORT_WEIGHTS.regression).toBe(0.3);
    expect(
      SORT_WEIGHTS.blockingGapAge +
        SORT_WEIGHTS.regression +
        SORT_WEIGHTS.staleness +
        SORT_WEIGHTS.handoverProximity,
    ).toBeCloseTo(1, 10);
  });
});

describe("compareInBucket", () => {
  // §13: Flowing is "everything else, by recent activity".
  it("orders Flowing by most recent activity", () => {
    const stale = item({ lastActivityAt: NOW - 10 * DAY });
    const recent = item({ lastActivityAt: NOW - 1 * DAY });

    expect(compareInBucket("flowing", recent, stale)).toBeLessThan(0);
    expect([stale, recent].sort((a, b) => compareInBucket("flowing", a, b))).toEqual([
      recent,
      stale,
    ]);
  });

  it("orders at risk by the weighted score, worst first", () => {
    const worse = item({ stage: "discover", openGaps: [gapAged(40)] });
    const bad = item({ stage: "discover", openGaps: [gapAged(6)] });

    expect([bad, worse].sort((a, b) => compareInBucket("at_risk", a, b))).toEqual([worse, bad]);
  });

  // Your move is a queue of debts, so it ranks the same way — oldest debt first
  // — rather than by activity.
  it("ranks your move by the same score as at risk", () => {
    const a = item({ openGaps: [gapAged(20)] });
    const b = item({ openGaps: [gapAged(2)] });

    expect(compareInBucket("your_move", a, b)).toBe(compareInBucket("at_risk", a, b));
  });

  // A stable comparator keeps the query's `created_at` order for ties, which is
  // what makes a list of otherwise-identical items reproducible.
  it("reports a tie as a tie, so the incoming order survives", () => {
    const a = item({ lastActivityAt: NOW });
    const b = item({ lastActivityAt: NOW });

    expect(compareInBucket("flowing", a, b)).toBe(0);
    expect(compareInBucket("at_risk", a, b)).toBe(0);
  });
});
