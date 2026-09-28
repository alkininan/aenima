import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";
import { composeRunView, type RunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

import { Freshness } from "./freshness";

const t = getDictionary();
const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);

const stored = (overrides: Partial<StoredRunInput> = {}): StoredRunInput => ({
  packId: "feature-prd",
  packVersion: "1.0.0",
  model: "claude-sonnet-5",
  scoredAt: new Date(NOW - 4 * HOUR).toISOString(),
  nextScoringAttemptAt: null,
  earned: 66,
  denominator: 99,
  notAsked: [],
  results: [],
  ...overrides,
});

const view = (overrides: Partial<StoredRunInput> = {}): RunView =>
  composeRunView(featurePrdPack, stored(overrides));

/**
 * The item page's freshness — design-spec §4 puts it in the page topbar's readout slot
 * (T0.48), where it stood in the meter's summary before. The same three cases the panel
 * held, on the component that renders them now.
 */
describe("Freshness", () => {
  // §5: "Timestamps show freshness." The clock is the run's own.
  it("dates the run relative to the page's read clock", () => {
    render(<Freshness run={view()} t={t} now={NOW} />);

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
      <Freshness
        run={view({ nextScoringAttemptAt: new Date(NOW + 15 * 60 * 1000).toISOString() })}
        t={t}
        now={NOW}
      />,
    );

    expect(screen.getByText(t.item.scoredRetrying(t.relativeTime.hours(4)))).not.toBeNull();
    expect(screen.queryByText(t.item.scoredAt(t.relativeTime.hours(4)))).toBeNull();

    // The dot is --warning, and nothing here is --danger.
    expect(container.innerHTML).toMatch(/bg-warning/);
    expect(container.innerHTML).not.toMatch(/danger/);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a settled run with the prime dot, not the warning one", () => {
    const { container } = render(<Freshness run={view()} t={t} now={NOW} />);

    expect(container.innerHTML).toMatch(/bg-prime/);
    expect(container.innerHTML).not.toMatch(/bg-warning/);
  });
});
