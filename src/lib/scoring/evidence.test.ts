import { describe, expect, it } from "vitest";

import {
  NOTE_LIMIT,
  REQUIREMENT_ID_LIMIT,
  STORED_QUOTE_LIMIT,
  clip,
  normalizeForQuote,
  quoteOccursIn,
  renderEvidence,
} from "./evidence";

const ARTIFACT = `## Stories

**GM-2 — Ghost mode ends when I leave.**
WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.

The count is rounded to the nearest five whenever the difference
would be inferable.`;

describe("quoteOccursIn", () => {
  it("finds a quote that is really there", () => {
    expect(
      quoteOccursIn(
        "WHEN the member leaves the venue THE SYSTEM SHALL turn ghost mode off.",
        ARTIFACT,
      ),
    ).toBe(true);
  });

  it("forgives a re-wrap, because line breaks are not content", () => {
    // A model echoing a sentence rarely echoes the source's line width.
    expect(
      quoteOccursIn("The count is rounded to the nearest five whenever the difference", ARTIFACT),
    ).toBe(true);
  });

  it("forgives typography a round trip changes", () => {
    expect(quoteOccursIn("‘nearby’ — same venue", "'nearby' - same venue, or within 100 m?")).toBe(
      true,
    );
  });

  it("refuses a paraphrase", () => {
    // The line this whole function draws: a re-wrap is the same words, a
    // paraphrase is not. §1 law 3 — a failure whose quote is invented is worse
    // than no score, because it costs trust a missing number does not.
    expect(quoteOccursIn("The system turns ghost mode off when the member leaves", ARTIFACT)).toBe(
      false,
    );
  });

  it("refuses a sentence the artifact never contained", () => {
    expect(quoteOccursIn("Ghost mode expires after two hours.", ARTIFACT)).toBe(false);
  });

  it("keeps case, because MUST NOT and must not are different claims", () => {
    expect(quoteOccursIn("the system shall turn ghost mode off", ARTIFACT)).toBe(false);
  });

  it("refuses an empty quote", () => {
    expect(quoteOccursIn("   ", ARTIFACT)).toBe(false);
  });
});

describe("normalizeForQuote", () => {
  it("collapses whitespace and leaves words alone", () => {
    expect(normalizeForQuote("  two   words\nhere ")).toBe("two words here");
  });

  it("composes accents, which is the whole of what NFC buys", () => {
    // `e` + U+0301 against a precomposed `é`. Which one arrives depends on the
    // keyboard that typed the artifact, and they are the same letter.
    expect(normalizeForQuote("mekan\u0131n ye\u0301ri")).toBe(
      normalizeForQuote("mekan\u0131n yéri"),
    );
  });
});

/**
 * The guard's outer edge — compatibility normalization, which NFKC would apply
 * and NFC does not.
 *
 * Each pair is a character the artifact actually contains against the ASCII a
 * model would type in its place. **Every one must fail**: NFKC folds them
 * together, and folding them together means a gap citing `105` where the PRD
 * wrote `10⁵` passes the fabrication guard and reaches a human as evidence. §1
 * law 3 — an invented quote is worse than no score.
 *
 * This is the docstring's promise ("whitespace and typography, and nothing
 * else") as an assertion rather than an intention.
 */
describe("normalizeForQuote — compatibility folds are not typography", () => {
  const folded = [
    ["10\u2075 active members", "105 active members", "superscript digit"],
    ["within 100 m\u00b2", "within 100 m2", "squared"],
    ["\u00bd hour to roll back", "1\u20442 hour to roll back", "vulgar fraction"],
    ["\u2116 4 in the list", "No 4 in the list", "numero sign"],
    ["\u2163. Rollout", "IV. Rollout", "roman numeral"],
  ] as const;

  for (const [artifact, retyped, what] of folded) {
    it(`refuses a ${what} retyped as ASCII`, () => {
      expect(quoteOccursIn(retyped, artifact)).toBe(false);
      // And the artifact's own text still verifies against itself, so the
      // assertion above is the guard being strict rather than being broken.
      expect(quoteOccursIn(artifact, artifact)).toBe(true);
    });
  }
});

/**
 * The markdown fold — a follow-up on this file's own guard, not a new ticket.
 *
 * The artifacts are markdown and `renderArtifact` hands the model the source, so
 * a model shown `**on the server only**` quotes back `on the server only`. The
 * fixture is the shape of a real spec: `sample-juno-feature.md` carries 21 bold
 * spans across 27 lines, which is normal for a spec anyone writes.
 */
