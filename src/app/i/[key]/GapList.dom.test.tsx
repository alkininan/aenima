import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";
import type { GapMoveClaim } from "@/lib/gap-move";

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
  // §8.32: the check's wording, the pack's prose threaded from the run by check id.
  prose: "Every story has testable GWT acceptance criteria",
  evidence: "MN-2: 'nearby' — same venue, or within 100 m?",
  resolvedBy: null,
  resolutionNote: null,
  ...overrides,
});

/** The card's own chip — its label carries the id in a span of its own, so it is found by shape. */
const chipOf = (card: HTMLElement) => card.querySelector<HTMLElement>("[data-testid='gap-chip']")!;

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

    // §8.32: the check's wording in ui-body, then the id beside its chip.
    expect(screen.getByText("Every story has testable GWT acceptance criteria")).not.toBeNull();
    expect(screen.getAllByText("prd-19").length).toBeGreaterThanOrEqual(1);
    // §5: "a failure quotes the exact gap." The evidence is the body, not a
    // detail behind a disclosure.
    expect(screen.getByText("MN-2: 'nearby' — same venue, or within 100 m?")).not.toBeNull();
    // §8.9: the open chip reads "Must · {check id}", the id in mono-readout — never "Open".
    const chip = chipOf(screen.getByRole("listitem"));
    expect(chip.textContent).toBe(t.item.gapChip.must("prd-19"));
    expect(within(chip).getByText("prd-19").className).toContain("type-mono-readout");
    expect(screen.queryByText(t.item.gapOpen)).toBeNull();
  });

  // The pack no longer names the check: the id stands alone, and the card still renders.
  it("stands on the id alone when the pack no longer carries the wording", () => {
    render(
      <GapList
        gaps={[gap({ id: "g1", disposition: "open", prose: null })]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );
    expect(screen.queryByText("Every story has testable GWT acceptance criteria")).toBeNull();
    expect(screen.getAllByText("prd-19").length).toBeGreaterThanOrEqual(1);
  });

  /**
   * §8.32 (T0.49): a plain card at padding 20 — it stands on the page by itself — with the
   * quoted evidence on its own `--surface-1` card, bordered, since a card must separate
   * from a card (§5). No time estimate: product-spec has no typical time for a gap move,
   * and the line never renders without a number. No Undo: undo lives in the toast.
   */
  it("pads 20, quotes the evidence on a bordered inner card, and carries no estimate or undo", () => {
    render(
      <GapList
        gaps={[gap({ id: "g1", disposition: "open" })]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );
    const card = screen.getByRole("listitem").firstElementChild as HTMLElement;
    expect(card.className).toContain("p-[20px]");

    const evidence = screen.getByText("MN-2: 'nearby' — same venue, or within 100 m?");
    expect(evidence.className).toContain("border");
    expect(evidence.className).toContain("p-[16px]");
    expect(evidence.className).toContain("bg-surface-1");
    expect(evidence.className).toContain("type-ui-body");

    expect(document.body.textContent).not.toMatch(/Typically/);
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bUndo\b/);
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

    // §8.9: the accepted chip reads priority and accepter, "Must · {accepter}".
    expect(screen.getByText(t.item.gapAcceptedBy.must(t.item.actorSelf))).not.toBeNull();
    expect(screen.getByText(/Accepted for V1/)).not.toBeNull();
    // The accepter, as far as the schema can honestly name them — on the chip and the stamp.
    expect(screen.getByText(new RegExp(`^${t.item.settledBy(t.item.actorSelf)}`))).not.toBeNull();
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
          gap({ id: "g2", disposition: "excluded", tag: "must", resolvedBy: { kind: "self" } }),
          gap({ id: "g3", disposition: "accepted", tag: "should", resolvedBy: { kind: "other" } }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored={false}
      />,
    );

    expect(screen.getByText(t.item.gapMust)).not.toBeNull();
    expect(screen.getByText(t.item.gapAcceptedBy.should(t.item.actorOther))).not.toBeNull();
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
      .map((row) => within(row).getAllByText(/^prd-\d+$/)[0]!.textContent);

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
   *
   * **Staged with a move that actually answered.** `outcome={null}` is no move,
   * so it can reach no message and no field state — a version of this that
   * passed it would go green over a `MoveMessage` painted `--danger`. The two
   * outcomes below are the two that reach a surface: one that speaks about the
   * request, which must stay neutral, and one that speaks about the field,
   * where §8 puts the only danger this page is allowed.
   */
  it("uses no danger tone for an outcome that is not about a field", () => {
    const { container } = render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "open" }),
          gap({ id: "g2", disposition: "accepted", resolvedBy: { kind: "self" } }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={{ intent: "accept", kind: "not-decider", gapId: "g1" } satisfies GapMoveClaim}
        scored
      />,
    );

    expect(screen.getByText(t.item.gapMove.accept["not-decider"])).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/danger/);
  });

  /** §8's one sanctioned exception, and it stays inside the field it is about. */
  it("keeps the field's own error tone on the field and nowhere else", () => {
    const { container } = render(
      <GapList
        gaps={[gap({ id: "g1", disposition: "open" })]}
        t={t}
        itemKey="soc-12"
        outcome={{ intent: "accept", kind: "reason-required", gapId: "g1" } satisfies GapMoveClaim}
        scored
      />,
    );

    expect(screen.getByText(t.item.gapMove.accept["reason-required"])).not.toBeNull();
    // Every element wearing a danger class sits inside the reason field's
    // composite — §8's border and its helper line, and nothing else.
    const composite = container.querySelector(".field");
    const danger = [...container.querySelectorAll('[class*="danger"]')];
    expect(danger.length).toBeGreaterThan(0);
    expect(danger.every((node) => composite?.contains(node))).toBe(true);
  });

  // No gaps yet is the ordinary case — scoring has not run — so it reads as
  // normal rather than as absence. §12: never "missing", never "none".
  it("says nothing has been found yet rather than reporting an absence", () => {
    render(<GapList gaps={[]} t={t} scored={false} itemKey="soc-12" outcome={null} />);
    expect(screen.getByText(t.item.noGaps)).not.toBeNull();
  });

  /**
   * §2 Dimming (T0.49): "Opacity never touches text." A settled card's text — the wording,
   * the evidence, the id, the stamp — steps to `--n-secondary`; the chip's fill goes to
   * .60 on a layer of its own; its Reopen stays at 1 (§8.10: Secondary sm and fully live).
   * The card-wide `opacity-60` is gone.
   */
  it("dims a settled card by colour and its chip's fill, never the card or its Reopen", () => {
    const { container } = render(
      <GapList
        gaps={[
          gap({
            id: "g2",
            disposition: "accepted",
            resolvedBy: { kind: "self" },
            resolutionNote: "For V1.",
          }),
        ]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );

    const card = screen.getByRole("listitem").firstElementChild as HTMLElement;
    expect(card.className).not.toContain("opacity-60");
    expect(container.querySelectorAll('[class*="opacity-60"]:not([aria-hidden])')).toHaveLength(0);

    expect(
      screen.getByText("Every story has testable GWT acceptance criteria").className,
    ).toContain("text-n-secondary");
    expect(screen.getByText("MN-2: 'nearby' — same venue, or within 100 m?").className).toContain(
      "text-n-secondary",
    );
    expect(screen.getAllByText("prd-19")[0]!.className).toContain("text-n-secondary");

    const chip = chipOf(screen.getByRole("listitem"));
    expect(chip.className).toContain("text-n-secondary");
    const fill = chip.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(fill.className).toContain("opacity-60");
    expect(fill.className).toContain("bg-surface-2");

    const reopen = screen.getByRole("button", { name: t.item.gapReopen });
    expect(reopen.className).not.toContain("opacity");
    expect(reopen.className).toContain("border-glass-border");
  });

  it("keeps an open card's text in --n-primary with its chip's fill on the element", () => {
    render(
      <GapList
        gaps={[gap({ id: "g1", disposition: "open" })]}
        t={t}
        itemKey="soc-12"
        outcome={null}
        scored
      />,
    );
    expect(
      screen.getByText("Every story has testable GWT acceptance criteria").className,
    ).toContain("text-n-primary");
    const chip = chipOf(screen.getByRole("listitem"));
    expect(chip.className).toContain("bg-warning-soft");
    expect(chip.querySelector("[aria-hidden]")).toBeNull();
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

    expect(screen.getAllByText("prd-19").length).toBeGreaterThanOrEqual(1);
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
