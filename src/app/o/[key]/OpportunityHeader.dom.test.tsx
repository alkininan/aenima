import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OpportunityHeader, type OpportunityHeaderData } from "./OpportunityHeader";

const header = (overrides: Partial<OpportunityHeaderData> = {}): OpportunityHeaderData => ({
  key: "soc-3",
  title: "New users don't return after week 1",
  summary: "Retention drops sharply between day 3 and day 7.",
  productName: "Sociera",
  ...overrides,
});

/**
 * §4's topbar for an opportunity.
 *
 * The one branch worth holding is the summary: §2 makes it nullable, so an
 * opportunity carrying only a title is a legal one, and the header has to say
 * nothing rather than render an empty line under the title.
 */
describe("OpportunityHeader", () => {
  it("names the opportunity by the key people say out loud", () => {
    render(<OpportunityHeader opportunity={header()} />);

    expect(screen.getByText("soc-3")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "New users don't return after week 1" }),
    ).toBeTruthy();
  });

  it("renders the summary when there is one", () => {
    render(<OpportunityHeader opportunity={header()} />);

    expect(screen.getByText("Retention drops sharply between day 3 and day 7.")).toBeTruthy();
  });

  /**
   * The element count is the assertion, not the text query. A `<p>` rendered
   * around a null summary is *empty*, so it is invisible to `queryByText` — the
   * defect this guards against would pass a text-absence check while painting
   * the 8px gap and the line box §4's subtitle slot reserves. The text query is
   * here too, saying what the count means.
   */
  it("renders no summary line when there is none", () => {
    const { container } = render(<OpportunityHeader opportunity={header({ summary: null })} />);

    expect(screen.queryByText("Retention drops sharply between day 3 and day 7.")).toBeNull();

    // One `<p>` remains — the product eyebrow — and it is not the summary slot.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Sociera");
  });

  it("places the opportunity in its product", () => {
    render(<OpportunityHeader opportunity={header()} />);

    expect(screen.getByText("Sociera")).toBeTruthy();
  });
});
