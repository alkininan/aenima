import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n";
import type { GapMoveClaim } from "@/lib/gap-move";

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

/** A move's answer as the URL reports it, already narrowed to this gap. */
const accepted = (kind: Extract<GapMoveClaim, { intent: "accept" }>["kind"]): GapMoveClaim => ({
  intent: "accept",
  kind,
  gapId: "g1",
});
const reopened = (kind: Extract<GapMoveClaim, { intent: "reopen" }>["kind"]): GapMoveClaim => ({
  intent: "reopen",
  kind,
  gapId: "g1",
});

const show = (g: MoveableGap, outcome: GapMoveClaim | null = null) =>
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
    const { container } = show(gap(), accepted("reason-required"));

    expect(screen.getByText(t.item.gapMove.accept["reason-required"])).not.toBeNull();
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
      accepted("not-open"),
    );

    expect(screen.getByText(t.item.gapMove.accept["not-open"])).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/danger/);
  });

  /**
   * **One token, two moves, two sentences.**
   *
   * `not-decider` is the answer to both `accept_gap` and `reopen_gap`. Told to
   * someone who pressed *reopen*, "accepting a Must is the Decider's call" names
   * a move they did not make — so the intent travels with the outcome and the
   * dictionary is keyed by move first.
   */
  it("names the move the person actually made when one token serves both", () => {
    const settled = gap({
      disposition: "accepted",
      resolvedBy: { kind: "other" },
      resolutionNote: "n",
    });

    const { unmount } = show(settled, reopened("not-decider"));
    expect(screen.getByText(t.item.gapMove.reopen["not-decider"])).not.toBeNull();
    expect(screen.queryByText(t.item.gapMove.accept["not-decider"])).toBeNull();
    unmount();

    show(gap(), accepted("not-decider"));
    expect(screen.getByText(t.item.gapMove.accept["not-decider"])).not.toBeNull();
    expect(screen.queryByText(t.item.gapMove.reopen["not-decider"])).toBeNull();
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
    show(gap({ disposition: "open" }), accepted("accepted"));
    expect(screen.queryByText(t.item.gapMove.accept.accepted)).toBeNull();
  });

  it("confirms an acceptance only to the person whose name is on it", () => {
    const { unmount } = show(
      gap({ disposition: "accepted", resolvedBy: { kind: "self" }, resolutionNote: "n" }),
      accepted("accepted"),
    );
    expect(screen.getByText(t.item.gapMove.accept.accepted)).not.toBeNull();
    unmount();

    // Same URL, different reader: the debt is someone else's, so "accepted"
    // said to them would be a claim about a request they never made.
    show(
      gap({ disposition: "accepted", resolvedBy: { kind: "other" }, resolutionNote: "n" }),
      accepted("accepted"),
    );
    expect(screen.queryByText(t.item.gapMove.accept.accepted)).toBeNull();
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

  /**
   * **The disclosure decides whether the *form* is open, never whether a
   * sentence is readable.**
   *
   * A move that landed closes it — the work is done — and that is exactly why
   * no message may live inside it: "Reopened." rendered into a collapsed
   * `<details>` reached nobody, and the assertion that was supposed to catch it
   * passed `null` for the landed case, which is no move at all.
   */
  it("reopens the form on a failure and closes it on a move that landed", () => {
    const failed = show(gap(), accepted("reason-required"));
    expect(failed.container.querySelector("details")?.hasAttribute("open")).toBe(true);
    failed.unmount();

    // A reopen that landed leaves the gap open, so this component renders the
    // accept form again — closed, because there is nothing to fix.
    const landed = show(gap({ disposition: "open" }), reopened("reopened"));
    expect(landed.container.querySelector("details")?.hasAttribute("open")).toBe(false);
    landed.unmount();

    const quiet = show(gap(), null);
    expect(quiet.container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  /**
   * §1 law 4's undo has to be *visible* to be an undo. The gap is open again,
   * so the accept form is what renders — and the sentence has to sit outside
   * it, because the same outcome that produced the sentence closes the form.
   */
  it("shows the reversal's confirmation outside the disclosure that closes", () => {
    const { container } = show(gap({ disposition: "open" }), reopened("reopened"));

    const message = screen.getByText(t.item.gapMove.reopen.reopened);
    const details = container.querySelector("details");

    expect(details?.hasAttribute("open")).toBe(false);
    // Rendered *and* reachable. Inside a closed `<details>` it would be neither.
    expect(details?.contains(message)).toBe(false);
  });

  /**
   * The mirror of the above, on the branch that already got it right: an
   * accepted gap's confirmation is a sibling of the reopen form, not a child of
   * any disclosure. Both branches state the rule so neither can regress alone.
   */
  it("shows the acceptance's confirmation outside every disclosure too", () => {
    const { container } = show(
      gap({ disposition: "accepted", resolvedBy: { kind: "self" }, resolutionNote: "n" }),
      accepted("accepted"),
    );

    const message = screen.getByText(t.item.gapMove.accept.accepted);
    expect([...container.querySelectorAll("details")].some((d) => d.contains(message))).toBe(false);
  });
});
