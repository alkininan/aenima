import { describe, expect, it } from "vitest";

import { escalationRate, formatSpend, spendByMember, spendByTier } from "@/lib/ai/meter";
import type { MeterRow } from "@/lib/ai/meter";
import { ANTHROPIC_MODELS } from "@/lib/ai/router";

/**
 * §15's meter: "spend per tier, per member, escalation-to-mid rate as the
 * quality early-warning light."
 */

const MTOK = 1_000_000;

const row = (over: Partial<MeterRow> = {}): MeterRow => ({
  tier: "routine",
  model: ANTHROPIC_MODELS.routine,
  rateCard: "anthropic-2026-08",
  actorUserId: "user-a",
  escalatedFrom: null,
  usage: {
    uncachedInputTokens: MTOK,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  },
  ...over,
});

describe("spend by tier", () => {
  it("keeps every tier, including the ones nothing ran on", () => {
    const totals = spendByTier([row()]);
    expect(Object.keys(totals)).toEqual(["routine", "analysis", "generation"]);
    // "Nothing ran on generation" is information, and it is not the same claim
    // as "generation cost nothing", which is why the key is present.
    expect(totals.generation).toEqual({ spend: 0, unpriced: 0, calls: 0 });
  });

  it("prices each row at the card it was billed at", () => {
    const totals = spendByTier([
      row(), // 1M Haiku input = $1.00
      row({ tier: "generation", model: ANTHROPIC_MODELS.generation }), // 1M Opus input = $5.00
    ]);

    expect(totals.routine.spend).toBe(1_000_000);
    expect(totals.generation.spend).toBe(5_000_000);
  });

  // A retired card or an unknown model must not quietly become zero — §12's
  // Owner-set cap would then be a cap with holes in it.
  it("counts what it could not price rather than calling it free", () => {
    const totals = spendByTier([row({ rateCard: "anthropic-2019-01" }), row({ model: "unknown" })]);
    expect(totals.routine.unpriced).toBe(2);
    expect(totals.routine.spend).toBe(0);
    expect(totals.routine.calls).toBe(2);
  });
});

describe("spend by member", () => {
  it("attributes §12's per-member usage", () => {
    const totals = spendByMember([row(), row(), row({ actorUserId: "user-b" })]);
    expect(totals.get("user-a")?.calls).toBe(2);
    expect(totals.get("user-b")?.calls).toBe(1);
  });

  // A nightly sweep costs real money and belongs on the bill. Dropping it would
  // make the meter disagree with the invoice; attributing it to whoever last
  // touched the item would be a lie about who did what.
  it("keeps agent-initiated work under a null member rather than dropping it", () => {
    const totals = spendByMember([row({ actorUserId: null })]);
    expect(totals.get(null)?.spend).toBe(1_000_000);
  });
});

describe("the escalation rate", () => {
  /**
   * The subtle part: a call that escalated is recorded at the tier it *ended*
   * on, with `escalatedFrom` naming where it began. Counting `tier ===
   * "routine"` alone would miss exactly the calls this number exists to
   * measure, and the rate would read zero forever.
   */
  it("counts escalated calls even though they are filed under analysis", () => {
    const rows = [
      row(),
      row(),
      row({ tier: "analysis", model: ANTHROPIC_MODELS.analysis, escalatedFrom: "routine" }),
    ];

    expect(escalationRate(rows)).toEqual({ escalated: 1, routine: 3, rate: 1 / 3 });
  });

  it("excludes work that was never eligible to escalate", () => {
    const rows = [
      row(),
      row({ tier: "generation", model: ANTHROPIC_MODELS.generation }),
      row({ tier: "analysis", model: ANTHROPIC_MODELS.analysis }),
    ];
    // One routine call, no escalations — the two others could never escalate,
    // so including them would dilute the signal with ineligible work.
    expect(escalationRate(rows)).toEqual({ escalated: 0, routine: 1, rate: 0 });
  });

  // "No routine calls yet" is not "the routine tier is doing fine".
  it("returns null rather than zero on an empty denominator", () => {
    expect(escalationRate([]).rate).toBeNull();
    expect(escalationRate([row({ tier: "generation" })]).rate).toBeNull();
  });
});

describe("formatting", () => {
  it("renders micro-dollars as money", () => {
    expect(formatSpend(1_000_000)).toBe("1.00");
    expect(formatSpend(1_234_500)).toBe("1.23");
    expect(formatSpend(0)).toBe("0.00");
  });
});
