import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";

vi.mock("./actions", () => ({ settleGap: async () => {} }));

const { GapMoves } = await import("./GapMoves");
type MoveableGap = import("./GapMoves").MoveableGap;

const t = getDictionary();

const gap = (over: Partial<MoveableGap> = {}): MoveableGap => ({
  id: "g1",
  checkId: "prd-10",
  tag: "must",
  disposition: "open",
  resolvedBy: null,
  resolutionNote: null,
  ...over,
});

const show = (g: MoveableGap, outcome: Parameters<typeof GapMoves>[0]["outcome"] = null) =>
  render(<GapMoves gap={g} itemKey="soc-12" t={t} outcome={outcome} />);

/**
 * §5's third move — "we accept this risk" — in the one component that renders
 * it, for both the gap card and the meter's expansion.
 */
describe("GapMoves", () => {
  it("offers accept on an open gap, with a required reason", () => {
    show(gap());

    expect(screen.getByText(t.item.gapAccept)).not.toBeNull();
    const field = screen.getByLabelText(t.item.gapAcceptReason);
    // Progressive enhancement: the browser catches an empty reason before the
    // round trip. The database is still the rule — `gap_resolution_shape`.
    expect(field.hasAttribute("required")).toBe(true);
    expect(field.getAttribute("maxlength")).toBe("2000");
    // §8: a field shows one text, ever — its label. The placeholder is the
    // sentinel space `:placeholder-shown` needs and never paints.
    expect(field.getAttribute("placeholder")).toBe(" ");
  });

  /**
   * §1 law 4's "always undoable", as a standing control rather than a toast
   * that expires. §1 law 7 keeps the name on screen beside it.
   */
  it("offers the reversal on an accepted gap, and keeps the name and reason", () => {
    show(gap({ disposition: "accepted", resolvedBy: { kind: "self" }, resolutionNote: "For V1." }));

    expect(screen.getByRole("button", { name: t.item.gapReopen })).not.toBeNull();
    expect(screen.getByText(new RegExp(t.item.actorSelf))).not.toBeNull();
    expect(screen.getByText(/For V1\./)).not.toBeNull();
    // Accepting is done; there is nothing to accept again.
    expect(screen.queryByText(t.item.gapAccept)).toBeNull();
  });

  /**
   * §5's *first* move is Phase 3's ticket. An excluded gap keeps its name — law
   * 7 — and offers nothing, because offering a control for a move that does not
   * exist would offer something that cannot happen.
   */
  it("shows an excluded gap's name and no move at all", () => {
    show(gap({ disposition: "excluded", resolvedBy: { kind: "other" }, resolutionNote: "No." }));

    expect(screen.getByText(new RegExp(t.item.actorOther))).not.toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText(t.item.gapAccept)).toBeNull();
  });

  /**
   * §8 tones a helper line's error `--danger`, and §0 law 2 names validation
   * errors as one of Danger's three sanctioned uses. It is the only danger on
   * this surface.
   */
  it("puts an empty reason on the field's own helper line, in the error tone", () => {
    const { container } = show(gap(), "reason-required");

    expect(screen.getByText(t.item.gapMove["reason-required"])).not.toBeNull();
    expect(screen.getByLabelText(t.item.gapAcceptReason).getAttribute("aria-invalid")).toBe("true");
    expect(container.innerHTML).toMatch(/text-danger/);
  });

  /**
   * §0 law 1: gaps never render in Danger, and neither do the moves on them.
   * Accepting is not destructive and reopening is not either.
   */
  it("uses no danger tone for an outcome that is not about the field", () => {
    // `not-open` is only true of a gap that is no longer open — here, one
    // somebody else accepted while this person was writing. The truth-gate
    // refuses to say it about a gap that is still open.
    const { container } = show(
      gap({ disposition: "accepted", resolvedBy: { kind: "other" }, resolutionNote: "n" }),
      "not-open",
    );

    expect(screen.getByText(t.item.gapMove["not-open"])).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/danger/);
  });

  /**
   * **A search param is a claim about a request that finished; the row is the
   * truth now.**
   *
   * A shared or bookmarked link carries `?move=accepted` indefinitely, and a
   * re-score can move the gap underneath it. So the confirmation renders only
   * where the row still agrees — the same epistemics as `writeRun`'s "where
   * nothing changes, no ledger row is written".
   */
  it("says nothing the row no longer supports", () => {
    // The URL claims this was accepted; the gap is open. Someone reopened it,
    // or the link is old.
    show(gap({ disposition: "open" }), "accepted");
    expect(screen.queryByText(t.item.gapMove.accepted)).toBeNull();
  });

  it("confirms an acceptance only to the person whose name is on it", () => {
    const { unmount } = show(
      gap({ disposition: "accepted", resolvedBy: { kind: "self" }, resolutionNote: "n" }),
      "accepted",
    );
    expect(screen.getByText(t.item.gapMove.accepted)).not.toBeNull();
    unmount();

    // Same URL, different reader: the debt is someone else's, so "accepted"
    // said to them would be a claim about a request they never made.
    show(
      gap({ disposition: "accepted", resolvedBy: { kind: "other" }, resolutionNote: "n" }),
      "accepted",
    );
    expect(screen.queryByText(t.item.gapMove.accepted)).toBeNull();
  });

  /**
   * The form must reach the action with everything it needs, and nothing that
   * decides anything. §5's move is authorized from the session and the database
   * at write time; these three fields only say *which* gap and *which* move.
   */
  it("submits the gap, the move and the item key, and no encType", () => {
    const { container } = show(gap());

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    const named = [...container.querySelectorAll("input[type=hidden]")].map((i) => [
      i.getAttribute("name"),
      i.getAttribute("value"),
    ]);
    expect(named).toEqual([
      ["key", "soc-12"],
      ["gapId", "g1"],
      ["intent", "accept"],
    ]);

    // No `encType` of our own. React's server renderer sets the one that works
    // (`multipart/form-data`) and would override a disagreeing prop anyway, so
    // this pins intent rather than the shipped attribute — `e2e/item.spec.ts`
    // measures that, and submits the form with JavaScript disabled.
    expect(form?.hasAttribute("enctype")).toBe(false);
  });

  // The disclosure reopens on a failure so the reason is one keystroke from
  // being fixed, and closes on success because the work is done.
  it("reopens the form on a failure and closes it on a move that landed", () => {
    const { container, unmount } = show(gap(), "reason-required");
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    unmount();

    const after = show(gap(), null);
    expect(after.container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });
});
