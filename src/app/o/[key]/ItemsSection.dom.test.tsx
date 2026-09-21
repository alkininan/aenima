import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";

import { ItemsSection } from "./ItemsSection";
import type { ItemLineData } from "./ItemLine";

const t = getDictionary();

const item = (key: string, overrides: Partial<ItemLineData> = {}): ItemLineData => ({
  key,
  title: `Item ${key}`,
  type: "feature",
  stage: "define",
  ...overrides,
});

/**
 * What the opportunity page says about the work under it.
 *
 * The branch worth holding is the empty one. §12 makes an opportunity nobody has
 * bet on yet a normal state rather than an error, so the section owes a sentence
 * — a heading over nothing answers the question it was navigated to ask with
 * silence, and silence here reads as a page that failed to load.
 */
describe("ItemsSection", () => {
  it("says so in words when nothing is being worked on yet", () => {
    render(<ItemsSection items={[]} t={t} />);

    expect(screen.getByText(t.opportunity.noItems)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("lists every item when there are some, and says nothing about emptiness", () => {
    render(<ItemsSection items={[item("soc-1"), item("soc-2"), item("soc-5")]} t={t} />);

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/i/soc-1",
      "/i/soc-2",
      "/i/soc-5",
    ]);
    expect(screen.queryByText(t.opportunity.noItems)).toBeNull();
  });

  /** §3's eyebrow, bound to the region, so the page is navigable by heading. */
  it("labels the region from the dictionary", () => {
    render(<ItemsSection items={[item("soc-1")]} t={t} />);

    const region = screen.getByRole("region", { name: t.opportunity.items });
    expect(region).toBeTruthy();
  });
});
