import { describe, expect, it } from "vitest";

import { NAV, ROUTES, checkAnchor, checkHref, gapAnchor, itemHref, listHref } from "@/lib/routes";

describe("routes", () => {
  it("keys an item by the key people say out loud, never a uuid", () => {
    expect(itemHref("soc-12")).toBe("/i/soc-12");
  });

  /**
   * §8.27 (T0.49): the row's gap chip links to the item page "with the check list expanded
   * and that check scrolled into view", so every check line carries an anchor of its own,
   * keyed by check id — distinct from the gap's, which a move's redirect names by uuid.
   */
  it("anchors a check line by its check id, apart from the gap's anchor", () => {
    expect(checkAnchor("prd-10")).toBe("check-prd-10");
    expect(checkAnchor("prd-10")).not.toBe(gapAnchor("prd-10"));
  });

  // The chip's destination names the check twice: the param opens the panel on a client
  // navigation, where the fragment alone reveals nothing; the fragment lands the scroll.
  it("sends the row's chip to the item page with the check named in the query and the fragment", () => {
    expect(checkHref("/i/soc-12", "prd-10")).toBe("/i/soc-12?check=prd-10#check-prd-10");
    expect(checkHref("/dev/item", "prd-10")).toBe("/dev/item?check=prd-10#check-prd-10");
  });

  /**
   * The nav must never render a link to a page that does not exist — an
   * unbuilt destination is visibly inactive, not a 404. Only the dashboard is
   * built, and this is what would catch someone flipping a flag before the
   * page exists.
   */
  it("marks only the dashboard as built", () => {
    expect(NAV.filter((entry) => entry.built).map((entry) => entry.href)).toEqual([ROUTES.app]);
  });

  /**
   * design-spec §4 (T0.48): the nav is Dashboard, Triage, Graveyard, Settings, in that order.
   * Graveyard has no URL until its ticket — `ROUTES` holds every URL the product has, and a
   * route is a public surface nobody invents to fill a row — and Analytics left the nav while
   * its `/an` stays reserved.
   */
  it("is §4's four rows, Graveyard without a route and Analytics gone", () => {
    expect(NAV.map((entry) => entry.label)).toEqual([
      "dashboard",
      "triage",
      "graveyard",
      "settings",
    ]);
    expect(NAV.find((entry) => entry.label === "graveyard")?.href).toBeNull();
    expect(NAV.some((entry) => entry.href === ROUTES.analytics)).toBe(false);
    expect(ROUTES.analytics).toBe("/an");
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
