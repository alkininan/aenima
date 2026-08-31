/**
 * What happened to a gap someone tried to move — product-spec.md §5, move 3.
 *
 * A closed set of tokens, shared by three layers that must agree: the database
 * functions return one, the server action puts one in the URL, and the item page
 * maps one to a translated sentence. Keeping them in a `const` tuple rather than
 * a bare union is what makes `t.item.gapMove` a `Record<GapMoveOutcome, string>`,
 * so the compiler lists every token still missing a sentence the day TR and NL
 * arrive.
 *
 * **These are kinds, not messages.** CLAUDE.md: "a failure's `detail` string is
 * a diagnostic for the log and the developer, never surface copy. A surface that
 * shows a failure maps its *kind* to a translated string." This is that kind.
 * Nothing the database says ever reaches a person.
 */

export const GAP_MOVES = [
  /** The debt is now named. */
  "accepted",
  /** The name came off it again. */
  "reopened",
  /** Nothing was written; the field needs filling in. */
  "reason-required",
  /** Likewise — the note is bounded at 2000, like `gap.evidence`. */
  "reason-too-long",
  /** No such gap, or none this person may see. The two are deliberately one answer. */
  "not-found",
  /** It stopped being open between the read and the write. */
  "not-open",
  /** It stopped being accepted between the read and the write. */
  "not-accepted",
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

export type GapMoveOutcome = (typeof GAP_MOVES)[number];

/**
 * Whether an unknown value is one of the tokens.
 *
 * Used on both untrusted edges: the search param a person can type by hand, and
 * the string the database returned. A value that fails this renders nothing at
 * all — fail closed, with no fallback sentence, so a crafted URL has no path to
 * putting text on the page. The token is only ever used as a lookup key; it is
 * never itself displayed.
 */
export function isGapMoveOutcome(value: unknown): value is GapMoveOutcome {
  return typeof value === "string" && (GAP_MOVES as readonly string[]).includes(value);
}

/** The two moves §5 gives a human over an existing gap. Move 1 and 2 are Phase 3. */
export const GAP_INTENTS = ["accept", "reopen"] as const;

export type GapIntent = (typeof GAP_INTENTS)[number];

export function isGapIntent(value: unknown): value is GapIntent {
  return typeof value === "string" && (GAP_INTENTS as readonly string[]).includes(value);
}
