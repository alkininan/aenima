import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BucketSection } from "@/app/app/BucketSection";
import { RowWalker } from "@/app/app/RowWalker";
import { LIST_FIXTURE, LIST_NOW, LIST_T } from "@/app/dev/list-fixture";

// The row's overflow menu reads the app router for "Open"; there is none in
// jsdom, and none is needed to walk the rows.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * design-spec.md §11 (T0.49): "A list is one Tab stop and a grid inside: Up and Down move
 * between rows; Right and Left walk the focused row's controls in the one-line row's
 * visual order … Enter opens the item from the name; Home and End jump."
 *
 * Rendered over the real buckets and the real fixture rather than bare anchors,
 * so the test also proves the row's link carries the stop the walker reads —
 * the wiring, not only the arithmetic `src/lib/roving.test.ts` already covers.
 */
function harness() {
  render(
    <RowWalker label={LIST_T.list.title}>
      {(["your_move", "at_risk", "flowing"] as const).map((bucket) => (
        <BucketSection
          key={bucket}
          bucket={bucket}
          items={LIST_FIXTURE.filter((row) => row.bucket === bucket)}
          t={LIST_T}
          now={LIST_NOW}
          tabStopKey={LIST_FIXTURE[0]!.key}
        />
      ))}
    </RowWalker>,
  );
  // Visual order: the buckets in §13's order, the rows in each as given.
  const rows = screen.getAllByRole("row");
  const links = rows.map((row) => row.querySelector<HTMLAnchorElement>("a[data-row-link]")!);
  return { rows, links, grid: screen.getByRole("grid") };
}

const controlsOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>("[data-row-link], [data-row-control]"));

describe("RowWalker", () => {
  it("renders one link per row, in bucket order, inside a grid", () => {
    const { links, grid } = harness();
    expect(grid.getAttribute("aria-label")).toBe(LIST_T.list.title);
    expect(links).toHaveLength(LIST_FIXTURE.length);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/i/soc-12",
      "/i/soc-4",
      "/i/aur-1",
      "/i/soc-7",
    ]);
  });

  // §11: one Tab stop — the current row's name, and nothing else in the grid.
  it("is one Tab stop: the first row's name, every other control at -1", () => {
    const { grid, links } = harness();
    const stops = grid.querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(links[0]);
    // Every control in every row is reachable by arrow, not by Tab.
    for (const control of grid.querySelectorAll("a, button")) {
      if (control !== links[0]) expect(control.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("steps down and up across buckets, wrapping at both ends, and moves the stop with it", async () => {
    const user = userEvent.setup();
    const { links } = harness();

    links[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[1]);
    // Roving: the Tab stop follows the current row.
    expect(links[1]?.getAttribute("tabindex")).toBe("0");
    expect(links[0]?.getAttribute("tabindex")).toBe("-1");

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
    const { links } = harness();

    links[1]?.focus();
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(links[3]);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(links[0]);
  });

  /**
   * Right and Left walk the row's controls in the one-line row's visual order — name, gap
   * chip, on an idle row the Park control, overflow trigger — and stop at the row's ends:
   * a grid's row is not a menu, and wrapping Right from the trigger onto the name would
   * read as a jump.
   */
  it("walks a row's controls with Right and Left, name → chip → trigger, stopping at the ends", async () => {
    const user = userEvent.setup();
    const { rows, links } = harness();
    const [name, chip, trigger] = controlsOf(rows[0]!);
    expect(name).toBe(links[0]);
    expect(chip?.getAttribute("href")).toContain("#check-");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(controlsOf(rows[0]!)).toHaveLength(3);

    name?.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(chip);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(trigger);
    // The end: Right goes nowhere.
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(trigger);

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(chip);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(name);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(name);
  });

  it("puts Park between the chip and the trigger on an idle row", async () => {
    const user = userEvent.setup();
    const { rows } = harness();
    const idle = rows[3]!;
    const [name, chip, park, trigger] = controlsOf(idle);
    expect(chip?.getAttribute("href")).toContain("#check-");
    expect(park?.textContent).toBe(LIST_T.list.park);
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");

    name?.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(park);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(trigger);
  });

  // Down from any control in the row lands on the next row's name.
  it("walks rows from the overflow trigger while its menu is closed", async () => {
    const user = userEvent.setup();
    const { rows, links } = harness();

    const trigger = within(rows[0]!).getByRole("button", { name: /^Actions for/ });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[1]);
  });

  // Open, the menu owns its keys: Down walks its rows, not the list's.
  it("leaves an open menu's keys to the menu", async () => {
    const user = userEvent.setup();
    const { rows } = harness();

    const trigger = within(rows[0]!).getByRole("button", { name: /^Actions for/ });
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(menu.contains(document.activeElement)).toBe(true);

    await user.keyboard("{ArrowDown}");
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.hasAttribute("data-row-link")).toBe(false);
  });

  it("leaves other keys alone", async () => {
    const user = userEvent.setup();
    const { links } = harness();

    links[2]?.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("j");
    expect(document.activeElement).toBe(links[2]);
  });
});
