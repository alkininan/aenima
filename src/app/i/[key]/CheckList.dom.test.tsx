import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";
import type { CheckLine } from "@/lib/scoring/run-view";

// An unclear check now carries §5's third move, which reaches the server action.
vi.mock("./actions", () => ({ settleGap: async () => {} }));

const { CheckList, noLongerApplicableByCheck } = await import("./CheckList");
type MoveableGap = import("./GapMoves").MoveableGap;

/** No gap for any check, which is every case but the two that test the move. */
const NO_GAPS = new Map<string, MoveableGap>();

/**
 * No gap closed by §4's engine — the ordinary case, and every test but the
 * three that are about one.
 */
const NO_CLOSURES = new Map<string, string>();

const t = getDictionary();

const passed = (checkId: string, prose = "Problem written without the solution"): CheckLine => ({
  checkId,
  prose,
  tag: "should",
  points: 5,
  state: "passed",
});

const unclear = (checkId: string, tag: CheckLine["tag"], evidence: string): CheckLine => ({
  checkId,
  prose: "Every story has testable GWT acceptance criteria",
  tag,
  points: 10,
  state: "unclear",
  evidence,
});

const notAsked = (checkId: string, condition: string): CheckLine => ({
  checkId,
  prose: "Empty / first-use states",
  tag: "must",
  points: 6,
  state: "not-asked",
  condition,
});

const LIST_CONDITION = "The feature renders a list, so it has empty and first-use states.";

/**
 * §1 law 3: "every score, flag, and suggestion expands into the exact quoted
 * gap. A number that cannot be interrogated does not ship."
 */