const MARKDOWN = `### Location — asked once, never again

- Whether the two people were within ~50 m of each other is computed **on the
  server only** — never displayed, never queryable — to time the confirmation
  prompt and to catch fraud.
- Scheduling is locked until the chat has **5+ messages from each person**.

*A location-based dating app built on scarcity, not swiping.* The card only
*displays* the district, never the address.

The event \`fast_path_used\` fires once. Access lives in \`src/db/queries/*\` per
CLAUDE.md, and the token block opens with /* surfaces */ above the ramp.`;

describe("quoteOccursIn — emphasis is typesetting, not content", () => {
  it("verifies a quote that spans a bold marker", () => {
    // The reported failure, verbatim: run five of six on a five-page internal
    // spec died here, after the provider was called and billed, because the
    // model quoted prose from a line containing bold.
    expect(
      quoteOccursIn("is computed on the server only — never displayed, never queryable", MARKDOWN),
    ).toBe(true);
  });

  it("verifies a quote that emphasizes a different span than the source", () => {
    // A model that echoes markers but puts them somewhere else. Quoting the
    // source's own markers back verbatim would be a plain substring of the
    // source and would pass with no fold at all — this moves them, so only the
    // fold reconciles the two sides.
    expect(quoteOccursIn("is computed on the **server only** — never displayed", MARKDOWN)).toBe(
      true,
    );
  });

  it("verifies a quote that spans an inline-code span", () => {
    expect(quoteOccursIn("The event fast_path_used fires once.", MARKDOWN)).toBe(true);
  });

  it("verifies a quote that spans an italic span", () => {
    // The markers have to sit *inside* the quote for this to test the fold —
    // a quote that merely sits within an italic span is a substring of the
    // source either way, and would pass with no fold at all.
    expect(quoteOccursIn("The card only displays the district, never the address.", MARKDOWN)).toBe(
      true,
    );
  });

  it("verifies a quote carrying a lone asterisk that is content", () => {
    // A `*` followed by a space cannot open emphasis, so a path and a CSS
    // comment reach the comparison with their asterisks intact. The character-
    // level pin is `leaves a lone asterisk that cannot open emphasis` below —
    // both sides fold through one function, so a fold that ate these asterisks
    // would eat them symmetrically and this assertion would not notice.
    expect(quoteOccursIn("Access lives in src/db/queries/* per CLAUDE.md", MARKDOWN)).toBe(true);
    expect(
      quoteOccursIn("the token block opens with /* surfaces */ above the ramp", MARKDOWN),
    ).toBe(true);
  });
});

describe("quoteOccursIn — what the markdown fold must still refuse", () => {
  it("refuses a paraphrase of a bolded sentence", () => {
    // Dropping the markers must not drop the words with them.
    expect(
      quoteOccursIn("the distance between the two people is worked out server-side", MARKDOWN),
    ).toBe(false);
  });

  it("refuses a reworded sentence", () => {
    expect(
      quoteOccursIn("Scheduling stays locked until each person has sent 5+ messages.", MARKDOWN),
    ).toBe(false);
  });

  it("refuses two real fragments stitched together", () => {
    // Both halves are in the document; the sentence is not.
    expect(quoteOccursIn("Scheduling is locked until the chat has never displayed", MARKDOWN)).toBe(
      false,
    );
  });

  it("refuses a sentence the document never contained", () => {
    expect(quoteOccursIn("Precise location is retained for 30 days.", MARKDOWN)).toBe(false);
  });

  it("keeps case inside a bold span", () => {
    expect(quoteOccursIn("5+ MESSAGES from each person", MARKDOWN)).toBe(false);
  });

  it("refuses a paraphrase of the sentence carrying a content asterisk", () => {
    // Test 5's other half: the flanking rule buys the asterisk through, and
    // buys nothing else.
    expect(quoteOccursIn("Access lives in src/db/queries/* per the constitution", MARKDOWN)).toBe(
      false,
    );
  });
});

/**
 * **The most important test in this file.**
 *
 * A cold session once found NFKC inside this exact function: `10⁵` folded to
 * `105`, and a gap citing a number four orders of magnitude from the one the PRD
 * wrote would have passed the guard and reached a human as evidence. That hole
 * is closed. This test exists because **loosening a guard is how a closed hole
 * reopens** — the markdown fold is the first widening this function has taken
 * since, and the thing to prove is not that bold now folds but that nothing
 * else came with it.
 *
 * A compatibility fold and an emphasis fold are different in kind: NFKC changed
 * what a sentence said, `**` changes only how it was typeset. That distinction
 * is the whole licence for the markdown fold, so it is asserted here, inside
 * the construct that was widened, rather than trusted from the docstring.
 *
 * The negative check for this test is reintroducing **NFKC**, not breaking the
 * italic rule. The claim is "the fold did not reopen NFKC", so NFKC itself is
 * the defect that has to make it red.
 */
