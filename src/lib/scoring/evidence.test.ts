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
