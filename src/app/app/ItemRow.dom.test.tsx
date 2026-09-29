import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemRow, type ItemRowData } from "@/app/app/ItemRow";
import { LIST_FIXTURE, LIST_NOW, LIST_T } from "@/app/dev/list-fixture";

// The row's overflow menu reads the app router for "Open"; there is none in
// jsdom, and none is needed to read a timestamp.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const HOUR = 60 * 60 * 1000;

/** Whole utilities, not substrings: `before:opacity-60` is not `opacity-60`. */
const tokens = (node: Element) => new Set((node.getAttribute("class") ?? "").split(/\s+/));

/** The fixture's unscored Flowing row, three hours old. */
const BASE = LIST_FIXTURE[2]!;

function paint(overrides: Partial<ItemRowData>, tabStop = false) {
  render(<ItemRow item={{ ...BASE, ...overrides }} t={LIST_T} now={LIST_NOW} tabStop={tabStop} />);
  const row = screen.getByTestId("item-row");
  return {
    row,
    text: row.textContent ?? "",
    dot: screen.getByTestId("freshness-dot"),
    name: row.querySelector<HTMLAnchorElement>("a[data-row-link]")!,
  };
}

/**
 * design-spec.md §10 and §12 (T0.49): a row's freshness is §12's ladder string alone — "6 h
 * ago", at most 8 characters — and a queued retry is the `--warning` dot with the readout
 * unchanged. "scored" and "updated" belong to the item page; neither fits the 72 column.
 *
 * The strings are read back from the dictionary rather than typed here, so the test says
 * which line the row chose and not what the line happens to say.
 */
describe("ItemRow freshness", () => {
  it("reads the newest run's clock once the item has been scored, as the ladder string alone", () => {
    const { text, dot } = paint({ scoredAt: LIST_NOW - 6 * HOUR, retrying: false });

    expect(text).toContain(LIST_T.relativeTime.hours(6));
    expect(text).not.toContain(LIST_T.relativeTime.hours(3));
    expect(text).not.toContain(LIST_T.item.scoredAt(LIST_T.relativeTime.hours(6)));
    expect(dot.className).toContain("bg-prime");
  });

  it("marks a queued retry with the warning dot alone, the readout unchanged, never red", () => {
    const { text, dot } = paint({ scoredAt: LIST_NOW - 6 * HOUR, retrying: true });

    expect(text).toContain(LIST_T.relativeTime.hours(6));
    expect(text).not.toContain("retrying");
    expect(dot.className).toContain("bg-warning");
    expect(dot.className).not.toContain("bg-danger");
  });

  it("keeps last activity while nothing has scored the item", () => {
    const { text, dot } = paint({ scoredAt: null, retrying: false });

    expect(text).toContain(LIST_T.relativeTime.hours(3));
    expect(text).not.toContain("updated");
    expect(dot.className).toContain("bg-prime");
  });

  // The item page shows a retry beside a number, never on its own; the row
  // says the same. A flag with no run behind it is not a state §10 names.
  it("shows no retry without a run to put it beside", () => {
    const { text, dot } = paint({ scoredAt: null, retrying: true });

    expect(text).toContain(LIST_T.relativeTime.hours(3));
    expect(dot.className).toContain("bg-prime");
  });
});

/**
 * §8.27's composition (T0.49): the name is the link → the type, bare → one gap chip and an
 * overflow count → the dot and a readout → the overflow trigger. No key on the row: §8.27
 * lists none and its addends budget none.
 */
describe("ItemRow composition", () => {
  it("shows one gap chip reading priority and id, and counts the rest as a chip", () => {
    const { row, text } = paint({
      gaps: [
        { id: "g1", checkId: "prd-10", tag: "must" },
        { id: "g2", checkId: "prd-8", tag: "should" },
        { id: "g3", checkId: "prd-5", tag: "should" },
      ],
    });

    // §8.9: "Must · {check id}", the id in mono-readout inside the ui-caption chip.
    const chip = row.querySelector<HTMLAnchorElement>('a[href$="#check-prd-10"]')!;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe(LIST_T.item.gapChip.must("prd-10"));
    expect(within(chip).getByText("prd-10").className).toContain("type-mono-readout");
    expect(chip.className).toContain("bg-warning-soft");

    // One chip, never a second id; the rest is a count in mono-readout on --surface-2.
    expect(text).not.toContain("prd-8");
    expect(text).not.toContain("prd-5");
    const count = screen.getByText(LIST_T.list.moreGaps(2));
    expect(count.className).toContain("type-mono-readout");
    expect(count.closest("span[class*='bg-surface-2']")).not.toBeNull();
  });

  // §8.27: "The gap chip is a link to the item page with the check list expanded and that
  // check scrolled into view" — a link, composed off the row's own destination.
  it("links the chip to the check's line on the item page", () => {
    render(
      <ItemRow
        item={{ ...BASE, gaps: [{ id: "g1", checkId: "prd-10", tag: "must" }] }}
        t={LIST_T}
        now={LIST_NOW}
        href="/dev/item"
      />,
    );
    const chip = screen.getByRole("link", { name: LIST_T.item.gapChip.must("prd-10") });
    expect(chip.getAttribute("href")).toBe("/dev/item?check=prd-10#check-prd-10");
  });

  it("carries no key: the name is the link, and the type stands bare beside it", () => {
    const { row, text, name } = paint({});

    expect(text).not.toContain(BASE.key);
    expect(name.textContent).toBe(BASE.title);
    expect(name.getAttribute("href")).toBe(`/i/${BASE.key}`);
    // The type, mono-micro with no container.
    const type = within(row).getByText(LIST_T.itemTypes[BASE.type]);
    expect(type.className).toContain("type-mono-micro");
    expect(type.className).not.toMatch(/(?:^|\s)(?:bg-|border(?:$|\s|-))/);
  });

  // §13: lists are a grid of one Tab stop — row and cells carry their roles.
  it("is a row of gridcells", () => {
    const { row } = paint({});
    expect(row.getAttribute("role")).toBe("row");
    expect(row.querySelectorAll('[role="gridcell"]').length).toBeGreaterThanOrEqual(5);
  });
});

