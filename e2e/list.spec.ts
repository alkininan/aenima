import { expect, test } from "@playwright/test";

/**
 * §13's list surface, measured in a real browser.
 *
 * **These drive /dev/primitives, not /app.** The list is behind the proxy — an
 * anonymous visit to /app redirects to /sign-in — and Playwright cannot complete
 * an emailed one-time code, which is the same wall the sign-in code step hit and
 * the same answer the repo settled on for it. So `ItemRow`, `BucketSection`,
 * `PipelineStrip` and `Meter` are presentational components over props, /app
 * composes them with real data, and the preview renders the identical
 * components over a fixture. What is asserted here is geometry and paint, both
 * of which belong to the components; which item lands in which bucket belongs to
 * `src/lib/buckets.ts` and is covered there.
 *
 * Every assertion reads a computed value rather than a class list. A meter that
 * renders 0% and a meter that renders hollow have identical markup except for a
 * child that may or may not exist, and §10's rule is about what a person sees.
 */

// §2 tokens, resolved.
const PRIME = "rgb(33, 184, 220)";
const WARNING = "rgb(235, 169, 47)";

const listSection = (page: import("@playwright/test").Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "List surface" }) });

for (const width of [1440, 768, 375] as const) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/primitives");
      // §3 loads the faces with `font-display: swap`; measuring before the swap
      // compares fallback metrics against real ones for no reason.
      await page.evaluate(() => document.fonts.ready);
    });

    /**
     * §4 density: "List rows 56". A fixed height rather than a minimum — a row
     * that grew with its content would break the rhythm the list is scanned by,
     * and the failure would only show on the one row with a long title.
     */
    test("every row is exactly 56 high", async ({ page }) => {
      const rows = listSection(page).getByTestId("item-row");
      await expect(rows.first()).toBeVisible();

      const heights = await rows.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );

      expect(heights.length).toBeGreaterThan(0);
      expect(heights.every((height) => height === 56)).toBe(true);
    });

    /**
     * §8: "2px bucket accent (`--prime` your-move / `--warning` at-risk / none
     * flowing)", and §4 reserves 2px for meaning.
     *
     * Flowing's border is transparent rather than absent, so every row is the
     * same width and the titles line up — asserting the *width* is 2 on all
     * three is what catches someone "simplifying" that away.
     */
    test("the bucket accent is 2px, and its colour says which bucket", async ({ page }) => {
      const accents = await listSection(page)
        .getByTestId("item-row")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              bucket: node.getAttribute("data-bucket"),
              width: style.borderLeftWidth,
              color: style.borderLeftColor,
            };
          }),
        );

      expect(accents.every((accent) => accent.width === "2px")).toBe(true);

      expect(accents.find((accent) => accent.bucket === "your_move")?.color).toBe(PRIME);
      expect(accents.find((accent) => accent.bucket === "at_risk")?.color).toBe(WARNING);
      // Not merely "some other colour" — nothing painted at all.
      expect(accents.find((accent) => accent.bucket === "flowing")?.color).toBe("rgba(0, 0, 0, 0)");
    });

    /**
     * §10, and the reason `Meter` takes `number | null` rather than a number:
     * "meters render hollow tracks + 'connect AI to activate scoring' — never
     * zeros, never red". Nothing is scored until Phase 2, so a filled meter on
     * this surface would be asserting a score that does not exist, and a 0% one
     * would be asserting a failure.
     *
     * A zero-width fill is invisible, so counting fills is what distinguishes
     * "hollow" from "rendered at zero" — the two look identical.
     */
    test("no meter on a row renders a fill, at zero width or any other", async ({ page }) => {
      const meters = await listSection(page)
        .getByTestId("item-row")
        .evaluateAll((nodes) =>
          nodes.flatMap((node) =>
            [...node.querySelectorAll('[role="progressbar"], [role="img"]')].map((meter) => ({
              role: meter.getAttribute("role"),
              children: meter.children.length,
              value: meter.getAttribute("aria-valuenow"),
            })),
          ),
        );

      expect(meters.length).toBeGreaterThan(0);
      // Hollow: an image with a text alternative, not a progressbar pinned at 0
      // — which is what a screen reader would otherwise announce.
      expect(meters.every((meter) => meter.role === "img")).toBe(true);
      expect(meters.every((meter) => meter.children === 0)).toBe(true);
      expect(meters.every((meter) => meter.value === null)).toBe(true);
    });

    // §8: "gap chips (max 2 + overflow)". The fixture's first row has three.
    test("shows at most two gap chips and counts the rest", async ({ page }) => {
      const row = listSection(page).getByTestId("item-row").first();
      const text = (await row.textContent()) ?? "";

      // Two check ids and a "+1", never three ids.
      expect(text).toContain("MN-2");
      expect(text).toContain("MN-7");
      expect(text).not.toContain("MN-9");
      expect(text).toContain("+1");
    });
  });
}

