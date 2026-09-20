import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BucketSection } from "@/app/app/BucketSection";
import { RowWalker } from "@/app/app/RowWalker";
import { LIST_FIXTURE, LIST_NOW, LIST_T } from "@/app/dev/list-fixture";

// The row's overflow menu reads the app router for "Open"; there is none in
// jsdom, and none is needed to walk the rows.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * design-spec.md §11: "arrow keys walk … list rows".
 *
 * Rendered over the real buckets and the real fixture rather than bare anchors,
 * so the test also proves the row's link carries the stop the walker reads —
 * the wiring, not only the arithmetic `src/lib/roving.test.ts` already covers.
 */
function harness() {
  render(
    <RowWalker>
      {(["your_move", "at_risk", "flowing"] as const).map((bucket) => (
        <BucketSection
          key={bucket}
          bucket={bucket}
          items={LIST_FIXTURE.filter((row) => row.bucket === bucket)}
          t={LIST_T}
          now={LIST_NOW}
        />
      ))}
    </RowWalker>,
  );
  // Visual order: the buckets in §13's order, the rows in each as given.
  const links = screen
    .getAllByTestId("item-row")
    .map((row) => row.querySelector<HTMLAnchorElement>("a[href]"));
  return links as HTMLAnchorElement[];
}

describe("RowWalker", () => {
  it("renders one link per row, in bucket order", () => {
    const links = harness();
    expect(links).toHaveLength(LIST_FIXTURE.length);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/i/soc-12",
      "/i/soc-4",
      "/i/aur-1",
      "/i/soc-7",
    ]);
  });

  it("steps down and up across buckets, wrapping at both ends", async () => {
    const user = userEvent.setup();
    const links = harness();

    links[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[1]);

    // soc-4 is the only at-risk row; Down crosses into Flowing.
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[2]);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(links[0]);

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(links[3]);
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    const links = harness();

    links[1]?.focus();
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(links[3]);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(links[0]);
  });

  it("leaves other keys alone", async () => {
    const user = userEvent.setup();
    const links = harness();

    links[2]?.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("j");
    expect(document.activeElement).toBe(links[2]);
  });

  it("does not walk from the overflow menu's trigger", async () => {
    const user = userEvent.setup();
    harness();

    const trigger = screen.getAllByRole("button", { name: /^Actions for/ })[0];
    trigger?.focus();
    await user.keyboard("{ArrowDown}");
    // Whatever the menu does with Down, focus has not moved to another row's link.
    expect(document.activeElement?.hasAttribute("data-row-link")).toBe(false);
  });
});
