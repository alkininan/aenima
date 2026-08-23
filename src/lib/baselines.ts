import type { Database } from "@/db/database.types";
import type { Stage } from "@/lib/stage";

/**
 * Appendix A's seed baselines, as data — product-spec.md §3: "each type × stage
 * has a seeded 'typical time'".
 *
 * §13's at-risk rule needs "time-in-stage past ~1.5× the learned baseline", and
 * a prose table cannot be compared against. Appendix A is prose: ranges rather
 * than numbers ("2–4 focused days"), mixed units ("~1 focused hour", "hours"),
 * and cells that are not durations at all ("conditional", "its own timebox").
 * This is that table made comparable, and every judgement it took is written
 * down below rather than buried in the numbers.
 *
 * **These are proposed, not confirmed.** §19 open item 3 lists the baseline
 * numbers as "proposed values below; confirm or adjust", and §3 says a tenant's
 * own medians silently replace the seeds after ~8 completed items of a type.
 * So this table is a starting point with a defined replacement path, in the same
 * spirit as `src/lib/buckets.ts`'s sort weights. Tune it freely.
 *
 * Four decisions taken to get from the appendix to this:
 *
 * 1. **The upper bound of each range.** "2–4 focused days" becomes 4. A
 *    baseline exists here to decide when something has taken *too* long, and
 *    flagging an item at the bottom of its own normal range would make At risk
 *    mean "in progress".
 *
 * 2. **Appendix A's columns are artifacts; §3's stages are four.** Brief maps to
 *    Discover and Define to Define. Design and Tech spec both fall inside §3's
 *    Design stage — "Design package + tech spec" is what that stage terminates
 *    in — so Design takes the longer of the two. "Refine + ceremony" belongs to
 *    Handover-Ready, which no item can reach yet.
 *
 * 3. **A missing cell means no baseline, not zero.** Every Spike cell, and
 *    Technical's and Content's early stages, are "—" in the appendix. An absent
 *    entry here means staleness cannot be judged, so `isStale` returns false and
 *    the item is never called at-risk for taking too long. Guessing a number for
 *    a stage the appendix declines to estimate would invent a deadline, and §3 is
 *    explicit that baselines are "quiet info … never as deadlines".
 *
 * 4. **The hour-scale cells are not used at all.** Appendix A gives Feature and
 *    Experiment "~1 focused hour" for the brief. §13 compares its baselines to
 *    *time-in-stage*, which is elapsed wall-clock, and an hour of focused
 *    writing is not an elapsed-time budget for a stage: taken literally it
 *    marks an item at risk ninety minutes after someone creates it, which
 *    contradicts §1's "welcoming, never alarming" and §3's own "never as
 *    deadlines". The day-scale cells are kept as elapsed approximations —
 *    imperfect for the same reason, since "2–4 focused days" is also effort
 *    rather than elapsed, but wrong by a factor rather than by a category.
 *    Discover therefore has no baseline for any type, and no item is ever
 *    at-risk on time for sitting in Discover. Raised as an open question:
 *    Appendix A measures effort and §13 spends it as elapsed time, and only one
 *    of those can be right.
 */

type ItemType = Database["public"]["Enums"]["item_type"];

const DAY = 24 * 60 * 60 * 1000;

/**
 * §13's multiplier: past this much of the baseline, an item is at risk on time.
 * A default, like the sort weights — §3 has the seeds replaced by tenant medians
 * once there is history to compute them from.
 */
export const STALE_MULTIPLIER = 1.5;

/**
 * Upper bound of each Appendix A range, in milliseconds, per (type, stage).
 *
 * `Partial` twice over, and both are load-bearing: a type may have no baseline
 * for a stage (the appendix's "—"), and no type has one for `handed_over`.
 */
export const STAGE_BASELINES: Partial<Record<ItemType, Partial<Record<Stage, number>>>> = {
  // Brief ~1 focused hour — see note 4, not an elapsed budget, so no Discover
  // entry. Define 2–4 focused days · Design 3–7 days, tech spec 1–2 days → the
  // longer of the two, 7.
  feature: { define: 4 * DAY, design: 7 * DAY },
  // No brief. Define 1–2 days · Design 2–3 days, tech spec conditional.
  enhancement: { define: 2 * DAY, design: 3 * DAY },
  // Nothing until the tech spec, which is 2–4 days of §3's Design stage.
  technical: { design: 4 * DAY },
  // Define "hours" — read as one working day, the smallest unit the appendix
  // uses elsewhere. Design 1–2 days.
  content: { define: 1 * DAY, design: 2 * DAY },
  // Brief ~1 hour — dropped for the same reason as Feature's. Define 2–3 days ·
  // Design 2–4 days.
  experiment: { define: 3 * DAY, design: 4 * DAY },
  // Define "hours"; design is conditional, so it has no baseline.
  fix: { define: 1 * DAY },
  // Spike is "its own timebox" in every column — a per-item value the appendix
  // explicitly declines to seed. No entry, so a spike is never stale on time.
  // When the timebox becomes a field, it belongs here, not as a guess.
  spike: {},
};

/** The baseline for a (type, stage), or null where the appendix gives none. */
export function stageBaseline(type: ItemType, stage: Stage): number | null {
  return STAGE_BASELINES[type]?.[stage] ?? null;
}

/**
 * Has this item been in its stage past §13's 1.5× baseline?
 *
 * False whenever there is no baseline — the honest answer to "is this taking too
 * long" when nothing says how long it should take. Also false for a negative
 * elapsed time, which a clock skew or a backfilled timestamp can produce and
 * which must not read as an ageing item.
 */
export function isStale(type: ItemType, stage: Stage, elapsedMs: number): boolean {
  const baseline = stageBaseline(type, stage);
  if (baseline === null) return false;
  return elapsedMs > baseline * STALE_MULTIPLIER;
}
