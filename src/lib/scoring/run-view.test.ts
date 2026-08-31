import { describe, expect, it } from "vitest";

import { ITEM_GAPS, ITEM_RUN } from "@/app/dev/item-fixture";
import { composeRunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

/**
 * §1 law 3, as arithmetic and ordering — the composition behind T2.4's meter.
 *
 * The run below is Ghost mode's, from the marking scheme in docs/build-log.md:
 * no list surface, network-dependent, user-to-user. `prd-15` leaves the
 * denominator, the safety layer's `prd-20` enters it, and 99 is what they add
 * up to.
 *
 * **Both of those facts arrive as stored rows, not as a recomputation.** The
 * run carries its own not-asked rows (drizzle/0011); nothing here hands the
 * composer a condition list to re-derive them from, because that is precisely
 * what let a rubric edit change what an old run said it did not ask.
 */

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

/** The row `prd-15` leaves behind — §4's exclusion, as the run stored it. */
const NOT_ASKED_15 = {
  checkId: "prd-15",
  tag: "must" as const,
  points: 6,
  conditionWhen: "The feature renders a list, so it has empty and first-use states.",
};

const run = (overrides: Partial<StoredRunInput> = {}): StoredRunInput => ({
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: "2026-08-26T18:48:58.000Z",
  nextScoringAttemptAt: null,
  earned: 66,
  denominator: 99,
  notAsked: [NOT_ASKED_15],
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

  /**
   * **The defect this file exists to keep out.**
   *
   * The not-asked lines are what explain a denominator of 99, so they have to
   * be as durable as the 99. They used to be recomputed by calling
   * `excludedChecks(currentPack, run.conditionsMet)` at render time, which meant
   * a rubric edit could change what an old run said it did not ask — the page
   * explaining a stored number with a set that no longer produces it, and doing
   * it while reading perfectly.
   *
   * The run below stores a not-asked row for `prd-1`, a check that carries **no
   * `appliesWhen` at all** in the shipped pack and can therefore never be
   * excluded by any recomputation over any condition list. If the line renders,
   * it came off the stored row. If it does not, something is deriving again.
   */
  it("takes the not-asked lines from the run, never from the pack's conditions", () => {
    const view = composeRunView(
      featurePrdPack,
      run({
        results: [],
        notAsked: [
          {
            checkId: "prd-1",
            tag: "should",
            points: 5,
            conditionWhen: "A condition this pack no longer has.",
          },
        ],
      }),
    );

    expect(view.checks).toHaveLength(1);
    expect(view.checks[0]).toMatchObject({
      checkId: "prd-1",
      state: "not-asked",
      condition: "A condition this pack no longer has.",
      // Priced as the run priced it, like every other line.
      tag: "should",
      points: 5,
    });
  });

  /**
   * The other half of the same rule: a check the *current* pack would exclude
   * does not appear as not-asked unless the run said so. `prd-15` is excluded
   * whenever the list condition is absent, which is every call in this file —
   * so a composer still consulting the pack would put it back.
   */
  it("omits a check the pack would exclude when the run did not record it", () => {
    const view = composeRunView(featurePrdPack, run({ notAsked: [] }));

    expect(view.checks.map((check) => check.checkId)).not.toContain("prd-15");
  });

  /**
   * A retired rubric must not take a stored run down with it.
   *
   * `getPack` returns undefined for a pack id that no longer ships, and the page
   * used to route that to §10's hollow track — "connect AI to activate scoring",
   * which is a false sentence to someone holding a key and a stored run, and
   * which hid a number the run had already computed. The run renders with what
   * survives: score, verdicts, not-asked lines, provenance, and ids with no
   * prose.
   */
  it("renders a run whose pack no longer ships, on the ids alone", () => {
    const view = composeRunView(undefined, run());

    expect(view.score).toBe(67);
    expect(view.checks.every((check) => check.prose === null)).toBe(true);
    expect(view.checks.find((check) => check.checkId === "prd-10")).toMatchObject({
      state: "unclear",
      evidence: "GM-4: 'GM-4 is prose.' — This section was unclear.",
    });
    expect(view.checks.find((check) => check.checkId === "prd-15")).toMatchObject({
      state: "not-asked",
      condition: "The feature renders a list, so it has empty and first-use states.",
    });

    // No pack means no pack order, so the order falls back to the id — ugly and
    // **stable**, which is the property that matters. Without the tie-break
    // these would keep whatever order the database returned, and one stored run
    // would render two ways on two page loads.
    expect(view.checks.map((check) => check.checkId)).toEqual([
      "prd-1",
      "prd-10",
      "prd-14",
      "prd-15",
      "prd-16",
      "prd-2",
      "prd-20",
    ]);
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

/**
 * The `/dev/item` fixture, held to the reconciler.
 *
 * `/dev/item` is the only item page the browser tests can reach, so what it
 * stages is what `e2e/item.spec.ts` proves. A fixture pairing a gap with a run
 * that contradicts it stages a screen `/i/<key>` cannot produce, and every
 * assertion over it then measures the mock — which is the same objection that
 * keeps §8's `--success`-at-100 branch unwritten, and the shape of T2.2's
 * escalation bug: a test that passes because two things coincide in the fixture.
 *
 * `reconcileGaps` decides the pairing and its table is total, so this is
 * checkable rather than a matter of care:
 *
 * - a check the run **passed** may not carry an open gap — a pass closes one
 * - a check the run found **unclear** may not carry a closed gap — a failure
 *   with nothing settled raises one
 *
 * `accepted` and `excluded` are legal against either verdict, because a name on
 * a debt outranks what a re-score thinks (§1 law 7).
 */
describe("the /dev/item fixture", () => {
  const verdictFor = (checkId: string) =>
    ITEM_RUN.checks.find((check) => check.checkId === checkId)?.state;

  it("stages only gap and verdict pairings reconcileGaps could have written", () => {
    for (const gap of ITEM_GAPS) {
      const state = verdictFor(gap.checkId);
      // Every gap in the fixture names a check the run actually reached, or the
      // pairing question does not even arise.
      expect(state, `${gap.checkId} has no line in the run`).toBeDefined();

      if (gap.disposition === "open") {
        expect(state, `${gap.checkId} is open against a verdict that did not fail`).toBe("unclear");
      }
      if (gap.disposition === "closed") {
        expect(state, `${gap.checkId} is closed against a failing verdict`).not.toBe("unclear");
      }
    }
  });

  // The list the browser tests count. Three rows survive §13's narrowing, and
  // the two that do not are the ones that must not render.
  it("keeps one of every disposition, so the narrowing has something to narrow", () => {
    expect(ITEM_GAPS.map((gap) => gap.disposition).sort()).toEqual([
      "accepted",
      "closed",
      "excluded",
      "open",
      "open",
    ]);
  });
});
