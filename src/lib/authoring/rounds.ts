/**
 * Round state — product-spec.md §6's cap, as arithmetic over the ledger.
 *
 * "Hard limits from the self-correction research: **two refinement rounds per
 * section, maximum** — after two, the disagreement surfaces to the human as an
 * open question."
 *
 * T3.1's addendum settles the shape this reads. **One append-only row per
 * round**, unique on (artifact, section, check, cycle, round number): a refused
 * revision cuts no new version, so a row per version could not stay append-only,
 * and the round number is what makes each attempt its own row. **The count is
 * the highest round number for that key** — read from the rows, never counted
 * from the document, which cannot say how many times it was argued over (AC6).
 * **An open question is the round row marked surfaced**, not a table of its own.
 *
 * T3.2's addendum adds the **cycle** (AA1). A surfacing closes a check for the
 * text it was a judgement about, not for ever: when the human rewrites that
 * section the check gets another look, on a new cycle, at round zero. What a
 * cycle is keyed to is the section's text in the newest **human-authored**
 * version of the artifact — its *baseline*. The loop's own revisions are
 * agent-authored and never move it, which is what keeps §6's cap a cap: a
 * revision the author made is not the human rewriting the section, and a rule
 * that read it as one would reopen every check the loop had just closed and
 * never terminate.
 *
 * Everything here is a pure function over rows the caller read. Counting rounds
 * and applying the cap are code, never a model's judgement (T3.1's rules).
 */

/** How many times the author may revise a section for one check before the human decides. */
export const MAX_REFINEMENTS = 2;

/** The round whose objection becomes an open question instead of a third revision. */
export const SURFACING_ROUND = MAX_REFINEMENTS + 1;

/**
 * The longest reason, evidence or author position a round can hold —
 * `refinement_round`'s length checks. Read by the loop before a round is
 * written, so an over-long answer is cut to what the column holds and recorded
 * as cut, rather than refused by the database after a paid call (AA3).
 */
export const ROUND_TEXT_MAX = 2000;

/** The longest section id a round can hold — `refinement_round_section_len`. */
export const SECTION_ID_MAX = 200;

/** The first cycle of §6's cap over a section and a check. */
export const FIRST_CYCLE = 1;

/**
 * How a round ended.
 *
 * - `revised` — the author changed the section inside its scope; a new version was cut.
 * - `held` — the author returned the section unchanged: it kept its position,
 *   and there was nothing to version. The round is spent all the same.
 * - `refused` — the revision touched a section outside the objection's scope and
 *   the wall refused it; no version was cut, and the round is spent (AC2).
 * - `surfaced` — the disagreement the human owns. Round 3 is the third
 *   objection, with the author's latest position. Rounds 1 and 2 are the
 *   objection the author was never shown, because its evidence would not fit a
 *   round and a dropped objection is a gap nobody hears about (AA3).
 */
export type RoundOutcome = "revised" | "held" | "refused" | "surfaced";

/** One round as the ledger holds it — the parts the cap and a surfacing read. */
export type StoredRound = {
  sectionId: string;
  checkId: string;
  /** Which pass of §6's cap over this section and check. See the cycle, above. */
  cycleNo: number;
  /**
   * The section's text in the newest human-authored version when the round was
   * written, hashed. Null on a round written before cycles existed, and on a
   * section no human version holds.
   */
  baseSectionHash: string | null;
  roundNo: number;
  outcome: RoundOutcome;
  /** The critic's position: what it found unclear. */
  reason: string;
  /** Quoted from the section the critic read, and verified to be there. */
  evidence: string;
  /**
   * The author's position: how its revision answered, or why it held. Null on a
   * surfacing the author was never shown (AA3) — there is no position, and one
   * written in would be the ledger saying something that did not happen.
   */
  authorPosition: string | null;
};

const sameKey = (round: StoredRound, sectionId: string, checkId: string) =>
  round.sectionId === sectionId && round.checkId === checkId;

const forKey = (rounds: readonly StoredRound[], sectionId: string, checkId: string) =>
  rounds.filter((round) => sameKey(round, sectionId, checkId));

