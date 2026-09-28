import { beforeEach, describe, expect, it } from "vitest";

import { rememberReturn, resetReturns, routeKey, takeReturn } from "@/lib/return-focus";

beforeEach(resetReturns);

/**
 * design-spec.md §11: "The way back restores the place. Returning to a list … restores its
 * scroll position and, instead of the main region, focuses the row that was opened … a filter
 * or page in the URL restores with it."
 */
describe("return records", () => {
  it("remembers the row and the scroll position a list was left from, and hands them back once", () => {
    rememberReturn("/app", { row: "soc-7", scrollY: 160 });

    expect(takeReturn("/app")).toEqual({ row: "soc-7", scrollY: 160 });
    // Consumed: the next arrival at the list is a fresh one and focuses the main region.
    expect(takeReturn("/app")).toBeNull();
  });

  it("keys the place on the whole URL, so a filter or a page restores with it", () => {
    rememberReturn(routeKey("/app", "?stage=define"), { row: "soc-4", scrollY: 0 });

    expect(takeReturn(routeKey("/app", ""))).toBeNull();
    expect(takeReturn(routeKey("/app", "?stage=define"))).toEqual({ row: "soc-4", scrollY: 0 });
  });

  it("keeps the newest record for a list", () => {
    rememberReturn("/app", { row: "soc-12", scrollY: 40 });
    rememberReturn("/app", { row: "aur-1", scrollY: 320 });

    expect(takeReturn("/app")).toEqual({ row: "aur-1", scrollY: 320 });
  });

  it("answers nothing for a list never left from a row", () => {
    expect(takeReturn("/app")).toBeNull();
  });
});

describe("routeKey", () => {
  it("joins the pathname and the search as the address bar shows them", () => {
    expect(routeKey("/app", "")).toBe("/app");
    expect(routeKey("/app", "?stage=define")).toBe("/app?stage=define");
    expect(routeKey("/app", "stage=define")).toBe("/app?stage=define");
  });
});
