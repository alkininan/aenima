import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getDictionary } from "@/i18n";

import { ItemHeader, type ItemHeaderData } from "./ItemHeader";

const t = getDictionary();

const header = (overrides: Partial<ItemHeaderData> = {}): ItemHeaderData => ({
  key: "soc-12",
  title: "Weekly digest email",
  type: "feature",
  stage: "design",
  productName: "Sociera",
  opportunity: { key: "soc-2", title: "People miss what changed while they were away" },
  ...overrides,
});

/**
 * §2's lineage line, which is what says why an item exists.
 *
 * It was plain text until opportunities had a key (build log, open question 9):
 * `routes.ts` reserves `/o` and keeps its segments short so a URL can be read
 * out, and a uuid would have defeated that. T1.4's `opportunity.key` is what
 * turns the sentence into a destination, and that is the whole of what these
 * hold — that the line goes somewhere, and that an unlinked item still says
 * nothing rather than saying nothing *somewhere*.
 */
describe("ItemHeader lineage", () => {
  it("links the opportunity to its own page, by key", () => {
    render(<ItemHeader item={header()} t={t} />);

    const link = screen.getByRole("link", {
      name: "People miss what changed while they were away",
    });
    expect(link.getAttribute("href")).toBe("/o/soc-2");
  });

  /**
   * §2: "an item may be **unlinked** from any opportunity … never a block." So
   * there is nothing to report, and nothing is said — not an empty label, and
   * not a link to nowhere.
   */
  it("renders no lineage line at all for an unlinked item", () => {
    render(<ItemHeader item={header({ opportunity: null })} t={t} />);

    expect(screen.queryByText(t.item.opportunity)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  /** The label is the dictionary's, never a bare string in the JSX. */
  it("labels the line from the dictionary", () => {
    render(<ItemHeader item={header()} t={t} />);

    expect(screen.getByText(t.item.opportunity)).toBeTruthy();
  });
});
