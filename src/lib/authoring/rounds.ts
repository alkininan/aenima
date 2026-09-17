/**
 * Round state — product-spec.md §6's cap, as arithmetic over the ledger.
 *
 * "Hard limits from the self-correction research: **two refinement rounds per
 * section, maximum** — after two, the disagreement surfaces to the human as an
 * open question."
 *
 * T3.1's addendum settles the shape this reads. **One append-only row per
 * round**, unique on (artifact, section, check, round number): a refused
 * revision cuts no new version, so a row per version could not stay append-only,
 * and the round number is what makes each attempt its own row. **The count is
 * the highest round number for that key** — read from the rows, never counted
 * from the document, which cannot say how many times it was argued over (AC6).
 * **An open question is the round row marked surfaced**, not a table of its own.
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
 * written, so an over-long answer is turned away where it arrives rather than
 * refused by the database after a paid call.
 */
export const ROUND_TEXT_MAX = 2000;

/**
 * How a round ended.
 *
 * - `revised` — the author changed the section inside its scope; a new version was cut.
 * - `held` — the author returned the section unchanged: it kept its position,
 *   and there was nothing to version. The round is spent all the same.
 * - `refused` — the revision touched a section outside the objection's scope and
 *   the wall refused it; no version was cut, and the round is spent (AC2).
 * - `surfaced` — the third disagreement: no revision was asked for, the author's
 *   latest draft stays, and this row is the open question the human owns (AC3).
 */
export type RoundOutcome = "revised" | "held" | "refused" | "surfaced";

/** One round as the ledger holds it — the parts the cap and a surfacing read. */
export type StoredRound = {
  sectionId: string;
  checkId: string;
  roundNo: number;
  outcome: RoundOutcome;
  /** The critic's position: what it found unclear. */
  reason: string;
  /** Quoted from the section the critic read, and verified to be there. */
  evidence: string;
  /** The author's position: how its revision answered, or why it held. */
  authorPosition: string;
};

const sameKey = (round: StoredRound, sectionId: string, checkId: string) =>
  round.sectionId === sectionId && round.checkId === checkId;

/**
 * The round count for one section and one check: the highest round number the
 * ledger holds for them, and 0 when it holds none.
 *
 * The highest number rather than the number of rows. They agree whenever the
 * ledger is whole, and where they would not — a row the caller's read missed —
 * the highest number is the one the unique key will hold the next write to.
 */
export function roundCount(
  rounds: readonly StoredRound[],
  sectionId: string,
  checkId: string,
): number {
  return rounds
    .filter((round) => sameKey(round, sectionId, checkId))
    .reduce((highest, round) => Math.max(highest, round.roundNo), 0);
}

/** What the loop does with an objection, given the rounds already spent on its section and check. */
export type Move =
  /** Ask the author for a revision; the row it writes carries this round number. */
  | { kind: "revise"; roundNo: number }
  /**
   * Stop revising. Write the surfacing row with the author's position for the
   * section as it stands — the latest round the document kept or held.
   */
  | { kind: "surface"; roundNo: number; authorPosition: string }
  /** The question is already open. The human owns it, and nothing more is written. */
  | { kind: "closed" };

/**
 * The cap. Two revisions for a check on a section; the third objection surfaces;
 * after that the question is the human's, and an objection on it writes nothing.
 */
export function nextMove(rounds: readonly StoredRound[], sectionId: string, checkId: string): Move {
  const mine = rounds.filter((round) => sameKey(round, sectionId, checkId));
  const count = roundCount(mine, sectionId, checkId);

  if (count >= SURFACING_ROUND || mine.some((round) => round.outcome === "surfaced")) {
    return { kind: "closed" };
  }
  if (count < MAX_REFINEMENTS) return { kind: "revise", roundNo: count + 1 };

  // The position the document as it stands was written under: the latest round
  // whose revision the document kept or held. A refused revision is not in the
  // document, so its position is used only when no round's was.
  const byRound = [...mine].sort((a, b) => b.roundNo - a.roundNo);
  const standing = byRound.find((round) => round.outcome === "revised" || round.outcome === "held");
  return {
    kind: "surface",
    roundNo: count + 1,
    authorPosition: (standing ?? byRound[0]!).authorPosition,
  };
}
