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
 * Whitespace, typography and emphasis markers are normalized and **nothing
 * else** — three kinds of thing that describe how a sentence was set down
 * rather than what it says. Line wrapping differs between what a model echoes
 * and what the source holds; curly quotes, apostrophes and dashes survive a
 * round trip through a model inconsistently, and an em dash that came back as a
 * hyphen is the same characters as far as a reader is concerned; markdown's
 * emphasis markers are typesetting the model is not obliged to echo. Every word
 * still has to match exactly — this is the line between forgiving a re-wrap and
 * accepting a paraphrase, and it is deliberately drawn tight enough that a
 * rewritten sentence fails.
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
 *
 * **Emphasis markers are syntax, and go the way whitespace goes.** The artifacts
 * are markdown and `renderArtifact` hands the model the source, so a model shown
 * `**on the server only**` quotes back `on the server only` — and the guard,
 * comparing against the source, rejected the run. The rule that produced was
 * arbitrary from a reader's side: a quote wholly inside or wholly outside an
 * emphasis span verified, a quote that *spanned* one did not, so the longer and
 * more contextual quotes — the better ones — failed first.
 *
 * **This is a different category from the NFKC fold above, and the difference is
 * the whole licence for it.** NFKC changed what a sentence *said*: `10⁵` became
 * `105`, a number four orders of magnitude away. Removing an emphasis marker
 * changes only how the sentence was *typeset* — the words, and the characters
 * inside them, are the same either side of the fold. That is the test any future
 * fold has to pass, and it is not a general permission to loosen: a fold that
 * drops content — a link's URL, an identifier's underscores — fails it exactly
 * the way NFKC did.
 *
 * **A marker is only typesetting when it is really a delimiter, and that is why
 * the rules below are pairing rules rather than deletions.** A cold review of
 * the first version of this fold found `2**5` normalizing to `25`: an unpaired
 * `**` is literal text in markdown, deleting it merged two digits, and the guard
 * would then have certified `25` as a verbatim quote of `2**5`. That is `10⁵` →
 * `105` arriving through a different keystroke — the same failure §1 law 3
 * refuses, in the fold meant to be safe. Nothing here is deleted unless it is
 * half of a matched, flanked pair.
 *
 * **The scope came from measuring the corpus, not from the markdown spec.**
 * Counted across the two sample documents, the seed PRD and the three specs —
 * everything this guard can be pointed at — what they contain is 1207 bold
 * markers, 612 inline-code spans and 83 lone-asterisk pairs. What the fold below
 * actually matches is 592 bold pairs and 38 italic pairs: the 23 leftover bold
 * markers are unpaired, and 45 of the asterisk pairs are content that the
 * flanking rule and the code-span protection decline. Those gaps are the fold
 * working, not the fold missing. What they contain **none** of: links (0 — the
 * ticket asserted otherwise and the measurement disagreed), images, reference
 * links, autolinks, underscore emphasis, strikethrough, backslash escapes, and
 * fenced code blocks in any artifact that gets scored. A general markdown parser is a bigger dependency
 * than the problem.
 *
 * **A count chooses the scope; it never establishes the safety.** It says which
 * constructs are worth handling at all — it is why no link fold shipped — and it
 * says nothing about the document nobody has written yet, which `score:file`
 * takes by design. "No `2 ** 3` in any artifact" was a true fact about five
 * files and not a property of markdown, and it is how the deletions above got
 * shipped. Safety comes from the shape of the rules instead: they are pairing
 * rules, so they hold on text they have never seen. Anyone widening this brings
 * both — a count for the scope, and an argument that the new rule is safe on a
 * document that does not exist yet.
 *
 * - **Inline code is unwrapped, and protected.** `` `x` `` becomes `x`, and the
 *   emphasis rules never run over what was inside it — markdown does not read
 *   emphasis inside a code span either. This is what keeps
 *   `` `src/db/queries/*`, `src/db/schema/*` `` intact: those asterisks are code,
 *   so they are never delimiters, and without this the two pair through the
 *   comma between them and both disappear.
 * - **`**bold**` folds as a matched pair** whose inner edges are non-space,
 *   within a paragraph. Unpaired `**` is left, which is what `2**5` needs.
 * - **`*italic*` folds as a matched pair** whose inner edges are non-space, on
 *   one line.
 *
 * The non-space inner edge is the half of CommonMark's left/right-flanking rule
 * that a lone content asterisk fails — check the spec rather than guessing our
 * intent. It is not the whole of that rule, and it is not a markdown parser:
 * what carries the rest of the weight is protecting code spans, where this
 * corpus keeps its asterisks.
 *
 * **Deliberately left**, each for the NFKC reason rather than for lack of time:
 * links, because dropping a URL discards content and would fold `[policy](a.md)`
 * and `[policy](b.md)` into one string — two sentences becoming one is the
 * property this guard exists to prevent; underscore emphasis, because the
 * underscores in this corpus are inside identifiers (`fast_path_used`,
 * `workspace_id`) that the fold would corrupt; HTML tags, because the corpus's
 * `<details>` and `<label>` are prose *about* elements and stripping them would
 * delete words; block syntax and fences, which cost nothing because a quote is a
 * sentence and this is a substring test; and `·` and `~`, which the author
 * typed as content. If a link fold is ever needed the shape is *fold to the
 * visible text*, since that is what a model reading rendered prose echoes — the
 * answer is decided and waiting for its first real case.
 *
 * The order is load-bearing, and `evidence.test` asserts it rather than trusting
 * this comment: bold before italic, or the italic rule chews a bold span's inner
 * asterisks; the emphasis rules inside the code-span split, or a code span's
 * asterisks become delimiters; and all of it before the whitespace collapse, so
 * a bold span wrapped across a source line still folds and any double space a
 * removal leaves is cleaned up after.
 *
 * **What the line rules cost.** An italic pair is confined to one line and a
 * bold pair to one paragraph, because a rule that crossed those would pair the
 * stray asterisks of two consecutive CSS comments and rewrite what the block
 * says. The cost is that where a *source* wraps mid-span and a model's quote
 * does not, the two sides fold differently — build log q27.
 */
const CODE_SPAN = /(`[^`\n]+`)/gu;
const BOLD = /\*\*(\S|\S(?:(?!\n[ \t]*\n)[^*])*?\S)\*\*/gu;
const ITALIC = /\*(\S|\S[^*\n]*?\S)\*/gu;

export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFC")
    .replaceAll(/[‘’‛′]/gu, "'")
    .replaceAll(/[“”‟″]/gu, '"')
    .replaceAll(/[‐-―−]/gu, "-")
    .split(CODE_SPAN)
    .map((segment, i) =>
      // Odd indices are the captured code spans: unwrapped, never folded.
      i % 2 === 1 ? segment.slice(1, -1) : segment.replaceAll(BOLD, "$1").replaceAll(ITALIC, "$1"),
    )
    .join("")
    .replaceAll("`", "")
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
