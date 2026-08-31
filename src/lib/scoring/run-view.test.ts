import { describe, expect, it } from "vitest";

import { composeRunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

/**
 * §1 law 3, as arithmetic and ordering — the composition behind T2.4's meter.
 *
 * The run below is Ghost mode's, from the marking scheme in docs/build-log.md:
 * no list surface, network-dependent, user-to-user. `prd-15` leaves the
 * denominator, the safety layer's `prd-20` enters it, and 99 is what they add
 * up to.
 */

const NETWORK = "network-dependent-surface";
const SAFETY = "user-to-user-or-location";

type Row = StoredRunInput["results"][number];

const passed = (checkId: string, tag: Row["tag"], points: number): Row => ({
  checkId,
  tag,
  points,
  passed: true,
  requirementId: null,
  quote: null,
  note: null,
});

const unclear = (checkId: string, tag: Row["tag"], points: number, parts: Partial<Row>): Row => ({
  checkId,
  tag,
  points,
  passed: false,
  requirementId: null,
  quote: null,
  note: "This section was unclear.",
  ...parts,
});

const run = (overrides: Partial<StoredRunInput> = {}): StoredRunInput => ({
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: "2026-08-26T18:48:58.000Z",
  nextScoringAttemptAt: null,
  conditionsMet: [NETWORK, SAFETY],
  earned: 66,
  denominator: 99,
  results: [
    // Deliberately out of pack order, and lexicographically misleading: the
    // database returns these unordered and `prd-10` sorts before `prd-2`.
    passed("prd-2", "should", 3),
    unclear("prd-10", "must", 10, { requirementId: "GM-4", quote: "GM-4 is prose." }),
    passed("prd-14", "must", 8),
    passed("prd-16", "must", 6),
    passed("prd-20", "must", 5),
    passed("prd-1", "should", 5),
  ],
  ...overrides,
});

describe("composeRunView", () => {
  /**
   * §8's expansion is "every applicable check, in pack order". The stored rows
   * carry no order and `check_id` sorts `prd-10` before `prd-2`, so an
   * unsorted list would open with check 10.
   */
  it("restores pack order, not the order the rows arrived in", () => {
    const ids = composeRunView(featurePrdPack, run()).checks.map((check) => check.checkId);

    expect(ids).toEqual(["prd-1", "prd-2", "prd-10", "prd-14", "prd-15", "prd-16", "prd-20"]);
  });

  /**
   * AC3: a not-asked check sits where the rubric put it, between 14 and 16 —
   * which is where someone looking for check 15 goes. Appending them all to the
   * end would make the list read as a run followed by a footnote.
   */
  it("puts a not-asked check in its rubric position, carrying the condition that failed", () => {
    const view = composeRunView(featurePrdPack, run());
    const fifteen = view.checks.find((check) => check.checkId === "prd-15");

    expect(view.checks.indexOf(fifteen!)).toBe(4);
    expect(fifteen).toMatchObject({
      state: "not-asked",
      tag: "must",
      points: 6,
      condition: "The feature renders a list, so it has empty and first-use states.",
    });
  });

  // The other direction of §4, on the same run: the layer entered, so prd-20 is
  // a scored verdict rather than a not-asked line. One run proving both.
  it("shows a layer check that entered as asked, not as not-asked", () => {
    const twenty = composeRunView(featurePrdPack, run()).checks.find(
      (check) => check.checkId === "prd-20",
    );

    expect(twenty?.state).toBe("passed");
  });

  // §5: "Checks are binary with evidence." A pass has nothing to quote, so it
  // carries no evidence field at all rather than an empty one.
  it("gives a passing check no evidence", () => {
    const one = composeRunView(featurePrdPack, run()).checks.find(
      (check) => check.checkId === "prd-1",
    );

    expect(one).toEqual({
      checkId: "prd-1",
      prose: featurePrdPack.checks[0]!.prose,
      tag: "should",
      points: 5,
      state: "passed",
    });
  });

  /**
   * §5's own format: the requirement id as the place, the quote in single
   * quotes, the reading after an em dash. Rendered by `renderEvidence`, the one
   * function `gap.evidence` was written with — so the gap list and this list
   * cannot show one failure two ways.
   */
  it("renders a failure into §5's sentence", () => {
    const ten = composeRunView(featurePrdPack, run()).checks.find(
      (check) => check.checkId === "prd-10",
    );

    expect(ten).toMatchObject({
      state: "unclear",
      evidence: "GM-4: 'GM-4 is prose.' — This section was unclear.",
    });
  });

  /**
   * An *absence* failure — `prd-8` fails because no kill or rollback line
   * exists anywhere. There is nothing to quote and a null quote is legal, so
   * the sentence is the note alone rather than punctuation around a hole.
   */
  it("renders an absence failure as the note alone", () => {
    const view = composeRunView(
      featurePrdPack,
      run({
        results: [unclear("prd-8", "should", 4, { note: "No kill or rollback line." })],
      }),
    );

    expect(view.checks[0]).toMatchObject({
      state: "unclear",
      evidence: "No kill or rollback line.",
    });
  });

  /**
   * §5 versions rubrics like documents, and T2.3 copied `tag` and `points` onto
   * the row so a run stays priced by the rubric that produced it. A lookup
   * would re-price last month's run through this month's pack.
   */
  it("takes tag and points from the stored row, never from the pack", () => {
    const view = composeRunView(
      featurePrdPack,
      // prd-10 is a 10-point Must in the pack today. This run says otherwise.
      run({ results: [passed("prd-10", "should", 2)] }),
    );

    expect(view.checks[0]).toMatchObject({ tag: "should", points: 2 });
  });

  /**
   * A rubric that dropped or renamed a check leaves a real, scored verdict with
   * no sentence to show. It still counted toward the score, so dropping the line
   * would leave a list that does not explain the number above it.
   */
  it("keeps a verdict the current pack cannot name, with no prose and at the end", () => {
    const view = composeRunView(
      featurePrdPack,
      run({ results: [passed("prd-retired", "must", 4), passed("prd-1", "should", 5)] }),
    );

    expect(view.checks.map((check) => check.checkId)).toEqual(["prd-1", "prd-15", "prd-retired"]);
    expect(view.checks.at(-1)?.prose).toBeNull();
  });

  /**
   * §13 pairs colour with "the numeric value". A bar drawn at 66.67 beside a
   * label reading 67 has two numeric values, one of which nobody can see — so
   * the division happens once and everything downstream reads one number.
   */
  it("rounds the score exactly once", () => {
    expect(composeRunView(featurePrdPack, run()).score).toBe(67);
    expect(composeRunView(featurePrdPack, run({ earned: 58 })).score).toBe(59);

    // And the facts behind it are carried unrounded, because they are integers.
    expect(composeRunView(featurePrdPack, run())).toMatchObject({ earned: 66, denominator: 99 });
  });

  // §5 stamps provenance on every run for a reason: a number nobody can trace
  // is a number nobody can argue with.
  it("carries the provenance the run was stamped with", () => {
    expect(composeRunView(featurePrdPack, run()).provenance).toEqual({
      packId: "feature-prd",
      packVersion: "1.0.0",
      model: "claude-sonnet-5",
      scoredAt: "2026-08-26T18:48:58.000Z",
      nextScoringAttemptAt: null,
    });
  });
});