test.describe("at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/primitives");
    await page.evaluate(() => document.fonts.ready);
  });

  // §8: "Idle: opacity .60". §1's sixth law — idle work dims, never reddens.
  test("dims an idle row to .60 and gives it the Park chip", async ({ page }) => {
    const idle = listSection(page).getByTestId("item-row").filter({ hasText: "soc-7" });

    expect(await idle.evaluate((node) => getComputedStyle(node).opacity)).toBe("0.6");
    await expect(idle.getByText("Park?")).toBeVisible();
  });

  // Non-idle rows must not be dimmed — otherwise the .60 above proves nothing.
  test("leaves every other row at full opacity", async ({ page }) => {
    const opacities = await listSection(page)
      .getByTestId("item-row")
      .filter({ hasNotText: "soc-7" })
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));

    expect(opacities.length).toBeGreaterThan(0);
    expect(opacities.every((opacity) => opacity === "1")).toBe(true);
  });

  // §13: "Always on top." The order of the sections is the priority.
  test("puts Your move above At risk above Flowing", async ({ page }) => {
    const headers = await listSection(page)
      .getByTestId("bucket-header")
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").replace(/\d+$/, "")));

    expect(headers).toEqual(["Your move", "At risk", "Flowing"]);
  });

  /**
   * §5's nested rule: an inner surface flush inside a rounded container takes
   * the container's radius minus the container's padding, never its own token.
   * The strip is `--r-md` (20) with 4 of padding, so a segment is r16.
   *
   * Read as a computed value, because the failure this catches is someone
   * reaching for `--r-pill` — which is what a segment *looks* like it wants —
   * and 999px inside a 20px corner is exactly the overflow the rule forbids. A
   * class-name assertion would pass on `rounded-pill` and a screenshot would
   * need someone to notice a 4px corner.
   */
  test("the strip's segments take the derived radius, not the pill token", async ({ page }) => {
    const strip = listSection(page).locator("nav").first();

    const measured = await strip.evaluate((node) => {
      const bar = getComputedStyle(node);
      const padding = parseFloat(bar.paddingLeft);
      return {
        barRadius: parseFloat(bar.borderTopLeftRadius),
        padding,
        segments: [...node.querySelectorAll("a")].map((segment) =>
          parseFloat(getComputedStyle(segment).borderTopLeftRadius),
        ),
      };
    });

    // The derivation, not the number: if --r-md or the padding moves, this
    // still says what the rule says.
    const derived = measured.barRadius - measured.padding;
    expect(derived).toBe(16);
    expect(measured.segments.length).toBeGreaterThan(0);
    expect(measured.segments.every((radius) => radius === derived)).toBe(true);

    // And emphatically not the pill token, which is the mistake worth naming.
    expect(measured.segments.every((radius) => radius < measured.barRadius)).toBe(true);
  });

  /**
   * §8: the strip's active segment is `--prime-soft`. Read as a computed
   * background, because "which segment is active" is the one thing a filter
   * strip has to communicate and a class-name test cannot see it.
   */
  test("marks the active pipeline segment and no other", async ({ page }) => {
    const segments = await listSection(page)
      .locator("nav a")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: node.textContent ?? "",
          current: node.getAttribute("aria-current"),
          background: getComputedStyle(node).backgroundColor,
        })),
      );

    const active = segments.filter((segment) => segment.current === "true");
    expect(active).toHaveLength(1);
    expect(active[0]?.text).toContain("Define");
    // --prime-soft is rgba(33,184,220,.14).
    expect(active[0]?.background).toBe("rgba(33, 184, 220, 0.14)");

    for (const segment of segments.filter((s) => s.current !== "true")) {
      expect(segment.background).toBe("rgba(0, 0, 0, 0)");
    }
  });
});

/**
 * The server/client boundary — the topology `/app` has, and the one the rest of
 * this file does not.
 *
 * Every other test here drives `/dev/primitives`, which previews the same
 * components from a client root: `Composites` carries `"use client"`, so nothing
 * below it ever crosses into a client component. `/app` is the opposite — the
 * page, the sidebar and the row are Server Components handing props to two
 * client islands — and that difference shipped a production 500 that every gate
 * passed: unit tests render client components directly, this file drove the
 * client-rooted preview, and `/app` itself is behind auth.
 *
 * `/dev/list` renders the fixture from a Server Component so the boundary
 * actually exists. Its job is to fail. Verified by reintroducing the defect: the
 * page 500s and `/dev/primitives` stays green, which is the hole exactly.
 *
 * A non-serializable prop is a render-time throw rather than a build-time error
 * — `next build` passed with the bug in place, because `/app` is dynamic and is
 * never prerendered — so a page that renders is the only instrument that works.
 */
test.describe("the server/client boundary", () => {
  test("renders the list from a Server Component without a serialization error", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const response = await page.goto("/dev/list");

    // The whole assertion. A function reaching a client component throws while
    // rendering, so the status is what tells you, and the message never makes it
    // to the page in production.
    expect(response?.status()).toBe(200);

    // And it really rendered the tree, rather than an empty shell that would
    // pass the line above while proving nothing.
    await expect(page.getByTestId("item-row").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Actions for/ }).first()).toBeVisible();
  });
});
