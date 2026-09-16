import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";

import { ItemLine, type ItemLineData } from "./ItemLine";

const t = getDictionary();

const line = (overrides: Partial<ItemLineData> = {}): ItemLineData => ({
  key: "soc-12",
  title: "Weekly digest email",
  type: "feature",
  stage: "design",
  ...overrides,
});

/**
 * One item under an opportunity.
 *
 * The line exists to get someone back to the item, so the link and the key it
 * is built from are the whole of it. Stage is rendered labelled, because a
 * derived value shown bare reads as a field someone could set.
 */
describe("ItemLine", () => {
  it("links to the item by the key people say out loud", () => {
    render(<ItemLine item={line()} t={t} />);

    const link = screen.getByRole("link", { name: /Weekly digest email/ });
    expect(link.getAttribute("href")).toBe("/i/soc-12");
    expect(screen.getByText("soc-12")).toBeTruthy();
  });

  it("names the type and the derived stage from the dictionary", () => {
    render(<ItemLine item={line({ stage: "define" })} t={t} />);

    expect(screen.getByText(t.itemTypes.feature)).toBeTruthy();
    expect(screen.getByText(`${t.item.stageLabel}: ${t.stages.define}`)).toBeTruthy();
  });
});
