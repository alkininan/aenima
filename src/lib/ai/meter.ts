import { cardById, spendOf } from "./pricing";
import type { CallUsage, Tier } from "./types";
import { TIERS } from "./types";

/**
 * §15's usage meter: "spend per tier, per member, escalation-to-mid rate as the
 * quality early-warning light."
 *
 * Pure arithmetic over rows, and pure on purpose — §12's code node law puts
 * counting and multiplication in code, and this is both. No clock, no database:
 * the rows come from `src/db/queries/ai-usage.ts` and the numbers come out.
 *
 * Each row is priced at **the card it was billed at**, read from its own
 * `rate_card` id, so a price change tomorrow leaves last month's total exactly
 * where it was.
 */

export type MeterRow = {
  tier: Tier;
  model: string;
  rateCard: string;
  actorUserId: string | null;
  escalatedFrom: Tier | null;
  usage: CallUsage;
};

export type MeterTotals = {
  /** Micro-dollars. Null components are counted separately, never as zero. */
  spend: number;
  /** Rows this layer could not price — an unknown model or a retired card. */
  unpriced: number;
  calls: number;
};

const EMPTY: MeterTotals = { spend: 0, unpriced: 0, calls: 0 };

function add(totals: MeterTotals, row: MeterRow): MeterTotals {
  const card = cardById(row.rateCard);
  const cost = card ? spendOf(card, row.model, row.usage) : null;

  return {
    spend: totals.spend + (cost ?? 0),
    unpriced: totals.unpriced + (cost === null ? 1 : 0),
    calls: totals.calls + 1,
  };
}

/**
 * Spend per tier. Every tier appears, including the ones nothing ran on.
 *
 * A missing key and a zero would read the same in a UI, and they are not the
 * same claim — "nothing ran on generation this week" is information.
 */
export function spendByTier(rows: readonly MeterRow[]): Record<Tier, MeterTotals> {
  const totals = Object.fromEntries(TIERS.map((tier) => [tier, EMPTY])) as Record<
    Tier,
    MeterTotals
  >;

  for (const row of rows) totals[row.tier] = add(totals[row.tier], row);
  return totals;
}

/**
 * Spend per member — §12's "per-member usage attribution".
 *
 * Agent-initiated work has no member, so it lands under a null key rather than
 * being dropped or attributed to whoever last touched the item. A nightly sweep
 * costs real money and belongs on the bill.
 */
export function spendByMember(rows: readonly MeterRow[]): Map<string | null, MeterTotals> {
  const totals = new Map<string | null, MeterTotals>();

  for (const row of rows) {
    totals.set(row.actorUserId, add(totals.get(row.actorUserId) ?? EMPTY, row));
  }
  return totals;
}

export type EscalationRate = {
  /** Routine calls that had to be retried on the analysis tier. */
  escalated: number;
  /** Routine calls in total. The denominator, and it can be zero. */
  routine: number;
  /** 0–1, or null when nothing routine ran. Null is not zero. */
  rate: number | null;
};

/**
 * §15's early-warning light.
 *
 * Not a cost statistic: a rising share of routine calls that could not produce
 * valid output first time says the cheap model is losing its grip on the task,
 * which is a quality signal that happens to also cost money.
 *
 * The denominator is routine calls, not all calls — nothing else can escalate,
 * so including analysis and generation would dilute the number with work that
 * was never eligible. `null` on an empty denominator rather than zero, because
 * "no routine calls yet" is not "the routine tier is doing fine".
 */
export function escalationRate(rows: readonly MeterRow[]): EscalationRate {
  // A row that escalated is recorded at the tier it *ended* on, with
  // `escalatedFrom` naming where it began — so a routine call that escalated
  // has tier "analysis". Counting `tier === "routine"` alone would miss exactly
  // the calls this number is about.
  const escalated = rows.filter((row) => row.escalatedFrom === "routine").length;
  const routine = rows.filter(
    (row) => row.tier === "routine" || row.escalatedFrom === "routine",
  ).length;

  return { escalated, routine, rate: routine === 0 ? null : escalated / routine };
}

/** Micro-dollars as a decimal string, for a UI that has to render one. */
export function formatSpend(microDollars: number): string {
  return (microDollars / 1_000_000).toFixed(2);
}