describe("CheckList", () => {
  it("gives a passing check its id, its prose and a word for what happened", () => {
    render(
      <CheckList
        checks={[passed("prd-1")]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.getByText("prd-1")).not.toBeNull();
    expect(screen.getByText("Problem written without the solution")).not.toBeNull();
    expect(screen.getByText(t.item.checkPassed)).not.toBeNull();
  });

  /**
   * §5: "a failure quotes the exact gap." The evidence is the body of a card,
   * not a detail behind a second disclosure — the expansion *is* the place a
   * person came to read it.
   */
  it("carries a failing check's quoted evidence, in §5's sentence", () => {
    const evidence = "GM-4: 'Members someone has blocked never see them.' — GM-4 is prose.";
    render(
      <CheckList
        checks={[unclear("prd-10", "must", evidence)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.getByText(evidence)).not.toBeNull();
    expect(screen.getByText(t.item.checkUnclear.must)).not.toBeNull();
  });

  /**
   * §12: "this section was unclear," never "test / fail / violation". The word
   * on a failing check is the product's voice, and it is the one a person reads
   * before they read the quote.
   */
  it("never says failed", () => {
    render(
      <CheckList
        checks={[unclear("prd-10", "must", "Something.")]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(document.body.textContent).not.toMatch(/fail|violation|error/i);
  });

  /**
   * **The polarity of a not-asked check.**
   *
   * `ApplicabilityCondition.when` is written affirmatively — "The feature
   * renders a list…" — and a check is not asked precisely because that is
   * *false* of this artifact. Rendering the condition bare would state the
   * opposite of the reason, and it would read perfectly while doing it, which
   * is what makes it worth a test rather than a comment.
   *
   * **The expected sentence is spelled out here rather than taken from `t`.**
   * Comparing the render to `t.item.checkNotAskedReason(...)` compares the
   * component to the very function that decides the polarity, so re-framing the
   * copy affirmatively — "Applies when: …" — changes both sides at once and the
   * test stays green through exactly the defect it is named for. Duplicating the
   * sentence is the cost of a copy rule being a rule: this test is the
   * specification for that string, and it is supposed to go red when it moves.
   */
  it("says the condition did NOT hold, never just what the condition is", () => {
    render(
      <CheckList
        checks={[notAsked("prd-15", LIST_CONDITION)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.checkNotAsked)).not.toBeNull();

    const line = screen.getByText(`Only asked when: ${LIST_CONDITION} That is not true here.`);
    expect(line).not.toBeNull();
    // The condition is quoted whole, and the frame around it says it is false.
    expect(line.textContent).toContain(LIST_CONDITION);
    expect(line.textContent).toMatch(/not true here/i);
  });

  // §4: a not-asked check is neither a pass nor a failure, and saying either
  // would put a verdict on a question nobody asked.
  it("shows a not-asked check as neither passed nor unclear", () => {
    render(
      <CheckList
        checks={[notAsked("prd-15", LIST_CONDITION)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.queryByText(t.item.checkPassed)).toBeNull();
    expect(screen.queryByText(t.item.checkUnclear.must)).toBeNull();
    expect(screen.queryByText(t.item.checkUnclear.should)).toBeNull();
  });

  /**
   * §8 (v2.15): "a bordered chip in a row must mean something, and what it
   * means there is a gap." One level down, the same rule: only an unclear check
   * carries a container, so the eye lands on the ones that need something.
   *
   * **This observes the container**, which is the only way the rule can fail
   * honestly. Counting occurrences of the word "Unclear" says nothing about
   * whether a pass is wearing a chip — put `<Chip>` around `checkPassed` and a
   * count of one is still a count of one. A container is a fill or an outline,
   * so that is what is read: every `Chip` tone in §8 carries a `bg-` or a
   * `border`, and the two plain labels carry neither.
   */
  it("puts a container on an unclear check and on nothing else", () => {
    render(
      <CheckList
        checks={[
          passed("prd-1"),
          unclear("prd-10", "must", "A reading."),
          notAsked("prd-15", LIST_CONDITION),
        ]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    const labelIn = (row: HTMLElement, text: string) => within(row).getByText(text);
    // A fill or an outline — §8's four gap-chip tones are three `bg-` and one
    // `border`, and nothing uncontained carries either.
    const contained = (node: HTMLElement) =>
      /(?:^|\s)(?:bg-|border(?:$|\s|-))/.test(node.className);

    expect(contained(labelIn(rows[1]!, t.item.checkUnclear.must))).toBe(true);
    expect(contained(labelIn(rows[0]!, t.item.checkPassed))).toBe(false);
    expect(contained(labelIn(rows[2]!, t.item.checkNotAsked))).toBe(false);

    // And the chip's own geometry sits on the unclear label alone: §8 gives a
    // chip a pill and 10px of horizontal padding, which is the shape of a
    // container rather than the colour of one.
    expect(labelIn(rows[1]!, t.item.checkUnclear.must).className).toContain("rounded-pill");
    expect(labelIn(rows[0]!, t.item.checkPassed).className).not.toContain("rounded-pill");
    expect(labelIn(rows[2]!, t.item.checkNotAsked).className).not.toContain("rounded-pill");
  });

  /**
   * §0 law 1: "Meters and gaps never render in Danger red." §0 law 2 reserves
   * Danger for destructive actions, validation errors and diff deletions. A
   * check nobody answered well is none of those.
   */
  it("uses no danger tone anywhere, on any state", () => {
    const { container } = render(
      <CheckList
        checks={[
          passed("prd-1"),
          unclear("prd-10", "must", "A reading."),
          unclear("prd-5", "should", "Another reading."),
          notAsked("prd-15", LIST_CONDITION),
        ]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(container.innerHTML).not.toMatch(/danger/);
  });

  /**
   * §8 tones an open Must `--warning` and an open Should neutral, because only
   * a Must blocks handover. The distinction has to survive into this list, or
   * an advisory finding reads as urgently as a blocking one.
   */
  it("tones an unclear Must warmly and an unclear Should neutrally", () => {
    const { container } = render(
      <CheckList
        checks={[unclear("prd-10", "must", "A."), unclear("prd-5", "should", "B.")]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    const must = within(rows[0]!).getByText(t.item.checkUnclear.must);
    const should = within(rows[1]!).getByText(t.item.checkUnclear.should);

    expect(must.className).toContain("warning");
    expect(should.className).not.toContain("warning");
    expect(container.innerHTML).not.toMatch(/danger/);
  });

  /**
   * A rubric that dropped or renamed a check leaves a scored verdict with no
   * sentence to show. The id is still true and the verdict still counted toward
   * the score, so the line stands on the id rather than vanishing from the list
   * that explains the number above it.
   */
  it("renders a line whose prose the pack no longer carries", () => {
    render(
      <CheckList
        checks={[{ ...passed("prd-retired"), prose: null }]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.getByText("prd-retired")).not.toBeNull();
    expect(screen.getByText(t.item.checkPassed)).not.toBeNull();
  });

  /**
   * **T2.5 restates this rather than deleting it.**
   *
   * §5's third move now exists, and reaches this list because §13's narrowing
   * keeps open Shoulds off the gap card — so for a Should this is the only
   * place the move is. But a check with no gap still offers nothing, which is
   * what this holds: the control follows the debt, not the check.
   */
  it("offers no control on a check that carries no gap", () => {
    render(
      <CheckList
        checks={[
          passed("prd-1"),
          unclear("prd-10", "must", "A."),
          notAsked("prd-15", LIST_CONDITION),
        ]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  /**
   * **The anchor a move redirects to, on the one surface that can carry it.**
   *
   * §13's narrowing files an open Should under the score, so `gapOutcomeHref`'s
   * `#gap-<id>` has no card to land on and this line takes it instead. A gap
   * that *does* have a card must not take it here as well: two elements sharing
   * an id makes the fragment mean whichever the browser reached first.
   */
  it("anchors the gap §13 files here, and leaves a carded gap's anchor alone", () => {
    const should: MoveableGap = {
      id: "g-should",
      checkId: "prd-8",
      tag: "should",
      disposition: "open",
      resolvedBy: null,
      resolutionNote: null,
    };
    const must: MoveableGap = {
      id: "g-must",
      checkId: "prd-10",
      tag: "must",
      disposition: "open",
      resolvedBy: null,
      resolutionNote: null,
    };

    const { container } = render(
      <CheckList
        checks={[unclear("prd-10", "must", "A."), unclear("prd-8", "should", "B.")]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={
          new Map([
            ["prd-8", should],
            ["prd-10", must],
          ])
        }
        noLongerApplicable={NO_CLOSURES}
        outcome={null}
      />,
    );

    // The open Should has nowhere else to be reached by name.
    expect(container.querySelector("#gap-g-should")).not.toBeNull();
    // The open Must is on the card, which is where its anchor lives.
    expect(container.querySelector("#gap-g-must")).toBeNull();
  });

  /** An accepted gap has a card too, so the expansion does not claim its id. */
  it("leaves a settled gap's anchor to the card that shows it", () => {
    const { container } = render(
      <CheckList
        checks={[unclear("prd-16", "must", "C.")]}
        t={t}
        itemKey="soc-12"
        noLongerApplicable={NO_CLOSURES}
        gapsByCheck={
          new Map<string, MoveableGap>([
            [
              "prd-16",
              {
                id: "g-accepted",
                checkId: "prd-16",
                tag: "must",
                disposition: "accepted",
                resolvedBy: { kind: "self" },
                resolutionNote: "For V1.",
              },
            ],
          ])
        }
        outcome={null}
      />,
    );

    expect(container.querySelector("#gap-g-accepted")).toBeNull();
  });

  /* ------------------------------------------------------------------ */
  /* §4's closure, surfaced — build log open question 14 (T2.10)          */
  /* ------------------------------------------------------------------ */

  /**
   * **The one closure a person might disagree with.**
   *
   * A check leaving the denominator closes the gap it had raised, and that is
   * the engine making a judgment about the artifact rather than observing that
   * a check now passes. The ledger has recorded it since T2.3 and nothing has
   * shown it. It shows here, on the line that already says which condition
   * stopped holding, with §5's exact quoted gap and a question.
   */
  it("shows the gap a not-asked check closed, quoted, and asks about it", () => {
    const evidence = "MN-2: 'nearby' — same venue, or within 100 m? Two readings possible.";
    render(
      <CheckList
        checks={[notAsked("prd-15", LIST_CONDITION)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={new Map([["prd-15", evidence]])}
        outcome={null}
      />,
    );

    expect(screen.getByText(evidence)).not.toBeNull();
    expect(screen.getByText(t.item.checkNotAskedClosedGap)).not.toBeNull();

    // AC1 says *beneath* the condition line, and the order is the reading:
    // the condition explains why the check left, the quote is what left with
    // it, and the question is asked once both have been read.
    const line = screen.getByText("prd-15").closest("li");
    expect(line?.textContent).toBe(
      `prd-15Empty / first-use statesNot asked` +
        `Only asked when: ${LIST_CONDITION} That is not true here.` +
        `${evidence}${t.item.checkNotAskedClosedGap}`,
    );
  });

  /**
   * §0 law 1 and the ticket's one rule: welcoming, never alarming. The notice
   * is a question about a correct machine decision, not a report of a fault —
   * so the vocabulary a failure would use is absent, as it is on the rest of
   * this list.
   */
  it("asks rather than warns", () => {
    render(
      <CheckList
        checks={[notAsked("prd-15", LIST_CONDITION)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={new Map([["prd-15", "Something that was open."]])}
        outcome={null}
      />,
    );

    // The notice's own words, which is the thing this ticket added — the
    // page-wide scan below would also go red on a label it did not write.
    expect(t.item.checkNotAskedClosedGap).not.toMatch(/fail|violation|error|warning/i);
    expect(t.item.checkNotAskedClosedGap).toMatch(/\?$/);
    expect(document.body.textContent).not.toMatch(/fail|violation|error|warning/i);
  });

  /**
   * The ordinary not-asked line is unchanged.
   *
   * Most checks that leave the denominator never had a gap — nothing was open
   * when the condition stopped holding — and a line that spoke about a closure
   * there would be the page inventing one.
   */
  it("says nothing about a closure on a not-asked check that had no gap", () => {
    render(
      <CheckList
        checks={[notAsked("prd-15", LIST_CONDITION)]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={new Map([["prd-1", "A gap on some other check."]])}
        outcome={null}
      />,
    );

    expect(screen.queryByText(t.item.checkNotAskedClosedGap)).toBeNull();
    expect(screen.queryByText("A gap on some other check.")).toBeNull();
    // The line itself is untouched: the condition still says why it was skipped.
    expect(
      screen.getByText(`Only asked when: ${LIST_CONDITION} That is not true here.`),
    ).not.toBeNull();
  });

  /**
   * **The notice is about now, not about history.**
   *
   * A gap closed as no longer applicable stays closed, but its check can come
   * back: a later run whose condition holds again asks it, and the line is then
   * `unclear` or `passed`. Saying "this gap closed when the check stopped
   * applying" beside a check the run *did* ask would be a claim about a state
   * that has passed — and the closed gap it points at is history that a new open
   * gap has already replaced. Only a check still outside the denominator can
   * carry it.
   */
  it("carries no closure notice on a check the run asked", () => {
    const closures = new Map([
      ["prd-1", "Closed while this check was outside the denominator."],
      ["prd-10", "Closed while this check was outside the denominator."],
    ]);

    render(
      <CheckList
        checks={[passed("prd-1"), unclear("prd-10", "must", "Still unclear.")]}
        t={t}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        noLongerApplicable={closures}
        outcome={null}
      />,
    );

    expect(screen.queryByText(t.item.checkNotAskedClosedGap)).toBeNull();
    expect(screen.queryByText("Closed while this check was outside the denominator.")).toBeNull();
  });
});

/**
 * The map the item page hands the list, built from its gaps and the ids the
 * ledger named.
 *
 * Its whole job is the collision: a check can leave the denominator, come back
 * and fail, and leave again, which puts two closed-as-no-longer-applicable gaps
 * on one check id. Keyed by check, one of them renders, and which one is a
 * judgment rather than whatever the read returned last.
 */
describe("noLongerApplicableByCheck", () => {
  const gap = (id: string, checkId: string, evidence: string, resolvedAt: string | null) => ({
    id,
    checkId,
    evidence,
    resolvedAt,
  });

  it("takes only the gaps the ledger named", () => {
    const map = noLongerApplicableByCheck(
      [
        gap("g1", "prd-15", "The one that closed.", "2026-03-01T00:00:00+00:00"),
        gap("g2", "prd-19", "Closed by a pass.", "2026-03-02T00:00:00+00:00"),
      ],
      new Set(["g1"]),
    );

    expect([...map]).toEqual([["prd-15", "The one that closed."]]);
  });

  /**
   * **The newest closure wins**, because the line it renders on is about the
   * denominator now: the closure that explains the check's current absence is
   * the last one, and the earlier gap is a debt a later run already raised
   * again and settled again. Both orderings are staged, so a build that took
   * whatever came last cannot pass by luck.
   */
  it("keeps the newest closure when a check lost the argument twice", () => {
    const older = gap("g-old", "prd-15", "The first time.", "2026-03-01T00:00:00+00:00");
    const newer = gap("g-new", "prd-15", "The second time.", "2026-06-01T00:00:00+00:00");
    const ids = new Set(["g-old", "g-new"]);

    expect(noLongerApplicableByCheck([older, newer], ids).get("prd-15")).toBe("The second time.");
    expect(noLongerApplicableByCheck([newer, older], ids).get("prd-15")).toBe("The second time.");
  });

  /**
   * `gap_resolution_shape` gives every closed row a `resolved_at`, so a null is
   * a row the schema should not permit. It sorts as oldest rather than throwing
   * or winning: a malformed row does not get to decide what the page says.
   */
  it("lets a dated closure beat an undated one, whichever order they arrive in", () => {
    const undated = gap("g-null", "prd-15", "No time on it.", null);
    const dated = gap("g-dated", "prd-15", "Dated.", "2026-01-01T00:00:00+00:00");
    const ids = new Set(["g-null", "g-dated"]);

    expect(noLongerApplicableByCheck([undated, dated], ids).get("prd-15")).toBe("Dated.");
    expect(noLongerApplicableByCheck([dated, undated], ids).get("prd-15")).toBe("Dated.");
  });

  /**
   * A stamp that will not parse is the null case, not a winner.
   *
   * The comparison reads times rather than text so that the format stops
   * mattering — which only helps if something unreadable is still ordered
   * rather than turned into `NaN`, where every comparison is false and the
   * *first* row would win by accident.
   */
  it("treats an unparseable stamp as the oldest, not as the newest", () => {
    const broken = gap("g-broken", "prd-15", "Not a time.", "whenever");
    const dated = gap("g-dated", "prd-15", "Dated.", "2026-01-01T00:00:00+00:00");
    const ids = new Set(["g-broken", "g-dated"]);

    expect(noLongerApplicableByCheck([broken, dated], ids).get("prd-15")).toBe("Dated.");
    expect(noLongerApplicableByCheck([dated, broken], ids).get("prd-15")).toBe("Dated.");
  });
});
