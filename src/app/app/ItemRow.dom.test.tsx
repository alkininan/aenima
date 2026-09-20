import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemRow, type ItemRowData } from "@/app/app/ItemRow";
import { LIST_FIXTURE, LIST_NOW, LIST_T } from "@/app/dev/list-fixture";

// The row's overflow menu reads the app router for "Open"; there is none in
// jsdom, and none is needed to read a timestamp.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const HOUR = 60 * 60 * 1000;

/** The fixture's unscored Flowing row, three hours old. */
const BASE = LIST_FIXTURE[2]!;

function paint(overrides: Partial<ItemRowData>) {
  render(<ItemRow item={{ ...BASE, ...overrides }} t={LIST_T} now={LIST_NOW} />);
  return {
    text: screen.getByTestId("item-row").textContent ?? "",
    dot: screen.getByTestId("freshness-dot"),
  };
}

/**
 * design-spec.md §10: "Provider outage / retry: freshness shows `--warning` dot
 * + mono-readout 'scored 6 h ago — retrying'; no banners."
 *
 * The strings are read back from the dictionary rather than typed here, so the
 * test says which line the row chose and not what the line happens to say.
 */
describe("ItemRow freshness", () => {
  it("reads the newest run's clock once the item has been scored", () => {
    const { text, dot } = paint({ scoredAt: LIST_NOW - 6 * HOUR, retrying: false });

    expect(text).toContain(LIST_T.item.scoredAt(LIST_T.relativeTime.hours(6)));
    expect(text).not.toContain(LIST_T.list.freshness(LIST_T.relativeTime.hours(3)));
    expect(dot.className).toContain("bg-prime");
  });

  it("marks a queued retry with the warning dot and says so, never red", () => {
    const { text, dot } = paint({ scoredAt: LIST_NOW - 6 * HOUR, retrying: true });

    expect(text).toContain(LIST_T.item.scoredRetrying(LIST_T.relativeTime.hours(6)));
    expect(dot.className).toContain("bg-warning");
    expect(dot.className).not.toContain("bg-danger");
  });

  it("keeps last activity while nothing has scored the item", () => {
    const { text, dot } = paint({ scoredAt: null, retrying: false });

    expect(text).toContain(LIST_T.list.freshness(LIST_T.relativeTime.hours(3)));
    expect(dot.className).toContain("bg-prime");
  });

  // The item page shows a retry beside a number, never on its own; the row
  // says the same. A flag with no run behind it is not a state §10 names.
  it("shows no retry without a run to put it beside", () => {
    const { text, dot } = paint({ scoredAt: null, retrying: true });

    expect(text).toContain(LIST_T.list.freshness(LIST_T.relativeTime.hours(3)));
    expect(dot.className).toContain("bg-prime");
  });
});
