import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";
import { composeRunView, type RunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

import { ReadinessPanel } from "./ReadinessPanel";

const t = getDictionary();

const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const stored = (overrides: Partial<StoredRunInput> = {}): StoredRunInput => ({
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: new Date(NOW - 4 * HOUR).toISOString(),
  nextScoringAttemptAt: null,
  conditionsMet: ["network-dependent-surface", "user-to-user-or-location"],
  earned: 66,
  denominator: 99,
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
    const { container } = render(<ReadinessPanel run={null} t={t} now={NOW} />);

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
    render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    // 66 of 99 is 66.67, rounded once, in the composer.
    expect(screen.getByText("67%")).not.toBeNull();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("67");
  });

  /**
   * §4's renormalized denominator. The not-asked lines inside the expansion are
   * why it is 99 rather than 100 — but only once the number they explain is on
   * screen to be asked about.
   */
  it("says what the score is out of", () => {
    render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    expect(screen.getByText(t.item.pointsOf(66, 99))).not.toBeNull();
  });

  // §5: "Timestamps show freshness." The clock is the run's own.
  it("dates the run relative to the page's read clock", () => {
    render(<ReadinessPanel run={view()} t={t} now={NOW} />);

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
    const { container } = render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    expect(container.innerHTML).toMatch(/bg-prime/);
    expect(container.innerHTML).not.toMatch(/bg-warning/);
  });

  /**
   * §5 stamps provider, model and rubric version on every run for a reason: a
   * number nobody can trace is a number nobody can argue with.
   */
  it("stamps the run with the pack, its version and the model that ran", () => {
    render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    expect(
      screen.getByText(t.item.provenance("feature-prd", "1.0.0", "claude-sonnet-5")),
    ).not.toBeNull();
  });

  /**
   * §8: "click expands per-check list". The expansion is a native `<details>`,
   * which keeps the item page free of client islands — and its content is in
   * the DOM whether or not it is open, which is what lets a screen reader and a
   * find-in-page reach it.
   */
  it("puts the whole run inside one disclosure", () => {
    const { container } = render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")).not.toBeNull();
    expect(screen.getByRole("list", { name: t.item.checks })).not.toBeNull();

    // Closed by default: a run explains a number someone asked about, and the
    // question comes before the answer.
    expect(details?.hasAttribute("open")).toBe(false);
  });

  /**
   * Read-only. Opening a disclosure writes nothing and moves no score, so the
   * page still offers no control in §5's sense — but it is now reachable and
   * operable from the keyboard, which §11 requires of everything interactive.
   */
  it("offers the disclosure and no other control", () => {
    const { container } = render(<ReadinessPanel run={view()} t={t} now={NOW} />);

    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("summary")).toHaveLength(1);
  });
});
