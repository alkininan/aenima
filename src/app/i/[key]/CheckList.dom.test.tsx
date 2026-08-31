import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";
import type { CheckLine } from "@/lib/scoring/run-view";

import { CheckList } from "./CheckList";

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
    render(<CheckList checks={[passed("prd-1")]} t={t} />);

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
    render(<CheckList checks={[unclear("prd-10", "must", evidence)]} t={t} />);

    expect(screen.getByText(evidence)).not.toBeNull();
    expect(screen.getByText(t.item.checkUnclear)).not.toBeNull();
  });

  /**
   * §12: "this section was unclear," never "test / fail / violation". The word
   * on a failing check is the product's voice, and it is the one a person reads
   * before they read the quote.
   */
  it("never says failed", () => {
    render(<CheckList checks={[unclear("prd-10", "must", "Something.")]} t={t} />);

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
   */
  it("says the condition did NOT hold, never just what the condition is", () => {
    render(<CheckList checks={[notAsked("prd-15", LIST_CONDITION)]} t={t} />);

    expect(screen.getByText(t.item.checkNotAsked)).not.toBeNull();

    const line = screen.getByText(t.item.checkNotAskedReason(LIST_CONDITION));
    expect(line).not.toBeNull();
    // The condition is quoted, and it is quoted inside a frame that negates it.
    expect(line.textContent).toContain(LIST_CONDITION);
    expect(line.textContent).not.toBe(LIST_CONDITION);
  });

  // §4: a not-asked check is neither a pass nor a failure, and saying either
  // would put a verdict on a question nobody asked.
  it("shows a not-asked check as neither passed nor unclear", () => {
    render(<CheckList checks={[notAsked("prd-15", LIST_CONDITION)]} t={t} />);

    expect(screen.queryByText(t.item.checkPassed)).toBeNull();
    expect(screen.queryByText(t.item.checkUnclear)).toBeNull();
  });

  /**
   * §8 (v2.15): "a bordered chip in a row must mean something, and what it
   * means there is a gap." One level down, the same rule: only an unclear check
   * carries a container, so the eye lands on the ones that need something.
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
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    // The gap chip renders as a span carrying a border/background tone; the
    // marker for "this is contained" is the chip's own text, and it appears once.
    expect(screen.getAllByText(t.item.checkUnclear)).toHaveLength(1);
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
    render(<CheckList checks={[{ ...passed("prd-retired"), prose: null }]} t={t} />);

    expect(screen.getByText("prd-retired")).not.toBeNull();
    expect(screen.getByText(t.item.checkPassed)).not.toBeNull();
  });

  // Read-only. §5's three negotiation moves are T2.5, each a mutation with a
  // scoring run behind it. Nothing here offers one.
  it("offers no controls at all", () => {
    render(
      <CheckList
        checks={[
          passed("prd-1"),
          unclear("prd-10", "must", "A."),
          notAsked("prd-15", LIST_CONDITION),
        ]}
        t={t}
      />,
    );

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
