import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";

// The card now carries §5's third move, so it reaches the server action and the
// query layer behind it. Mocked the way `SignInForm.dom.test.tsx` mocks its
// own: what this file tests is the markup a form produces, not the write.
vi.mock("./actions", () => ({ settleGap: async () => {} }));

const { GapList } = await import("./GapList");
type GapView = import("./GapList").GapView;

const t = getDictionary();

const gap = (overrides: Partial<GapView> & Pick<GapView, "id" | "disposition">): GapView => ({
  // A rubric check id, as T2.3 made it: a gap names a check, and the
  // requirement id lives inside the evidence where §7.2 puts it.
  checkId: "prd-19",
  tag: "must",
  evidence: "MN-2: 'nearby' — same venue, or within 100 m?",
  resolvedBy: null,
  resolutionNote: null,
  ...overrides,
});

/**
 * §5's three dispositions, rendered.
 *
 * The rule these hold is §1 law 7 — "gaps, exclusions, and flags are visible
 * debts that a named person accepts; freedom is total, deniability is zero." A
 * settled gap that disappeared from the page would delete the name, which is the
 * only part of accepting a risk that costs anything.
 */
describe("GapList", () => {
  it("renders an open gap with its check id and quoted evidence", () => {
    render(
      <GapList
        gaps={[gap({ id: "g1", disposition: "open" })]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    expect(screen.getByText("prd-19")).not.toBeNull();
    // §5: "a failure quotes the exact gap." The evidence is the body, not a
    // detail behind a disclosure.
    expect(screen.getByText("MN-2: 'nearby' — same venue, or within 100 m?")).not.toBeNull();
    expect(screen.getByText(t.item.gapOpen)).not.toBeNull();
  });

  it("keeps an accepted gap visible, with who accepted it and why", () => {
    render(
      <GapList
        gaps={[
          gap({
            id: "g2",
            disposition: "accepted",
            resolvedBy: { kind: "self" },
            resolutionNote: "Accepted for V1 — rarely opened offline.",
          }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    expect(screen.getByText(t.item.gapAccepted)).not.toBeNull();
    expect(screen.getByText(/Accepted for V1/)).not.toBeNull();
    // The accepter, as far as the schema can honestly name them.
    expect(screen.getByText(new RegExp(t.item.actorSelf))).not.toBeNull();
  });

  it("keeps an excluded gap visible too", () => {
    render(
      <GapList
        gaps={[
          gap({
            id: "g3",
            disposition: "excluded",
            resolvedBy: { kind: "other" },
            resolutionNote: "No interpersonal surface here.",
          }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    expect(screen.getByText(t.item.gapExcluded)).not.toBeNull();
    expect(screen.getByText(/No interpersonal surface/)).not.toBeNull();
  });

  /**
   * A settled chip says only *how* it was settled, so the tag would otherwise
   * be lost — and a Must someone accepted is a larger fact than a Should, not a
   * smaller one.
   */
  it("still says Must or Should once a gap is settled", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g2", disposition: "accepted", tag: "must", resolvedBy: { kind: "self" } }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    expect(screen.getByText(t.item.gapMust)).not.toBeNull();
  });

  // §13 reads top-down: what is owed first, what is settled after.
  it("puts open gaps above settled ones, and Musts above Shoulds", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g4", disposition: "excluded", checkId: "prd-20" }),
          gap({ id: "g5", disposition: "accepted", tag: "should", checkId: "prd-8" }),
          gap({ id: "g6", disposition: "open", tag: "must", checkId: "prd-19" }),
          gap({ id: "g7", disposition: "accepted", checkId: "prd-16" }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    const ids = screen
      .getAllByRole("listitem")
      .map((row) => within(row).getByText(/^prd-\d+$/).textContent);

    expect(ids).toEqual(["prd-19", "prd-16", "prd-8", "prd-20"]);
  });

  /**
   * **T2.5 restates this rather than deleting it.**
   *
   * The rule it held was that every action §5 and §13 would put here was a
   * mutation that did not exist, so offering one would offer something that
   * cannot happen. §5's third move now exists, and only that one: "doesn't
   * apply here" and "already covered" are still Phase 3. So the claim becomes
   * exact — one move per gap that has one, and nothing else.
   */
  it("offers §5's third move and no other control", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "open" }),
          gap({ id: "g2", disposition: "accepted", resolvedBy: { kind: "self" } }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    // The open Must offers accept; the accepted one offers its reversal.
    expect(screen.getByText(t.item.gapAccept)).not.toBeNull();
    expect(screen.getByRole("button", { name: t.item.gapReopen })).not.toBeNull();

    // One submit per form and nothing else. §5's other two moves are Phase 3,
    // and a control for them here would offer something that cannot happen.
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([t.item.gapAcceptSubmit, t.item.gapReopen]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    // Exactly one field: the reason. Nothing else on a gap card takes input.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  /**
   * §0 law 1 and law 2: a gap never renders in Danger, and neither does a move
   * on it. Accepting is not destructive and reopening is not either — both have
   * standing reversals, so neither is the "destructive action" Danger is for.
   */
  it("uses no danger tone on a gap or on either move", () => {
    const { container } = render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "open" }),
          gap({ id: "g2", disposition: "accepted", resolvedBy: { kind: "self" } }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );

    expect(container.innerHTML).not.toMatch(/danger/);
  });

  // No gaps yet is the ordinary case — scoring has not run — so it reads as
  // normal rather than as absence. §12: never "missing", never "none".
  it("says nothing has been found yet rather than reporting an absence", () => {
    render(<GapList gaps={[]} t={t} scored={false} itemKey="soc-12" outcome={null} />);
    expect(screen.getByText(t.item.noGaps)).not.toBeNull();
  });

  /* ------------------------------------------------------------------------ */
  /* T2.4: this list narrows to §13, and the run's full picture moves          */
  /* ------------------------------------------------------------------------ */

  /**
   * §13 names what belongs on the item page: work waiting on a human, and
   * debts someone put their name to. An open Should is neither — it is
   * advisory, and its own check states it with its evidence in the meter's
   * expansion. Repeating every advisory finding here would bury the ones that
   * block handover.
   */
  it("files an open Should under the score instead of listing it here", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "open", tag: "must", checkId: "prd-19" }),
          gap({ id: "g2", disposition: "open", tag: "should", checkId: "prd-8" }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );

    expect(screen.getByText("prd-19")).not.toBeNull();
    expect(screen.queryByText("prd-8")).toBeNull();
  });

  /**
   * A closed gap renders nowhere at all — the check passing is the record.
   *
   * `gap_resolution_shape` gives a closed row a time and no name and no note,
   * because nobody decided anything: a re-score found the check passing, or
   * §4's condition stopped holding. §1 law 7 is about debts a *named person*
   * accepted, and there is no name here to preserve.
   *
   * This is also the live bug T2.4 closed. `writeRun` has written `closed` gaps
   * since T2.3 and `getItemByKey` selects every disposition, so before the
   * narrowing they fell through and rendered as "Open" — the page telling
   * someone they owed work that a run had already found done.
   */
  it("renders a closed gap nowhere, in any tag", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "closed", tag: "must", checkId: "prd-10" }),
          gap({ id: "g2", disposition: "closed", tag: "should", checkId: "prd-5" }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );

    expect(screen.queryByText("prd-10")).toBeNull();
    expect(screen.queryByText("prd-5")).toBeNull();
    expect(screen.queryByText(t.item.gapOpen)).toBeNull();
    // Nothing left to show, so the scored empty line — which does not claim
    // there were never any gaps.
    expect(screen.getByText(t.item.noGapsScored)).not.toBeNull();
  });

  // A settled gap survives the narrowing whatever its tag: §1 law 7 is about
  // the name on it, and a Should someone accepted still has one.
  it("keeps accepted and excluded gaps of either tag", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "accepted", tag: "should", checkId: "prd-8" }),
          gap({ id: "g2", disposition: "excluded", tag: "must", checkId: "prd-20" }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );

    expect(screen.getByText("prd-8")).not.toBeNull();
    expect(screen.getByText("prd-20")).not.toBeNull();
  });

  /**
   * The empty line has to say something true about why it is empty. Before a
   * run, "no gaps yet, they appear when scoring runs" is the whole truth. After
   * one it is not: there may be several open Shoulds a click away, and a line
   * claiming none would have the page contradicting the meter above it.
   */
  it("says something different when the emptiness follows a run", () => {
    const { unmount } = render(
      <GapList gaps={[]} t={t} scored={false} itemKey="soc-12" outcome={null} />,
    );
    expect(screen.getByText(t.item.noGaps)).not.toBeNull();
    unmount();

    render(<GapList gaps={[]} t={t} scored itemKey="soc-12" outcome={null} />);
    expect(screen.getByText(t.item.noGapsScored)).not.toBeNull();
    expect(screen.queryByText(t.item.noGaps)).toBeNull();
  });
});