/**
 * The cycle a section and a check are on, given the section's current baseline —
 * its text in the newest human-authored version of the artifact, hashed, or null
 * where no human version holds that section.
 *
 * The newest cycle the ledger holds, and the one after it when the baseline has
 * moved since: the rounds already spent were about text the human has replaced,
 * so the check starts again at round zero (AA1).
 *
 * Two baselines never reopen anything. A **null argument** is a section no human
 * version holds, so nothing the human wrote has changed. A **null on the rows**
 * is a round written before cycles existed, whose baseline nobody recorded —
 * unknown is not "different", and reopening on it would re-spend two paid rounds
 * on a guess. Both hold the closure where it stands.
 */
export function currentCycle(
  rounds: readonly StoredRound[],
  sectionId: string,
  checkId: string,
  baseSectionHash: string | null,
): number {
  const mine = forKey(rounds, sectionId, checkId);
  if (mine.length === 0) return FIRST_CYCLE;

  const newest = mine.reduce((highest, round) => Math.max(highest, round.cycleNo), FIRST_CYCLE);
  if (baseSectionHash === null) return newest;

  // Every row of the newest cycle, never whichever one came back first: the
  // ledger's read is unordered, and one cycle's rows can carry different
  // baselines — a round written while the human version had no such section
  // carries null, and a later round of the same cycle carries a hash. Reading
  // one row made two reads of identical rows disagree about the cycle.
  const moved = mine.some(
    (round) =>
      round.cycleNo === newest &&
      round.baseSectionHash !== null &&
      round.baseSectionHash !== baseSectionHash,
  );
  return moved ? newest + 1 : newest;
}

/**
 * The round count for one section, one check and one cycle: the highest round
 * number the ledger holds for them, and 0 when it holds none.
 *
 * The highest number rather than the number of rows. They agree whenever the
 * ledger is whole, and where they would not — a row the caller's read missed —
 * the highest number is the one the unique key will hold the next write to.
 *
 * With no cycle named it counts every cycle, which is what a reader asking "how
 * many times has this been argued over" wants; the cap asks for one.
 */
export function roundCount(
  rounds: readonly StoredRound[],
  sectionId: string,
  checkId: string,
  cycleNo?: number,
): number {
  return forKey(rounds, sectionId, checkId)
    .filter((round) => cycleNo === undefined || round.cycleNo === cycleNo)
    .reduce((highest, round) => Math.max(highest, round.roundNo), 0);
}

/** What the loop does with an objection, given the rounds already spent on its section and check. */
export type Move =
  /** Ask the author for a revision; the row it writes carries this round number. */
  | { kind: "revise"; roundNo: number; cycleNo: number }
  /**
   * Stop revising. Write the surfacing row with the author's position for the
   * section as it stands — the latest round the document kept or held, and null
   * where no round of this cycle holds one.
   */
  | { kind: "surface"; roundNo: number; cycleNo: number; authorPosition: string | null }
  /** The question is already open. The human owns it, and nothing more is written. */
  | { kind: "closed" };

/**
 * The cap. Two revisions for a check on a section; the third objection surfaces;
 * after that the question is the human's, and an objection on it writes nothing
 * — until the human rewrites the section, which opens the next cycle and starts
 * the count again (AA1).
 */
export function nextMove(
  rounds: readonly StoredRound[],
  sectionId: string,
  checkId: string,
  baseSectionHash: string | null,
): Move {
  const cycleNo = currentCycle(rounds, sectionId, checkId, baseSectionHash);
  const mine = forKey(rounds, sectionId, checkId).filter((round) => round.cycleNo === cycleNo);
  const count = roundCount(mine, sectionId, checkId, cycleNo);

  if (count >= SURFACING_ROUND || mine.some((round) => round.outcome === "surfaced")) {
    return { kind: "closed" };
  }
  if (count < MAX_REFINEMENTS) return { kind: "revise", roundNo: count + 1, cycleNo };

  // The position the document as it stands was written under: the latest round
  // whose revision the document kept or held. A refused revision is not in the
  // document, so its position is used only when no round's was, and a cycle
  // whose rounds hold none surfaces with none.
  const byRound = [...mine].sort((a, b) => b.roundNo - a.roundNo);
  const standing = byRound.find((round) => round.outcome === "revised" || round.outcome === "held");
  return {
    kind: "surface",
    roundNo: count + 1,
    cycleNo,
    authorPosition: (standing ?? byRound[0]!).authorPosition,
  };
}
