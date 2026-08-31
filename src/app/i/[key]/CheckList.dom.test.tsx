import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";
import type { CheckLine } from "@/lib/scoring/run-view";

// An unclear check now carries §5's third move, which reaches the server action.
vi.mock("./actions", () => ({ settleGap: async () => {} }));

const { CheckList } = await import("./CheckList");
type MoveableGap = import("./GapMoves").MoveableGap;

/** No gap for any check, which is every case but the two that test the move. */
const NO_GAPS = new Map<string, MoveableGap>();

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
        outcome={null}
      />,
    );

    expect(screen.getByText(evidence)).not.toBeNull();
    expect(screen.getByText(t.item.checkUnclear)).not.toBeNull();
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
        outcome={null}
      />,
    );

    expect(screen.queryByText(t.item.checkPassed)).toBeNull();
    expect(screen.queryByText(t.item.checkUnclear)).toBeNull();
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

    expect(contained(labelIn(rows[1]!, t.item.checkUnclear))).toBe(true);
    expect(contained(labelIn(rows[0]!, t.item.checkPassed))).toBe(false);
    expect(contained(labelIn(rows[2]!, t.item.checkNotAsked))).toBe(false);

    // And the chip's own geometry sits on the unclear label alone: §8 gives a
    // chip a pill and 10px of horizontal padding, which is the shape of a
    // container rather than the colour of one.
    expect(labelIn(rows[1]!, t.item.checkUnclear).className).toContain("rounded-pill");
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
        outcome={null}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    const must = within(rows[0]!).getByText(t.item.checkUnclear);
    const should = within(rows[1]!).getByText(t.item.checkUnclear);

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
        outcome={null}
      />,
    );

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
