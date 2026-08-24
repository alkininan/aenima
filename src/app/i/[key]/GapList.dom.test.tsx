import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";

import { GapList, type GapView } from "./GapList";

const t = getDictionary();

const gap = (overrides: Partial<GapView> & Pick<GapView, "id" | "disposition">): GapView => ({
  checkId: "MN-2",
  tag: "must",
  evidence: "'nearby' — same venue, or within 100 m?",
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
    render(<GapList gaps={[gap({ id: "g1", disposition: "open" })]} t={t} />);

    expect(screen.getByText("MN-2")).not.toBeNull();
    // §5: "a failure quotes the exact gap." The evidence is the body, not a
    // detail behind a disclosure.
    expect(screen.getByText("'nearby' — same venue, or within 100 m?")).not.toBeNull();
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
      />,
    );

    expect(screen.getByText(t.item.gapMust)).not.toBeNull();
  });

  // §13 reads top-down: what is owed first, what is settled after.
  it("puts open gaps above settled ones, and Musts above Shoulds", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g4", disposition: "excluded", checkId: "SF-1" }),
          gap({ id: "g5", disposition: "open", tag: "should", checkId: "MN-9" }),
          gap({ id: "g6", disposition: "open", tag: "must", checkId: "MN-2" }),
          gap({ id: "g7", disposition: "accepted", checkId: "MN-7" }),
        ]}
        t={t}
      />,
    );

    const ids = screen
      .getAllByRole("listitem")
      .map((row) => within(row).getByText(/^(MN|SF)-\d+$/).textContent);

    expect(ids).toEqual(["MN-2", "MN-9", "MN-7", "SF-1"]);
  });

  /**
   * Read-only. §5's three moves — "doesn't apply here", "already covered", "we
   * accept this risk" — are Phase 2, each a mutation with a scoring run behind
   * it. A control appearing here before then would offer something that cannot
   * happen.
   */
  it("offers no controls at all", () => {
    render(
      <GapList
        gaps={[
          gap({ id: "g1", disposition: "open" }),
          gap({ id: "g2", disposition: "accepted", resolvedBy: { kind: "self" } }),
        ]}
        t={t}
      />,
    );

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  // No gaps yet is the ordinary case — scoring has not run — so it reads as
  // normal rather than as absence. §12: never "missing", never "none".
  it("says nothing has been found yet rather than reporting an absence", () => {
    render(<GapList gaps={[]} t={t} />);
    expect(screen.getByText(t.item.noGaps)).not.toBeNull();
  });
});
