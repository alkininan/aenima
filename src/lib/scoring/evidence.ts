/**
 * Evidence — product-spec.md §1 law 3, "evidence or nothing: every score, flag,
 * and suggestion expands into the exact quoted gap".
 *
 * Two jobs, both code rather than judgment (§12's code node law): checking that
 * a quote is really in the artifact, and rendering the three parts of a failure
 * into the one sentence a gap holds. Neither names a rubric or reads a check.
 *
 * **Why the check exists at all.** A model asked for a quote will sometimes
 * produce a sentence the artifact *should* have contained, or tidy the one it
 * did. Either way the gap then cites something nobody wrote, and a person who
 * opens the meter to see the evidence finds a fabrication with a check id
 * attached. A score that cannot be interrogated does not ship, and one whose
 * evidence is invented is worse than no score: it costs trust that a missing
 * number does not.
 */

/**
 * The comparison form of a piece of text.
 *
 * Whitespace and typography are normalized and **nothing else**. Line wrapping
 * differs between what a model echoes and what the source holds; curly quotes,
 * apostrophes and dashes survive a round trip through a model inconsistently,
 * and an em dash that came back as a hyphen is the same characters as far as a
 * reader is concerned. Every word still has to match exactly — this is the line
 * between forgiving a re-wrap and accepting a paraphrase, and it is deliberately
 * drawn tight enough that a rewritten sentence fails.
 *
 * Case is **not** normalized. "MUST NOT" and "must not" are different claims in
 * a specification, and a quote that changes one into the other has changed what
 * the artifact says.
 *
 * **NFC, never NFKC**, and the K is the whole point. Canonical normalization
 * composes accents — `e` + U+0301 and a precomposed `é` are the same letter, and
 * which one arrives depends on the keyboard that typed the artifact. *Compatibility*
 * normalization is a different operation wearing a similar name: it rewrites
 * characters into other characters. Under NFKC `10⁵` becomes `105`, `m²` becomes
 * `m2`, `½` becomes `1⁄2`, `№` becomes `No` and `Ⅳ` becomes `IV` — so a model
 * that retyped a superscript as a digit would have its quote verified against a
 * number four orders of magnitude away from the one the PRD wrote, and the gap
 * would cite a sentence nobody wrote. That is the exact failure §1 law 3 refuses,
 * arriving through the guard meant to prevent it. `normalizeForQuote.test` pins
 * all five pairs.
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFC")
    .replaceAll(/[‘’‛′]/gu, "'")
    .replaceAll(/[“”‟″]/gu, '"')
    .replaceAll(/[‐-―−]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** Whether a quote occurs in the artifact it claims to come from. */
export function quoteOccursIn(quote: string, artifactText: string): boolean {
  const needle = normalizeForQuote(quote);
  if (needle.length === 0) return false;
  return normalizeForQuote(artifactText).includes(needle);
}

export type EvidenceParts = {
  requirementId: string | null;
  quote: string | null;
  note: string;
};

/**
 * A failure's three parts as the one string `gap.evidence` holds.
 *
 * §5's own example is the format: `MN-2: 'nearby' — same venue, or within
 * 100 m? Two readings possible.` — the requirement id as the place, the quote
 * in single quotes, the reading after an em dash. Each part drops out when it
 * is absent, so an absence failure with no requirement id renders as the note
 * alone rather than as punctuation around a hole.
 *
 * The parts are stored separately on `scoring_check_result`; this is the
 * rendering for the column that holds one string. One function, so two
 * surfaces cannot render the same failure two ways.
 */
export function renderEvidence(parts: EvidenceParts): string {
  const note = parts.note.trim();
  const quote = parts.quote?.trim();
  const requirementId = parts.requirementId?.trim();

  const head = requirementId ? `${requirementId}: ` : "";
  const body = quote ? `'${collapse(quote)}' — ${note}` : note;

  return `${head}${body}`;
}

/**
 * A quote on one line, and short enough to sit in a sentence.
 *
 * `gap.evidence` is capped at 2000 characters by its own constraint, and a
 * multi-paragraph quote rendered raw would push a real reading out of the
 * column. The elision is marked, so a reader can tell a trimmed quote from a
 * short one — the full text stays on `scoring_check_result.quote`.
 */
const RENDERED_QUOTE_LIMIT = 300;

function collapse(quote: string): string {
  const single = quote.replaceAll(/\s+/gu, " ").trim();
  return single.length <= RENDERED_QUOTE_LIMIT
    ? single
    : `${single.slice(0, RENDERED_QUOTE_LIMIT).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* What a column will actually accept                                         */
/* -------------------------------------------------------------------------- */

/**
 * The three parts, bounded to what the schema holds — applied at read time, in
 * `readAnswer`, before any of it reaches a statement.
 *
 * **An over-long answer is compliance, not corruption.** The protocol asks for
 * a note of one or two sentences and a quote of the passage the gap lives in;
 * a model that answers at length has done nothing wrong, and the verdict it
 * reached is still the verdict. Letting that abort the write would throw away a
 * whole run — every other check's verdict with it — over the shape of one
 * sentence, after the provider was already called and billed. So the parts are
 * clipped to fit and the clipping is recorded (`readAnswer` returns the check
 * ids, `writeRun` puts them in the ledger), which is the honest trade: the
 * verdict survives, and the record says the evidence was shortened.
 *
 * The numbers come from the columns, not from taste:
 *
 * - `STORED_QUOTE_LIMIT` is `scoring_check_result_quote_len`, 2000.
 * - `REQUIREMENT_ID_LIMIT` is a `MN-2`-shaped label; 120 matches the check-id
 *   constraint beside it and is already far past any real one.
 * - `NOTE_LIMIT` is what leaves `gap.evidence` room for the rest of the
 *   sentence: 120 + 2 for the head, 300 + 5 for the collapsed quote and its
 *   punctuation, 1000 for the note — 1427 against a cap of 2000.
 */
export const STORED_QUOTE_LIMIT = 2000;
export const REQUIREMENT_ID_LIMIT = 120;
export const NOTE_LIMIT = 1000;

/**
 * `text` cut to `limit`, and whether cutting happened.
 *
 * The ellipsis is inside the budget rather than added to it, so the result is
 * never longer than the column — and it is marked for the same reason
 * `collapse` marks its own: a reader has to be able to tell a shortened
 * reading from a terse one.
 */
export function clip(text: string, limit: number): { text: string; clipped: boolean } {
  if (text.length <= limit) return { text, clipped: false };
  return { text: `${text.slice(0, limit - 1).trimEnd()}…`, clipped: true };
}
