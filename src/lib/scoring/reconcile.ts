import type { CheckTag } from "@/packs";

/**
 * How a run's verdicts become gaps — product-spec.md §5, and §1 law 7.
 *
 * Pure: existing gaps and this run's verdicts in, a list of writes out. No
 * database, no clock, no provider, so every rule below is a unit test rather
 * than a fixture. `src/db/queries/scoring.ts` applies the list inside the same
 * transaction that writes the run.
 *
 * **Law 7 is the reason this is a table and not an upsert.** "Gaps, exclusions,
 * and flags are visible debts that a named person accepts." A gap someone
 * accepted or excluded carries their name, and a re-score must not overwrite
 * it, close it, or quietly raise a second gap beside it — the machine is not
 * allowed to relitigate a person's decision by noticing the same thing again.
 *
 * | verdict | existing gap for that check | write |
 * |---|---|---|
 * | fails | none, or only closed ones | insert an open gap |
 * | fails | open | update its evidence |
 * | fails | accepted or excluded | nothing |
 * | passes | open | close it, reason `passed` |
 * | passes | accepted or excluded | nothing |
 * | not asked | open | close it, reason `no longer applicable` |
 */

export type Disposition = "open" | "accepted" | "excluded" | "closed";

/** A gap as it exists now. Only the three fields any rule below reads. */
export type ExistingGap = {
  id: string;
  checkId: string;
  disposition: Disposition;
};

/** One applicable check's verdict, with its evidence already rendered. */
export type ReconcileVerdict = {
  checkId: string;
  tag: CheckTag;
  passed: boolean;
  /** The rendered gap text. Empty for a pass, which raises nothing. */
  evidence: string;
};

/**
 * Why a gap closed.
 *
 * Both are the machine saying reality moved, which is the only thing it may
 * say about a gap. `passed` is the check now being satisfied — §5 move 2's
 * "Pass → closed with the evidence linked". `no-longer-applicable` is §4's
 * applicability engine answering in the same pass that scores: the surface
 * stopped being network-dependent, the safety layer turned off, and the check
 * is no longer in the denominator the item is measured against.
 *
 * Leaving that second one open was the alternative and it is worse than either
 * choice: §13 would keep calling the item "Your move" over a Must that its own
 * denominator no longer contains. What §5's first negotiation move routes
 * through a human is an *argument* that a check does not apply — a person
 * pushing back on a verdict — not the engine's own reading of a new version.
 */
export type CloseReason = "passed" | "no-longer-applicable";

export type GapWrite =
  | { kind: "insert"; checkId: string; tag: CheckTag; evidence: string }
  | { kind: "update"; gapId: string; checkId: string; evidence: string }
  | { kind: "close"; gapId: string; checkId: string; reason: CloseReason };

export type ReconcileInput = {
  /** Verdicts for the checks that applied to this run. */
  verdicts: readonly ReconcileVerdict[];
  /**
   * Every check id this pack contains, applicable or not.
   *
   * The id space is what keeps one artifact's run out of another's gaps. An
   * item carries a PRD and a design package, each scored by its own pack
   * against its own ids; without this, scoring the PRD would look at a gap
   * raised by the design rubric, find no verdict for it, and close it as no
   * longer applicable. A run may only touch gaps belonging to its own rubric.
   */
  packCheckIds: readonly string[];
  gaps: readonly ExistingGap[];
};

export function reconcileGaps(input: ReconcileInput): GapWrite[] {
  const owned = new Set(input.packCheckIds);
  const asked = new Set(input.verdicts.map((verdict) => verdict.checkId));

  // Gaps for one check, in one place — an item can hold several for the same
  // check over its life, at most one of them open.
  const byCheck = new Map<string, ExistingGap[]>();
  for (const gap of input.gaps) {
    if (!owned.has(gap.checkId)) continue;
    const existing = byCheck.get(gap.checkId);
    if (existing) existing.push(gap);
    else byCheck.set(gap.checkId, [gap]);
  }

  const writes: GapWrite[] = [];

  for (const verdict of input.verdicts) {
    const gaps = byCheck.get(verdict.checkId) ?? [];
    const open = gaps.find((gap) => gap.disposition === "open");
    const declared = gaps.some(
      (gap) => gap.disposition === "accepted" || gap.disposition === "excluded",
    );

    if (verdict.passed) {
      // A pass closes an open gap and touches nothing else. An accepted gap
      // whose check now passes stays accepted: someone took that debt on the
      // record, and the record is the point.
      if (open)
        writes.push({ kind: "close", gapId: open.id, checkId: verdict.checkId, reason: "passed" });
      continue;
    }

    if (open) {
      writes.push({
        kind: "update",
        gapId: open.id,
        checkId: verdict.checkId,
        evidence: verdict.evidence,
      });
      continue;
    }

    // Law 7. The check still fails and the debt is still real — it is simply
    // already someone's, by name, and raising a second gap for it would turn an
    // accepted risk into a fresh accusation on every re-score.
    if (declared) continue;

    writes.push({
      kind: "insert",
      checkId: verdict.checkId,
      tag: verdict.tag,
      evidence: verdict.evidence,
    });
  }

  // Checks this run did not ask about, because §4's conditions took them out of
  // the denominator. Their open gaps close; accepted and excluded ones do not.
  for (const [checkId, gaps] of byCheck) {
    if (asked.has(checkId)) continue;
    const open = gaps.find((gap) => gap.disposition === "open");
    if (open) {
      writes.push({ kind: "close", gapId: open.id, checkId, reason: "no-longer-applicable" });
    }
  }

  return writes;
}
