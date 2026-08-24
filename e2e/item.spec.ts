import { expect, test } from "@playwright/test";

/**
 * The item page, measured in a real browser.
 *
 * **These drive `/dev/item`, not `/i/<key>`** — the real page is behind the
 * proxy, the same wall `/app` is behind, and Playwright cannot complete an
 * emailed code. Per the build log, a preview must render on the same side of the
 * RSC boundary as the surface it previews, so `/dev/item` is a Server Component
 * rendering the same components over a fixture.
 *
 * The fixture is also the only place most of this can be seen: no seeded item
 * has a single activity row, only one has gaps, and none has a superseded
 * decision. Real data would leave three of these tests measuring empty states.
 */

// §2 tokens, resolved.
const AGENT = "rgb(167, 139, 255)";
const SURFACE_1 = "rgb(21, 23, 28)";

for (const width of [1440, 768, 375] as const) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/item");
      await page.evaluate(() => document.fonts.ready);
    });

    /**
     * §4: "item page = content 1fr / chat 380px", and the dock becomes an
     * overlay drawer below 1024.
     *
     * The 380 column is reserved before the dock exists so that building it
     * fills a column rather than reflowing the page. Measured as the grid's
     * resolved template, because that is the thing that has to hold — a column
     * that is merely empty looks identical to one that is missing.
     */
    test("reserves the chat column above 1024 and collapses below it", async ({ page }) => {
      const columns = await page
        .locator("main > div")
        .first()
        .evaluate((node) => getComputedStyle(node).gridTemplateColumns);

      const tracks = columns.split(" ").filter(Boolean);

      if (width >= 1024) {
        expect(tracks).toHaveLength(2);
        expect(Math.round(parseFloat(tracks[1]!))).toBe(380);
      } else {
        expect(tracks).toHaveLength(1);
      }
    });

    /**
     * §8's doc reader caps a document at 68ch, because longer lines lose the
     * reader between one and the next.
     *
     * `ch` is font-relative, so the assertion measures 68 of them in the
     * reader's own font rather than hardcoding a pixel value that would be
     * wrong the next time §3 moves.
     */
    test("holds the reading measure at 68ch", async ({ page }) => {
      const measured = await page
        .getByTestId("doc-reader")
        .first()
        .evaluate((node) => {
          const probe = document.createElement("div");
          probe.style.width = "68ch";
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          node.appendChild(probe);
          const expected = probe.getBoundingClientRect().width;
          probe.remove();

          return { maxWidth: getComputedStyle(node).maxWidth, expected };
        });

      expect(measured.maxWidth).not.toBe("none");
      expect(parseFloat(measured.maxWidth)).toBeCloseTo(measured.expected, 0);
    });
  });
}

test.describe("at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/item");
    await page.evaluate(() => document.fonts.ready);
  });

  /**
   * §1 law 7: a settled gap is a visible debt that a named person accepted.
   * All three dispositions are on the page at once — the accepted and excluded
   * ones dimmed rather than removed, because removing one deletes the name.
   */
  test("shows every gap disposition, settled ones dimmed rather than hidden", async ({ page }) => {
    await expect(page.getByText("MN-2")).toBeVisible();
    await expect(page.getByText("MN-7")).toBeVisible();
    await expect(page.getByText("SF-1")).toBeVisible();

    const opacities = await page
      .getByRole("listitem")
      .filter({ hasText: /MN-7|SF-1/ })
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node.firstElementChild!).opacity),
      );

    expect(opacities.length).toBeGreaterThan(0);
    // §0 law 7 dims settled work; it never reddens it.
    expect(opacities.every((opacity) => opacity === "0.6")).toBe(true);
  });

  /**
   * §5: "a failure quotes the exact gap." Evidence is the body of the card, not
   * something behind a disclosure — §1 law 3 makes a number that cannot be
   * interrogated something that does not ship.
   */
  test("quotes the evidence on the page rather than behind anything", async ({ page }) => {
    await expect(page.getByText("'nearby' — same venue, or within 100 m?")).toBeVisible();
  });

  /**
   * §2 lineage: the opportunity is the thing that explains why an item exists,
   * so an item that shows its product but not its opportunity hides it.
   *
   * **Text, not a link.** `/o/<key>` is reserved and unbuildable — opportunities
   * have no key column — and a link that navigates nowhere is worse than none.
   * The assertion is that the title is on the page *and* that nothing around it
   * is an anchor, because "add a link later" is exactly the change that would
   * otherwise slip in untested.
   */
  test("shows the opportunity as text, with no link to a page that does not exist", async ({
    page,
  }) => {
    // Exact: the fixture's brief opens with the same sentence, which is what a
    // real one would do — an item's opportunity is usually restated in its
    // artifacts, so a loose matcher finds two things here and would find two on
    // real data as well.
    const lineage = page.getByText("People miss what changed while they were away", {
      exact: true,
    });

    await expect(lineage).toBeVisible();
    expect(await lineage.evaluate((node) => node.closest("a") !== null)).toBe(false);
    await expect(page.locator('main a[href^="/o/"]')).toHaveCount(0);
  });

  // §0 law 4: anything the machine did is visibly the machine's.
  test("renders an agent actor in --agent", async ({ page }) => {
    const colour = await page
      .getByText("scorer", { exact: true })
      .evaluate((node) => getComputedStyle(node).color);

    expect(colour).toBe(AGENT);
  });

  /**
   * §5 stamps an accepted gap with the accepter, and the schema cannot name
   * anyone but the reader — migration 0003 removed the foreign key so a person
   * can be deleted without rewriting history. What must never appear is the raw
   * uuid standing in for a name.
   */
  test("names the reader and says 'someone' for anyone else, never a uuid", async ({ page }) => {
    const body = (await page.locator("main").textContent()) ?? "";

    expect(body).toContain("You");
    expect(body).toContain("Someone");
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  // §11: a correction is a new decision naming the one it replaced, so the
  // replaced one is marked rather than removed — an append-only log is a record,
  // not a statement of current opinion.
  test("marks a superseded decision instead of dropping it", async ({ page }) => {
    await expect(page.getByText("Digest ships daily")).toBeVisible();
    await expect(page.getByText("Digest ships weekly, not daily")).toBeVisible();
    await expect(page.getByText("Superseded")).toBeVisible();
  });

  // §5 cards are --surface-1 with the inset edge at 10% — quieter than glass,
  // and §0 law 10 keeps glass off content entirely.
  test("puts gap evidence on a card, and the card is not glass", async ({ page }) => {
    const card = page.getByRole("listitem").first().locator("> *").first();

    const style = await card.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        radius: computed.borderTopLeftRadius,
        shadow: computed.boxShadow,
        filter: computed.backdropFilter,
      };
    });

    expect(style.background).toBe(SURFACE_1);
    expect(style.radius).toBe("16px");
    // The inset specular edge, §0 law 5's signature at a card's volume.
    expect(style.shadow).toContain("inset");
    // §0 law 10: glass is the navigation layer. A card floats nowhere.
    expect(["none", ""]).toContain(style.filter);
  });

  // Read-only. Nothing on this page is a control, because every action §5 and
  // §13 would put here is a mutation that does not exist yet.
  test("offers no controls", async ({ page }) => {
    // Scoped to `main`: `next dev` injects its own overlay button into the
    // document, which is not the page's and would fail this for the wrong reason.
    const content = page.locator("main");

    await expect(content.getByRole("button")).toHaveCount(0);
    await expect(content.getByRole("textbox")).toHaveCount(0);
    await expect(content.getByRole("checkbox")).toHaveCount(0);
  });
});
