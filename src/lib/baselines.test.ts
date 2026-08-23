import { describe, expect, it } from "vitest";

import { STAGE_BASELINES, STALE_MULTIPLIER, isStale, stageBaseline } from "@/lib/baselines";
import { STAGES } from "@/lib/stage";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Appendix A made comparable — and mostly, what it declines to say.
 *
 * The interesting assertions here are the absences. §3 calls baselines "quiet
 * info … never as deadlines", so every cell the appendix leaves empty has to
 * stay empty: a guessed number would become a deadline for a stage nobody
 * estimated.
 */
describe("stage baselines", () => {
  it("reads the day-scale cells from Appendix A", () => {
    expect(stageBaseline("feature", "define")).toBe(4 * DAY);
    // Design takes the longer of Appendix A's Design and Tech spec columns,
    // because §3's Design stage terminates in both.
    expect(stageBaseline("feature", "design")).toBe(7 * DAY);
    expect(stageBaseline("enhancement", "define")).toBe(2 * DAY);
  });

  // "—" in the appendix means nobody estimated it, which is not the same as
  // estimating zero.
  it("has no baseline where the appendix has none", () => {
    expect(stageBaseline("technical", "define")).toBeNull();
    expect(stageBaseline("fix", "design")).toBeNull();
  });

  /**
   * Every Spike cell is "its own timebox" — a per-item value the appendix
   * explicitly refuses to seed.
   */
  it("gives a spike no baseline in any stage", () => {
    for (const stage of STAGES) {
      expect(stageBaseline("spike", stage)).toBeNull();
    }
  });

  /**
   * The hour-scale cells are effort, not elapsed time. Used as a time-in-stage
   * budget, "~1 focused hour" marks an item at risk ninety minutes after
   * someone creates it — so Discover carries no baseline for anyone.
   */
  it("gives no type a Discover baseline", () => {
    for (const type of Object.keys(STAGE_BASELINES) as (keyof typeof STAGE_BASELINES)[]) {
      expect(stageBaseline(type, "discover")).toBeNull();
    }
  });

  // `handed_over` is terminal and archives out of active views, so nothing is
  // waiting there to be measured.
  it("gives no type a handed-over baseline", () => {
    for (const type of Object.keys(STAGE_BASELINES) as (keyof typeof STAGE_BASELINES)[]) {
      expect(stageBaseline(type, "handed_over")).toBeNull();
    }
  });
});

describe("isStale", () => {
  it("fires past 1.5x the baseline and not before", () => {
    const baseline = stageBaseline("feature", "define")!;

    expect(isStale("feature", "define", baseline)).toBe(false);
    expect(isStale("feature", "define", baseline * STALE_MULTIPLIER)).toBe(false);
    expect(isStale("feature", "define", baseline * STALE_MULTIPLIER + 1)).toBe(true);
  });

  /**
   * The load-bearing absence: no baseline means "nothing says how long this
   * should take", and the honest answer to "is it taking too long" is no.
   */
  it("never calls an item stale when there is no baseline to be stale against", () => {
    expect(isStale("spike", "define", 365 * DAY)).toBe(false);
    expect(isStale("technical", "discover", 365 * DAY)).toBe(false);
  });

  // A backfilled or skewed timestamp puts stage entry in the future. That is
  // not an item ageing.
  it("does not treat negative elapsed time as age", () => {
    expect(isStale("feature", "define", -30 * DAY)).toBe(false);
  });
});