describe("normalizeForQuote — the markdown fold did not reopen NFKC", () => {
  const folded = [
    ["10⁵ active members", "105 active members", "superscript digit"],
    ["within 100 m²", "within 100 m2", "squared"],
    ["½ hour to roll back", "1⁄2 hour to roll back", "vulgar fraction"],
    ["№ 4 in the list", "No 4 in the list", "numero sign"],
    ["Ⅳ. Rollout", "IV. Rollout", "roman numeral"],
  ] as const;

  for (const [artifact, retyped, what] of folded) {
    it(`still refuses a ${what} retyped as ASCII inside a bold span`, () => {
      const bolded = `The cap is **${artifact}** at launch.`;

      // The emphasis fold reaches this text and the compatibility fold does not.
      expect(quoteOccursIn(`The cap is ${retyped} at launch.`, bolded)).toBe(false);
      // And the artifact's own sentence verifies without its markers, so the
      // assertion above is the guard being strict rather than the fold being
      // broken.
      expect(quoteOccursIn(`The cap is ${artifact} at launch.`, bolded)).toBe(true);
    });
  }
});

describe("normalizeForQuote — the folds, and the order they run in", () => {
  it("folds a bold pair", () => {
    expect(normalizeForQuote("the **load-bearing** phrase")).toBe("the load-bearing phrase");
  });

  it("unwraps an inline-code span", () => {
    expect(normalizeForQuote("the `prd-1` check")).toBe("the prd-1 check");
  });

  it("folds an italic pair", () => {
    expect(normalizeForQuote("what it *displays* now")).toBe("what it displays now");
  });

  it("leaves an UNPAIRED ** alone, because deleting it would merge content", () => {
    // The defect a cold review found in the first version of this fold, which
    // deleted `**` unconditionally: `2**5` normalized to `25`, and the guard
    // would then certify `25` as a verbatim quote of `2**5`. That is `10⁵` →
    // `105` arriving through a different keystroke — the failure the NFKC
    // decision exists to refuse, reappearing inside the fold meant to be safe.
    expect(normalizeForQuote("The deck is capped at 2**5 cards.")).toBe(
      "The deck is capped at 2**5 cards.",
    );
    expect(quoteOccursIn("capped at 25 cards.", "The deck is capped at 2**5 cards.")).toBe(false);
  });

  it("never reads a code span's asterisks as emphasis delimiters", () => {
    // Two globs separated by a comma, not a space — the shape docs/schema.md
    // has. Flanking alone does not save them: the first `*` is followed by `,`
    // and the second preceded by `/`, both non-space, so they pair through the
    // comma and both vanish. Markdown does not read emphasis inside a code
    // span either, and protecting the span is what carries this.
    expect(normalizeForQuote("`src/db/queries/*`, `src/db/schema/*` and nowhere else")).toBe(
      "src/db/queries/*, src/db/schema/* and nowhere else",
    );
    // The false accept that would otherwise follow: two paths, minus the globs.
    expect(
      quoteOccursIn(
        "src/db/queries/, src/db/schema/ and nowhere else",
        "`src/db/queries/*`, `src/db/schema/*` and nowhere else",
      ),
    ).toBe(false);
  });

  it("runs bold before italic, or the italic rule chews a bold span's asterisks", () => {
    // With the order reversed the inner pair matches first and the survivors
    // are stray asterisks.
    expect(normalizeForQuote("**bold** and **more**")).toBe("bold and more");
  });

  it("folds a bold span that wraps across a source line break", () => {
    // A source wraps where a model does not, so the fold has to survive it.
    expect(normalizeForQuote("computed **on the\nserver only** now")).toBe(
      "computed on the server only now",
    );
  });

  it("does not pair a bold span across a blank line", () => {
    // A paragraph break ends emphasis in markdown, and a rule that crossed one
    // would pair two unrelated stray markers from different paragraphs — here
    // both are flanked, so nothing but the paragraph bound stops them, and
    // pairing them merges four digits into two numbers nobody wrote.
    expect(normalizeForQuote("The cap is 2**5 in Q1.\n\nThe ratio is 3**4 overall.")).toBe(
      "The cap is 2**5 in Q1. The ratio is 3**4 overall.",
    );
  });

  it("leaves a lone asterisk that cannot open emphasis", () => {
    expect(normalizeForQuote("src/db/queries/* per CLAUDE.md")).toBe(
      "src/db/queries/* per CLAUDE.md",
    );
    expect(normalizeForQuote("/* surfaces */")).toBe("/* surfaces */");
  });

  it("does not pair an italic span across a line break", () => {
    // Consecutive CSS comments, the shape docs/design-spec.md's token block
    // has. The `*` closing one comment is followed by `/` and the `*` opening
    // the next is preceded by `/`, so flanking alone would let them pair — and
    // a newline-tolerant rule would then eat both, rewriting what the block
    // says. Confining the span to one line is what stops it.
    expect(normalizeForQuote("/* app background */\n/* glass */")).toBe(
      "/* app background */ /* glass */",
    );
  });
});

