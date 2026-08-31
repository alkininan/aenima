import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getDictionary, type Dictionary } from "@/i18n";
import type { GapMoveClaim } from "@/lib/gap-move";
import { composeRunView, type RunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

// The expansion's unclear checks now carry §5's third move.
vi.mock("./actions", () => ({ settleGap: async () => {} }));

const { ReadinessPanel } = await import("./ReadinessPanel");
type MoveableGap = import("./GapMoves").MoveableGap;

/** No gap on any check — the default for everything but the parity test. */
const NO_GAPS = new Map<string, MoveableGap>();

const t = getDictionary();

const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const stored = (overrides: Partial<StoredRunInput> = {}): StoredRunInput => ({
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: new Date(NOW - 4 * HOUR).toISOString(),
  nextScoringAttemptAt: null,
  earned: 66,
  denominator: 99,
  // §4's exclusion as the run recorded it — the −6 that makes 99 out of 105.
  notAsked: [
    {
      checkId: "prd-15",
      tag: "must",
      points: 6,
      conditionWhen: "The feature renders a list, so it has empty and first-use states.",
    },
  ],
  results: [
    {
      checkId: "prd-1",
      tag: "should",
      points: 5,
      passed: true,
      requirementId: null,
      quote: null,
      note: null,
    },
  ],
  ...overrides,
});

const view = (overrides: Partial<StoredRunInput> = {}): RunView =>
  composeRunView(featurePrdPack, stored(overrides));

describe("ReadinessPanel", () => {
  /**
   * §10: "meters render hollow tracks + 'connect AI to activate scoring' —
   * never zeros, never red. That is the item page, where the line stands beside
   * the track and says what the emptiness means."
   *
   * **And no disclosure.** A `<details>` that opens onto nothing is worse than
   * none: it offers to explain a number that was never computed.
   */
  it("renders §10's hollow track with its line, and nothing to open, with no run", () => {
    const { container } = render(
      <ReadinessPanel
        run={null}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.list.noScoring)).not.toBeNull();
    expect(container.querySelector("details")).toBeNull();
    // §10 forbids the zero: a hollow meter is an image with a text alternative,
    // never a progressbar pinned at 0.
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  /**
   * §8: "item-page meter 8h + mono-readout percentage." §13: "meters always
   * pair color with the numeric value" — so the number a screen reader hears
   * and the number on screen are one number, and the bar is drawn at it.
   */
  it("shows the run's percentage beside the track, and announces the same one", () => {
    render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    // 66 of 99 is 66.67, rounded once, in the composer. The sign comes from the
    // dictionary: §12 renders numbers per locale and Turkish writes it first.
    expect(screen.getByText(t.item.scorePercent(67))).not.toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("67");
  });

  /**
   * §12: "dates/numbers per locale". The percent sign is copy that moves —
   * Turkish writes `%67`, sign first — so it belongs to the dictionary and not
   * to JSX, where no translator can reach it.
   *
   * **Driven through a dictionary that moves the sign**, because no assertion
   * over the English render can tell `t.item.scorePercent(run.score)` from
   * `{run.score}%`: both produce "67%", which is the whole reason the hard-coded
   * version survived review once already. A dictionary is the only thing that
   * separates them, so the test hands the component one.
   */
  it("takes the percent sign from the dictionary, including where the locale puts it", () => {
    const signFirst: Dictionary = {
      ...t,
      item: { ...t.item, scorePercent: (score: number) => `%${score}` },
    };

    render(
      <ReadinessPanel
        run={view()}
        t={signFirst}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText("%67")).not.toBeNull();
    expect(screen.queryByText("67%")).toBeNull();
  });

  /**
   * §4's renormalized denominator. The not-asked lines inside the expansion are
   * why it is 99 rather than 100 — but only once the number they explain is on
   * screen to be asked about.
   */
  it("says what the score is out of", () => {
    render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.pointsOf(66, 99))).not.toBeNull();
  });

  // §5: "Timestamps show freshness." The clock is the run's own.
  it("dates the run relative to the page's read clock", () => {
    render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.scoredAt(t.relativeTime.hours(4)))).not.toBeNull();
  });

  /**
   * §10: "Provider outage / retry: freshness shows `--warning` dot +
   * mono-readout 'scored 6 h ago — retrying'; **no banners**." §5 queues
   * outages silently and "the timestamp does the honest work".
   *
   * §0 law 1 and law 2 keep Danger off it entirely: a queued retry is the
   * system working, not a destructive action and not a validation error.
   */
  it("shows a queued retry as a timestamp, never as an error", () => {
    const { container } = render(
      <ReadinessPanel
        run={view({ nextScoringAttemptAt: new Date(NOW + 15 * 60 * 1000).toISOString() })}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.scoredRetrying(t.relativeTime.hours(4)))).not.toBeNull();
    expect(screen.queryByText(t.item.scoredAt(t.relativeTime.hours(4)))).toBeNull();

    // The dot is --warning, and nothing on the panel is --danger.
    expect(container.innerHTML).toMatch(/bg-warning/);
    expect(container.innerHTML).not.toMatch(/danger/);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a settled run with the prime dot, not the warning one", () => {
    const { container } = render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(container.innerHTML).toMatch(/bg-prime/);
    expect(container.innerHTML).not.toMatch(/bg-warning/);
  });

  /**
   * §1 law 3, on a run that predates the record of what it did not ask.
   *
   * Its list stops short of the rubric and nothing above accounts for the
   * difference, so the expansion says which it is rather than reading as
   * complete. §12's voice and §0 law 1: no warning tone, no red — an old run is
   * not a fault.
   */
  it("says when a run cannot account for what it did not ask", () => {
    const { container } = render(
      <ReadinessPanel
        run={view({ notAsked: [] })}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.checksNotAskedUnrecorded)).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/danger/);
    expect(container.innerHTML).not.toMatch(/bg-warning/);
  });

  // And stays quiet on a run that carries its own exclusions, which is every
  // run written from drizzle/0011 on.
  it("says nothing of the sort when the run accounts for the whole rubric", () => {
    render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.queryByText(t.item.checksNotAskedUnrecorded)).toBeNull();
  });

  /**
   * §5 stamps provider, model and rubric version on every run for a reason: a
   * number nobody can trace is a number nobody can argue with.
   */
  it("stamps the run with the pack, its version and the model that ran", () => {
    render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(
      screen.getByText(t.item.provenance("feature-prd", "1.0.0", "claude-sonnet-5")),
    ).not.toBeNull();
  });

  /**
   * §8: "click expands per-check list". The expansion is a native `<details>`,
   * which keeps the item page free of client islands.
   *
   * Its content is in the DOM when closed but is **not** reachable by assistive
   * tech there — a closed `<details>` hides its contents from the accessibility
   * tree, which is what makes it a disclosure rather than a `hidden` attribute
   * nobody can see past. Nothing here claims otherwise; the reason the element
   * is right is the state, the keyboard path and §7's states, not exposure.
   */
  it("puts the whole run inside one disclosure", () => {
    const { container } = render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")).not.toBeNull();
    expect(screen.getByRole("list", { name: t.item.checks })).not.toBeNull();

    // Closed by default: a run explains a number someone asked about, and the
    // question comes before the answer.
    expect(details?.hasAttribute("open")).toBe(false);
  });

  /**
   * **§5's move reaches the expansion, which for an open Should is the only
   * place it can.**
   *
   * §13's narrowing keeps open Shoulds off the gap card (T2.4), so a person
   * looking at `prd-8` sees it here or nowhere. The same component the card
   * renders, so the two cannot drift.
   */
  it("offers the move on an unclear check that carries a gap", () => {
    const gaps = new Map<string, MoveableGap>([
      [
        "prd-1",
        {
          id: "g-1",
          checkId: "prd-1",
          tag: "should",
          disposition: "open",
          resolvedBy: null,
          resolutionNote: null,
        },
      ],
    ]);

    render(
      <ReadinessPanel
        run={view({
          results: [
            {
              checkId: "prd-1",
              tag: "should",
              points: 5,
              passed: false,
              requirementId: null,
              quote: null,
              note: "Unclear.",
            },
          ],
        })}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={gaps}
        outcome={null}
      />,
    );

    expect(screen.getByText(t.item.gapAccept)).not.toBeNull();
    expect(screen.getByRole("button", { name: t.item.gapAcceptSubmit })).not.toBeNull();
  });

  /**
   * **A message inside a collapsed disclosure is not a message.**
   *
   * §13 files open Shoulds under the score, so the expansion is the only place
   * §5's move exists for one — and the only place its answer can render. The
   * redirect lands on `#gap-<id>`, which this list carries for exactly those
   * gaps, so the panel has to be open when it arrives. Everything a failed
   * accept says about an open Should was previously two collapsed disclosures
   * deep, which is why an empty reason looked like nothing happening.
   */
  it("opens itself when a move named a gap that lives only in here", () => {
    const should: MoveableGap = {
      id: "g-should",
      checkId: "prd-1",
      tag: "should",
      disposition: "open",
      resolvedBy: null,
      resolutionNote: null,
    };
    const run = view({
      results: [
        {
          checkId: "prd-1",
          tag: "should",
          points: 5,
          passed: false,
          requirementId: null,
          quote: null,
          note: "Unclear.",
        },
      ],
    });

    const { container } = render(
      <ReadinessPanel
        run={run}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={new Map([["prd-1", should]])}
        outcome={{ intent: "accept", kind: "reason-required", gapId: "g-should" }}
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    // And what it opened onto is readable, not merely present.
    expect(screen.getByText(t.item.gapMove.accept["reason-required"])).not.toBeNull();
    expect(container.querySelector("#gap-g-should")).not.toBeNull();
  });

  /**
   * A gap with a card reports on the card, above and already on screen. Opening
   * the whole rubric to repeat one line would be a page-sized reaction to it,
   * so the panel stays as the person left it.
   */
  it("stays closed when the moved gap has a card of its own", () => {
    const must: MoveableGap = {
      id: "g-must",
      checkId: "prd-1",
      tag: "must",
      disposition: "open",
      resolvedBy: null,
      resolutionNote: null,
    };

    const { container } = render(
      <ReadinessPanel
        run={view({
          results: [
            {
              checkId: "prd-1",
              tag: "must",
              points: 5,
              passed: false,
              requirementId: null,
              quote: null,
              note: "Unclear.",
            },
          ],
        })}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={new Map([["prd-1", must]])}
        outcome={
          { intent: "accept", kind: "reason-required", gapId: "g-must" } satisfies GapMoveClaim
        }
      />,
    );

    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  /**
   * §7 governs "any interactive element", and the summary is one.
   *
   * The ring alone arrives free from the `:focus-visible` rule in globals.css;
   * §6 and §7 both pair the ring **with the aero glow**, and §7 gives every
   * interactive element press physics as well. Those live on `.control`, so the
   * summary wears it — `control-edge-none` alongside, because §8 states the
   * specular edge for Primary and the quiet variants opt out (the same pairing
   * an interactive chip uses).
   *
   * A class assertion rather than a computed one: jsdom has no stylesheet, and
   * the rules being claimed are `.control:focus-visible` and `.control:active`,
   * which no static computation would show anyway. The e2e measures the paint.
   */
  it("gives the disclosure §7's interaction states, not just the focus ring", () => {
    const { container } = render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary?.className).toContain("control");
    expect(summary?.className).toContain("control-edge-none");
    // The hand-rolled hover that used to stand in for §7 — it got the overlay
    // and neither the glow nor the press, and `.control` supersedes it.
    expect(summary?.className).not.toContain("hover:bg-hover-overlay");
  });

  /**
   * Read-only. Opening a disclosure writes nothing and moves no score, so the
   * page still offers no control in §5's sense — but it is now reachable and
   * operable from the keyboard, which §11 requires of everything interactive.
   */
  it("offers the disclosure and no other control", () => {
    const { container } = render(
      <ReadinessPanel
        run={view()}
        t={t}
        now={NOW}
        itemKey="soc-12"
        gapsByCheck={NO_GAPS}
        outcome={null}
      />,
    );

    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // One disclosure: the meter's own. A check with no gap adds none — the
    // count grows only with the debts on screen, which the parity test pins.
    expect(container.querySelectorAll("summary")).toHaveLength(1);
  });
});
