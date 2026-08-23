import { describe, expect, it } from "vitest";

import { NAV, ROUTES, itemHref, listHref } from "@/lib/routes";

describe("routes", () => {
  it("keys an item by the key people say out loud, never a uuid", () => {
    expect(itemHref("soc-12")).toBe("/i/soc-12");
  });

  /**
   * The nav must never render a link to a page that does not exist — an
   * unbuilt destination is visibly inactive, not a 404. Only the list is built
   * in T1.2, and this is what would catch someone flipping a flag before the
   * page exists.
   */
  it("marks only the list as built", () => {
    expect(NAV.filter((entry) => entry.built).map((entry) => entry.href)).toEqual([ROUTES.app]);
  });
});

describe("listHref", () => {
  it("writes no query at all when nothing is filtered", () => {
    expect(listHref({}, {})).toBe("/app");
  });

  it("sets one filter", () => {
    expect(listHref({}, { stage: "define" })).toBe("/app?stage=define");
  });

  // Each control changes its own filter and leaves the other alone — a stage
  // segment must not silently drop the product the person chose.
  it("keeps the filter it was not asked to change", () => {
    expect(listHref({ product: "sociera" }, { stage: "define" })).toBe(
      "/app?stage=define&product=sociera",
    );
  });

  // Null clears, which is how a segment toggles itself off.
  it("clears a filter on null and returns to the bare path", () => {
    expect(listHref({ stage: "define" }, { stage: null })).toBe("/app");
    expect(listHref({ stage: "define", product: "sociera" }, { stage: null })).toBe(
      "/app?product=sociera",
    );
  });

  // Undefined is "leave it", which is not the same as "clear it".
  it("distinguishes leaving a filter from clearing it", () => {
    const current = { stage: "define" };

    expect(listHref(current, {})).toBe("/app?stage=define");
    expect(listHref(current, { stage: undefined })).toBe("/app?stage=define");
  });
});