/**
 * What is deliberately left, pinned so that widening it is a deliberate edit
 * rather than a drift. Each of these fails the test the fold has to pass:
 * dropping a URL or an identifier's underscores changes what the sentence says.
 */
describe("normalizeForQuote — deliberately not folded", () => {
  it("leaves links alone, because a URL is content", () => {
    // `[policy](a.md)` and `[policy](b.md)` folding to one string is two
    // sentences becoming one — the property this guard exists to prevent.
    expect(normalizeForQuote("see the [policy](a.md) for details")).toBe(
      "see the [policy](a.md) for details",
    );
    expect(quoteOccursIn("see the [policy](a.md)", "see the [policy](b.md)")).toBe(false);
  });

  it("leaves underscores alone, because they are inside identifiers here", () => {
    expect(normalizeForQuote("fast_path_used and juno_id_created")).toBe(
      "fast_path_used and juno_id_created",
    );
    expect(normalizeForQuote("_emphasis_")).toBe("_emphasis_");
  });

  it("leaves strikethrough, HTML and block syntax alone", () => {
    // The corpus's `<details>` and `<label>` are prose about elements, and a
    // quote is a sentence, so block syntax costs nothing on a substring test.
    expect(normalizeForQuote("native <details>/<summary>")).toBe("native <details>/<summary>");
    expect(normalizeForQuote("~~retired~~ tokens")).toBe("~~retired~~ tokens");
    expect(normalizeForQuote("## 10. Date & Meet")).toBe("## 10. Date & Meet");
  });

  it("leaves the separators an author typed as content", () => {
    // `·` and `~` are in none of the three typography classes, on purpose.
    expect(normalizeForQuote("24 hours · a cap ~50 m")).toBe("24 hours · a cap ~50 m");
  });
});

describe("clip", () => {
  it("leaves text that already fits, and says it did not cut", () => {
    expect(clip("short enough", 50)).toEqual({ text: "short enough", clipped: false });
  });

  it("cuts to the limit including the mark, so the column always accepts it", () => {
    const cut = clip("x".repeat(500), 100);

    expect(cut.clipped).toBe(true);
    // The ellipsis is inside the budget rather than added to it.
    expect(cut.text.length).toBeLessThanOrEqual(100);
    expect(cut.text.endsWith("…")).toBe(true);
  });

  it("keeps a clipped failure inside `gap.evidence`'s 2000 characters", () => {
    // The arithmetic the limits were chosen by, asserted rather than trusted:
    // the worst case a run can render is still comfortably inside the column.
    const worst = renderEvidence({
      requirementId: clip("R".repeat(400), REQUIREMENT_ID_LIMIT).text,
      quote: clip("q ".repeat(4000), STORED_QUOTE_LIMIT).text,
      note: clip("n ".repeat(4000), NOTE_LIMIT).text,
    });

    expect(worst.length).toBeLessThanOrEqual(2000);
  });
});

describe("renderEvidence", () => {
  it("renders §5's own example shape", () => {
    expect(
      renderEvidence({
        requirementId: "MN-2",
        quote: "nearby",
        note: "same venue, or within 100 m? Two readings possible.",
      }),
    ).toBe("MN-2: 'nearby' — same venue, or within 100 m? Two readings possible.");
  });

  it("drops the parts that are absent rather than punctuating a hole", () => {
    expect(
      renderEvidence({ requirementId: null, quote: null, note: "No kill line anywhere." }),
    ).toBe("No kill line anywhere.");
  });

  it("keeps the requirement id when the failure is an absence at a story", () => {
    expect(
      renderEvidence({ requirementId: "GM-3", quote: null, note: "No failure behavior." }),
    ).toBe("GM-3: No failure behavior.");
  });

  it("trims a quote too long for the column and marks the elision", () => {
    // `gap.evidence` is capped at 2000 characters; a multi-paragraph quote
    // rendered raw would push the reading out of the column that holds it.
    const long = "word ".repeat(200);
    const rendered = renderEvidence({ requirementId: null, quote: long, note: "Too much." });

    expect(rendered).toContain("…");
    expect(rendered.length).toBeLessThan(400);
    expect(rendered).toContain("Too much.");
  });
});