/**
 * §11 (T0.49): "one Tab stop — the current row's name carries `tabindex="0"` and every other
 * row's name and every row's controls `-1`". The walker moves the stop; the row seeds it.
 */
describe("ItemRow tab stop", () => {
  it("puts the stop on the current row's name and nowhere else", () => {
    const { row, name } = paint(
      { idle: true, gaps: [{ id: "g1", checkId: "prd-5", tag: "should" }] },
      true,
    );
    expect(name.getAttribute("tabindex")).toBe("0");

    const controls = row.querySelectorAll<HTMLElement>("[data-row-control]");
    // The chip, Park and the overflow trigger.
    expect(controls).toHaveLength(3);
    for (const control of controls) expect(control.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps every other row's name out of the tab order", () => {
    const { name } = paint({}, false);
    expect(name.getAttribute("tabindex")).toBe("-1");
  });
});

/**
 * §4's read-only line (T0.49): the overflow trigger and Park are mutations and sit inside
 * `WriteGate`; the freshness readout takes Park's place back below the line, in CSS.
 */
describe("ItemRow writes", () => {
  it("gates the overflow trigger and Park, and not the chip", () => {
    const { row } = paint({ idle: true, gaps: [{ id: "g1", checkId: "prd-5", tag: "should" }] });

    const trigger = within(row).getByRole("button", { name: LIST_T.list.itemMenu(BASE.title) });
    expect(trigger.closest("[data-writes]")).not.toBeNull();
    const park = within(row).getByRole("button", { name: LIST_T.list.park });
    expect(park.closest("[data-writes]")).not.toBeNull();
    expect(row.querySelector("a[href$='#check-prd-5']")?.closest("[data-writes]")).toBeNull();
  });

  it("keeps the idle row's readout for below the line, shown there by CSS", () => {
    const { row } = paint({ idle: true });

    const readout = within(row).getByText(LIST_T.relativeTime.hours(3));
    expect(readout.className).toContain("hidden");
    expect(readout.className).toContain("touch:max-md:inline");
    expect(readout.className).toContain("pointer:max-[600px]:inline");
  });

  it("shows a live row's readout at every width", () => {
    const { row } = paint({ idle: false });
    const readout = within(row).getByText(LIST_T.relativeTime.hours(3));
    expect(readout.className).not.toContain("hidden");
  });
});

/**
 * §2 Dimming (T0.49): "Opacity never touches text." The idle row's name steps to
 * `--n-secondary`; the dot, the chip fills and the accent go to .60; the chip's text
 * keeps its tone. The whole-row `opacity-60` is gone.
 */
describe("ItemRow idle", () => {
  it("dims the non-text parts and steps the name to --n-secondary, never the row", () => {
    const { row, dot, name } = paint({
      idle: true,
      gaps: [{ id: "g1", checkId: "prd-5", tag: "should" }],
    });

    expect(tokens(row).has("opacity-60")).toBe(false);
    expect(name.className).toContain("text-n-secondary");
    expect(name.className).not.toContain("opacity");
    expect(tokens(dot).has("opacity-60")).toBe(true);
    // The accent is a per-row segment; the idle row's dims.
    expect(tokens(row).has("before:opacity-60")).toBe(true);

    // The chip's fill is a layer at .60 beneath text that keeps its tone.
    const chip = row.querySelector<HTMLElement>("a[href$='#check-prd-5']")!;
    expect(chip.className).toContain("text-n-secondary");
    expect(chip.className).not.toContain("opacity");
    const fill = chip.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(tokens(fill).has("opacity-60")).toBe(true);
    expect(fill.className).toContain("bg-surface-2");
  });

  // §8.27: "the freshness readout gives way to a Soft sm 'Park?' in its place" — 28 tall,
  // which is why a line is 28 — inert until T1.6 wires the tap.
  it("stands Park in the freshness column as a Soft sm, doing nothing yet", () => {
    const { row } = paint({ idle: true });

    const park = within(row).getByRole("button", { name: LIST_T.list.park });
    expect(park.className).toContain("bg-prime-soft");
    expect(park.className).toContain("h-[28px]");
    expect(park.getAttribute("type")).toBe("button");
    expect(park.closest('[role="gridcell"]')).toBe(
      screen.getByTestId("freshness-dot").closest('[role="gridcell"]'),
    );
  });

  it("leaves a live row's name in --n-primary and its parts at 1", () => {
    const { row, dot, name } = paint({ idle: false });
    expect(name.className).toContain("text-n-primary");
    expect(tokens(dot).has("opacity-60")).toBe(false);
    expect(tokens(row).has("before:opacity-60")).toBe(false);
    expect(within(row).queryByRole("button", { name: LIST_T.list.park })).toBeNull();
  });
});
