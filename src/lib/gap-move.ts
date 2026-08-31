/**
 * What happened to a gap someone tried to move — product-spec.md §5, move 3.
 *
 * A closed set of tokens, shared by three layers that must agree: the database
 * functions return one, the server action puts one in the URL, and the item page
 * maps one to a translated sentence.
 *
 * **The set is split by move, because one token can mean two different things.**
 * `accept_gap` and `reopen_gap` both answer `not-decider`, and "accepting a Must
 * is the Decider's call" said to someone who pressed *reopen* names a move they
 * did not make. So the intent travels with the outcome, the two are validated as
 * a pair, and `t.item.gapMove` is keyed by move first. Keeping each move's
 * outcomes in a `const` tuple rather than a bare union is what makes those
 * dictionaries exact `Record`s — the compiler lists every sentence still missing
 * the day TR and NL arrive, and refuses to demand one for a pair the database
 * cannot produce (there is no reopen that answers `reason-required`).
 *
 * **These are kinds, not messages.** CLAUDE.md: "a failure's `detail` string is
 * a diagnostic for the log and the developer, never surface copy. A surface that
 * shows a failure maps its *kind* to a translated string." This is that kind.
 * Nothing the database says ever reaches a person.
 */

/** The two moves §5 gives a human over an existing gap. Move 1 and 2 are Phase 3. */
export const GAP_INTENTS = ["accept", "reopen"] as const;

export type GapIntent = (typeof GAP_INTENTS)[number];

export function isGapIntent(value: unknown): value is GapIntent {
  return typeof value === "string" && (GAP_INTENTS as readonly string[]).includes(value);
}

/** Everything `accept_gap` can answer, plus the query layer's own `unavailable`. */
export const ACCEPT_OUTCOMES = [
  /** The debt is now named. */
  "accepted",
  /** Nothing was written; the field needs filling in. */
  "reason-required",
  /** Likewise — the note is bounded at 2000, like `gap.evidence`. */
  "reason-too-long",
  /** No such gap, or none this person may see. The two are deliberately one answer. */
  "not-found",
  /** It stopped being open between the read and the write. */
  "not-open",
  /** §14: a handover-blocking gap is the Decider's call, or an Owner's. */
  "not-decider",
  /** §14: a Developer authors artifacts and a Viewer reads. Neither settles a gap. */
  "not-permitted",
  /**
   * The one token the database never returns.
   *
   * Produced by the query layer when the RPC throws — a genuine failure rather
   * than one of §5's outcomes. The thrown message is logged and never rendered.
   */
  "unavailable",
] as const;

/** Everything `reopen_gap` can answer. No reason, so no reason to complain about. */
export const REOPEN_OUTCOMES = [
  /** The name came off it again. */
  "reopened",
  "not-found",
  /** It stopped being accepted between the read and the write. */
  "not-accepted",
  "not-decider",
  "not-permitted",
  "unavailable",
] as const;

export type AcceptOutcome = (typeof ACCEPT_OUTCOMES)[number];
export type ReopenOutcome = (typeof REOPEN_OUTCOMES)[number];
export type GapMoveOutcome = AcceptOutcome | ReopenOutcome;

/** Which outcomes belong to which move, for the guard below. */
const OUTCOMES: Record<GapIntent, readonly string[]> = {
  accept: ACCEPT_OUTCOMES,
  reopen: REOPEN_OUTCOMES,
};

/** The outcome type a given move answers with. */
export type OutcomeOf<I extends GapIntent> = I extends "accept" ? AcceptOutcome : ReopenOutcome;

/**
 * Whether an unknown value is one of *this move's* tokens.
 *
 * Used on both untrusted edges: the search params a person can type by hand, and
 * the string the database returned. Validating the pair rather than the token
 * alone is what keeps `?intent=reopen&move=reason-required` — a sentence no
 * reopen can produce — off the page. A value that fails this renders nothing at
 * all: fail closed, with no fallback sentence, so a crafted URL has no path to
 * putting text on the page. The token is only ever a lookup key; it is never
 * itself displayed.
 */
export function isOutcomeOf<I extends GapIntent>(intent: I, value: unknown): value is OutcomeOf<I> {
  return typeof value === "string" && OUTCOMES[intent].includes(value);
}

/**
 * One move's answer, as the URL reports it back to the page.
 *
 * `gapId` is nullable because **a submission that named no gap still gets a
 * sentence.** §12 has no copy for a silent no-op, and a form that arrived
 * without a gap id — or one whose gap answered `not-found` — has nothing on the
 * page to speak for it. The page renders those itself, at the top, with the
 * same `MoveMessage` the gap card uses.
 *
 * The third variant is the submission that carried no readable move at all, so
 * there is no intent to attribute a sentence to. It can only arrive from a
 * hand-written POST, and it still says something rather than nothing.
 */
export type GapMoveReport =
  | { intent: "accept"; kind: AcceptOutcome; gapId: string | null }
  | { intent: "reopen"; kind: ReopenOutcome; gapId: string | null }
  | { intent: null; kind: "unreadable"; gapId: null };

/** A report that names a gap — the shape `GapMoves` is handed. */
export type GapMoveClaim = Extract<GapMoveReport, { intent: GapIntent }>;

/** The `move` param for a submission that carried no move to report on. */
export const GAP_MOVE_UNREADABLE = "unreadable";

/**
 * The three search params, read as one fact — or as nothing.
 *
 * Fail closed at every step: an unreadable intent, an outcome that belongs to
 * the other move, or a `gap` that is not a string all render no sentence rather
 * than a wrong one.
 */
export function readGapMove(intent: unknown, kind: unknown, gapId: unknown): GapMoveReport | null {
  if (kind === GAP_MOVE_UNREADABLE) return { intent: null, kind: GAP_MOVE_UNREADABLE, gapId: null };
  if (!isGapIntent(intent)) return null;

  const gap = typeof gapId === "string" && gapId.length > 0 ? gapId : null;

  if (intent === "accept" && isOutcomeOf("accept", kind)) {
    return { intent, kind, gapId: gap };
  }
  if (intent === "reopen" && isOutcomeOf("reopen", kind)) {
    return { intent, kind, gapId: gap };
  }
  return null;
}
