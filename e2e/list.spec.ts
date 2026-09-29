import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * §8.27's item row and §13's list surface, measured in a real browser (T0.49).
 *
 * **The row's geometry drives `/dev/list`** — the list inside §4's frame, the same
 * `MAIN_CLASSES` and `GUTTER_CLASSES` as `/app`, so its content box is §4's and C-12's
 * container query can be told apart from a viewport query: `?box=` holds the list's
 * wrapper at a width the viewport does not. `/app` itself is behind the proxy — an
 * anonymous visit redirects to `/sign-in`, and Playwright cannot complete an emailed
 * code — so `ItemRow`, `BucketSection` and `RowWalker` are components over props, and the
 * fixture renders the identical ones. Which item lands in which bucket belongs to
 * `src/lib/buckets.ts` and is covered there.
 *
 * **The sink keeps the strip and the walker's arrow cases** it always had.
 *
 * Every assertion reads a computed value rather than a class list: §17 marks every check
 * that measures layout *browser*, never *dom*, because a DOM emulator has no layout.
 */

const LIST = "/dev/list";
const SINK = "/dev/primitives";

// §2 tokens, resolved.
const PRIME = "rgb(33, 184, 220)";
const WARNING = "rgb(235, 169, 47)";
const SURFACE_1 = "rgb(21, 23, 28)";
const SURFACE_2 = "rgb(40, 44, 52)";
const BG_BASE = "rgb(8, 9, 12)";
const N_PRIMARY = "rgb(224, 229, 235)";
const N_SECONDARY = "rgb(157, 163, 176)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** The fixture's rows, by the title the name link carries — the row wears no key (§8.27). */
const TITLES = {
  retrying: "Weekly digest email",
  atRisk: "Rewrite the empty states",
  flowing: "Shared reading lists",
  idle: "Can we diff Figma frames by node id?",
} as const;

const listSection = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "List surface" }) });

const rows = (page: Page) => page.getByTestId("item-row");
const rowNamed = (page: Page, title: string) =>
  rows(page).filter({ has: page.locator(`a[data-row-link]`, { hasText: title }) });

const rectOf = (locator: Locator) =>
  locator.evaluate((node) => node.getBoundingClientRect().toJSON() as DOMRect);

async function settle(page: Page) {
  // §3 loads the faces with `font-display: swap`; measuring before the swap compares
  // fallback metrics against real ones for no reason.
  await page.evaluate(() => document.fonts.ready);
}

async function pageAt(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...(touch ? { hasTouch: true } : {}),
  });
  const page = await context.newPage();
  return { context, page };
}

/* -------------------------------------------------------------------------- */
/* TC1 → AC1 · C-12 the row's line count                                     */
/* -------------------------------------------------------------------------- */

test.describe("TC1 · C-12 the row is one line in a box of 760 and two lines of 72 below it", () => {
  /**
   * §8.27: from §4's columns the break lands in desk narrower than 1048 (the box is
   * vw − 288), in hand chrome narrower than 792 (vw − 32), and never in wide. Each side of
   * both lines, and the phone. At 792 the box is exactly 760 and C-12 reads "one line in a
   * content box of 760 or more" — one line, as at 1048.
   */
  for (const [width, height] of [
    [1440, 56],
    [1048, 56],
    [1047, 72],
    [792, 56],
    [791, 72],
    [375, 72],
  ] as const) {
    test(`every row is ${height} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(LIST);
      await settle(page);

      await expect(rows(page).first()).toBeVisible();
      const heights = await rows(page).evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );
      expect(heights.length).toBeGreaterThan(0);
      expect(heights.every((h) => h === height)).toBe(true);
    });
  }

  /**
   * "Decided by a container query on the list's own content box, never by the viewport."
   * The one case that tells the two apart: the viewport wide, the box held under 760.
   */
  test("the box decides, not the viewport: 72 at 1440 with the box held at 759, 56 at 760", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${LIST}?box=759`);
    await settle(page);
    const narrow = await rows(page).evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
    );
    expect(narrow.every((h) => h === 72)).toBe(true);

    await page.goto(`${LIST}?box=760`);
    await settle(page);
    const wide = await rows(page).evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
    );
    expect(wide.every((h) => h === 56)).toBe(true);
  });

  /**
   * §8.27's two-line row: the name with the freshness readout — or on an idle row its
   * Park — at the trailing edge on the first line; the type and the one chip on the
   * second, with the overflow trigger at its trailing edge. Each line 28, 4 apart, 6 above
   * and below: read off the two 28-tall controls, Park on line one and the trigger on line
   * two, since height governs (§8.1).
   */
  test("lays the two-line row out as §8.27 says, 28 and 28 with 4 between", async ({ page }) => {
    // 791 on pointer: the box is 759, so two lines, and above the 600 line, so Park and the
    // trigger — the two 28-tall controls the lines are read off — stand.
    await page.setViewportSize({ width: 791, height: 900 });
    await page.goto(LIST);
    await settle(page);

    const idle = rowNamed(page, TITLES.idle);
    const row = await rectOf(idle);
    const name = await rectOf(idle.locator("a[data-row-link]"));
    const park = await rectOf(idle.getByRole("button", { name: "Park?" }));
    const type = await rectOf(idle.getByText("Spike", { exact: true }));
    const chip = await rectOf(idle.locator("a[href*='#check-']"));
    const trigger = await rectOf(idle.getByRole("button", { name: /^Actions for/ }));

    // Line one: 6 from the top, 28 tall; the freshness column — dot, then Park in the
    // readout's place — is the line's trailing column, its edge the content's.
    const freshCell = await rectOf(
      idle.getByRole("button", { name: "Park?" }).locator("xpath=ancestor::*[@role='gridcell'][1]"),
    );
    expect(Math.round(park.top - row.top)).toBe(6);
    expect(Math.round(park.height)).toBe(28);
    expect(Math.abs(name.top + name.height / 2 - (park.top + park.height / 2))).toBeLessThan(1);
    expect(Math.round(row.right - freshCell.right)).toBe(16);
    expect(Math.round(freshCell.width)).toBe(72);
    expect(name.right).toBeLessThanOrEqual(freshCell.left);
    // Line two: 4 below it, 28 tall, 6 above the bottom; the trigger at the trailing edge.
    expect(Math.round(trigger.top - park.bottom)).toBe(4);
    expect(Math.round(trigger.height)).toBe(28);
    expect(Math.round(row.bottom - trigger.bottom)).toBe(6);
    expect(Math.round(row.right - trigger.right)).toBe(16);
    const lineTwo = trigger.top + trigger.height / 2;
    expect(Math.abs(type.top + type.height / 2 - lineTwo)).toBeLessThan(1);
    expect(Math.abs(chip.top + chip.height / 2 - lineTwo)).toBeLessThan(1);
    // The type leads line two, the chip follows it; the name leads line one.
    expect(type.left).toBeLessThan(chip.left);
    expect(Math.round(name.left - row.left)).toBe(16);

    // A live row: the readout at line one's trailing edge, the name sharing the line.
    const live = rowNamed(page, TITLES.retrying);
    const liveRow = await rectOf(live);
    const readout = await rectOf(live.getByText("6 h ago", { exact: true }));
    const liveName = await rectOf(live.locator("a[data-row-link]"));
    expect(
      Math.abs(readout.top + readout.height / 2 - (liveName.top + liveName.height / 2)),
    ).toBeLessThan(1);
    expect(readout.top + readout.height / 2).toBeLessThan(liveRow.top + 34);
  });

  // The one-line row: 28 centred in 56, every cell on one line, the trigger trailing.
  test("centres the one-line row's controls in 56, the trigger at the trailing edge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);
    await settle(page);

    const live = rowNamed(page, TITLES.retrying);
    const row = await rectOf(live);
    const name = await rectOf(live.locator("a[data-row-link]"));
    const chip = await rectOf(live.locator("a[href*='#check-']"));
    const readout = await rectOf(live.getByText("6 h ago", { exact: true }));
    const trigger = await rectOf(live.getByRole("button", { name: /^Actions for/ }));

    const middle = row.top + row.height / 2;
    for (const box of [name, chip, readout, trigger]) {
      expect(Math.abs(box.top + box.height / 2 - middle)).toBeLessThan(1);
    }
    expect(Math.round(trigger.height)).toBe(28);
    expect(Math.round(row.right - trigger.right)).toBe(16);
    expect(Math.round(name.left - row.left)).toBe(16);
    expect(name.right).toBeLessThan(chip.left);
    expect(chip.right).toBeLessThan(readout.left);
    expect(readout.right).toBeLessThan(trigger.left);
  });

  // §10: the skeleton follows the same query and both heights, so nothing jumps.
  test("the skeleton's rows take the same height as the rows they stand in for", async ({
    page,
  }) => {
    for (const [width, height] of [
      [1440, 56],
      [375, 72],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      // `commit`, as C-40's cases wait: `load` would fire once the held content had
      // already replaced the skeleton.
      await page.goto(`${LIST}?delay=3000`, { waitUntil: "commit" });
      const skeleton = page.locator("[aria-busy='true'] .item-row").first();
      await expect(skeleton).toBeVisible();
      expect(Math.round((await rectOf(skeleton)).height)).toBe(height);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* TC2 → AC2 · C-46 the list's keys                                          */
/* -------------------------------------------------------------------------- */

/**
 * §11: "A list is one Tab stop and a grid inside." At 1440 on pointer and at 768 on
 * touch — above the read-only line, so the gated controls stand, and under 760, so the
 * row is two lines and the order is the one-line row's anyway.
 */
for (const [width, touch] of [
  [1440, false],
  [768, true],
] as const) {
  test.describe(`TC2 · C-46 at ${width}${touch ? " on touch" : ""}`, () => {
    test("is one Tab stop: Tab from the strip lands on the first row's name, the next leaves", async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(LIST);
      await settle(page);

      await page.locator("nav a").last().focus();
      await page.keyboard.press("Tab");
      await expect(page.locator("a[data-row-link]").first()).toBeFocused();

      await page.keyboard.press("Tab");
      const inGrid = await page.evaluate(
        () => document.activeElement?.closest('[role="grid"]') !== null,
      );
      expect(inGrid).toBe(false);
      await context.close();
    });

    test("walks rows with Down and Up across buckets, wrapping, and jumps with Home and End", async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(LIST);
      await settle(page);
      const links = page.locator("a[data-row-link]");
      await expect(links).toHaveCount(4);

      await links.first().focus();
      await page.keyboard.press("ArrowDown");
      await expect(links.nth(1)).toBeFocused();
      // Up twice from the second row: past the first, round to the last.
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(links.last()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(links.first()).toBeFocused();

      await page.keyboard.press("End");
      await expect(links.last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(links.first()).toBeFocused();

      // And from a control, not only from the name.
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");
      await expect(links.nth(1)).toBeFocused();
      await context.close();
    });

    test("walks a row's controls with Right and Left in the one-line order, stopping at the ends", async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(LIST);
      await settle(page);

      const live = rowNamed(page, TITLES.retrying);
      const name = live.locator("a[data-row-link]");
      const chip = live.locator("a[href*='#check-']");
      const trigger = live.getByRole("button", { name: /^Actions for/ });

      await name.focus();
      await page.keyboard.press("ArrowRight");
      await expect(chip).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(chip).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(name).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(name).toBeFocused();

      // The idle row: name → chip → Park → trigger, at both heights.
      const idle = rowNamed(page, TITLES.idle);
      await idle.locator("a[data-row-link]").focus();
      await page.keyboard.press("ArrowRight");
      await expect(idle.locator("a[href*='#check-']")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(idle.getByRole("button", { name: "Park?" })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(idle.getByRole("button", { name: /^Actions for/ })).toBeFocused();
      await context.close();
    });

    test("opens the item with Enter on the name", async ({ browser }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(LIST);
      await settle(page);

      await page.locator("a[data-row-link]").first().focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/dev\/item$/);
      await context.close();
    });

    // §8.27: "modifier clicks on the row stay the browser's" — the name's `::after` covers
    // the row's empty surface, so a Cmd/Ctrl-click anywhere on it opens a new page.
    test("opens a new page on a modifier-click on the row's empty surface", async ({ browser }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(LIST);
      await settle(page);

      const live = rowNamed(page, TITLES.flowing);
      const row = await rectOf(live);
      const name = await rectOf(live.locator("a[data-row-link]"));
      // Past the name's text, on the row's own surface — inside the name's `::after`.
      const x = Math.min(name.right + 24, row.right - 200) - row.left;
      const [opened] = await Promise.all([
        context.waitForEvent("page"),
        live.click({ position: { x, y: row.height / 2 }, modifiers: ["ControlOrMeta"] }),
      ]);
      await opened.waitForURL(/\/dev\/item$/);
      expect(new URL(opened.url()).pathname).toBe("/dev/item");
      await expect(page).toHaveURL(/\/dev\/list$/);
      await context.close();
    });
  });
}

/* -------------------------------------------------------------------------- */
/* TC3 → AC3 · §8.27, §2 Dimming on the row                                  */
/* -------------------------------------------------------------------------- */

test.describe("TC3 · §8.27 and §2 on the row, at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);
    await settle(page);
  });

  /**
   * §8.27: "one gap chip + an overflow count". §8.9: on a row the chip reads "Must ·
   * {check id}", the id in mono-readout; the count is a chip, `--surface-2`, "+{n}" in
   * mono-readout, at most 44 wide — never a badge. The fixture's first row has three gaps.
   */
  test("shows one chip reading priority and id, and a count chip of at most 44, never a third id", async ({
    page,
  }) => {
    const row = rowNamed(page, TITLES.retrying);
    const text = (await row.textContent()) ?? "";
    expect(text).toContain("Must · prd-10");
    expect(text).toContain("+2");
    expect(text).not.toContain("prd-8");
    expect(text).not.toContain("prd-5");

    const chip = row.locator("a[href*='#check-prd-10']");
    const id = chip.getByText("prd-10", { exact: true });
    expect(await id.evaluate((node) => getComputedStyle(node).fontFamily)).toContain(
      "JetBrains Mono",
    );
    expect(await chip.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      "rgba(235, 169, 47, 0.12)",
    );
    expect(Math.round((await rectOf(chip)).height)).toBe(24);

    const count = row.getByText("+2", { exact: true });
    expect(await count.evaluate((node) => getComputedStyle(node).fontFamily)).toContain(
      "JetBrains Mono",
    );
    const countChip = count.locator("xpath=..");
    expect(await countChip.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      SURFACE_2,
    );
    expect((await rectOf(countChip)).width).toBeLessThanOrEqual(44);
  });

  /**
   * §2 Dimming: "An idle row sets its name and readouts in `--n-secondary` and applies
   * opacity .60 to its non-text parts only — accent, meters, dots, chip fills." No text
   * under opacity, and every other row at 1.
   */
  test("dims the idle row's dot, chip fill and accent to .60, its name to --n-secondary, and no text", async ({
    page,
  }) => {
    const idle = rowNamed(page, TITLES.idle);

    expect(
      await idle.locator("a[data-row-link]").evaluate((node) => getComputedStyle(node).color),
    ).toBe(N_SECONDARY);
    expect(
      await idle.getByTestId("freshness-dot").evaluate((n) => getComputedStyle(n).opacity),
    ).toBe("0.6");
    // The accent segment across this row's span.
    const accent = await idle.evaluate((node) => {
      const style = getComputedStyle(node, "::before");
      return { opacity: style.opacity, width: style.width, color: style.backgroundColor };
    });
    expect(accent.opacity).toBe("0.6");
    expect(accent.width).toBe("2px");
    // The chip: the fill layer at .60, the chip and its text at 1, the text in its tone.
    const chip = idle.locator("a[href*='#check-']");
    expect(await chip.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    expect(await chip.evaluate((node) => getComputedStyle(node).color)).toBe(N_SECONDARY);
    const fill = chip.locator("[aria-hidden='true']");
    expect(await fill.evaluate((node) => getComputedStyle(node).opacity)).toBe("0.6");
    expect(await fill.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(SURFACE_2);
    // The row itself, and every element holding text, at 1.
    const textUnderOpacity = await idle.evaluate((node) => {
      const holdsText = (el: Element) =>
        [...el.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim());
      const dimmed = (el: Element): boolean => {
        for (let at: Element | null = el; at && at !== node.parentElement; at = at.parentElement) {
          if (getComputedStyle(at).opacity !== "1") return true;
        }
        return false;
      };
      return [...node.querySelectorAll("*")].filter(holdsText).some(dimmed);
    });
    expect(textUnderOpacity).toBe(false);
    await expect(idle.getByRole("button", { name: "Park?" })).toBeVisible();

    // Every other row: name in --n-primary, dot and accent at 1, no Park.
    const others = rows(page).filter({ hasNotText: TITLES.idle });
    await expect(others).toHaveCount(3);
    const measured = await others.evaluateAll((nodes) =>
      nodes.map((node) => ({
        name: getComputedStyle(node.querySelector("a[data-row-link]")!).color,
        dot: getComputedStyle(node.querySelector("[data-testid='freshness-dot']")!).opacity,
        accent: getComputedStyle(node, "::before").opacity,
        row: getComputedStyle(node).opacity,
      })),
    );
    for (const m of measured) {
      expect(m).toEqual({ name: N_PRIMARY, dot: "1", accent: "1", row: "1" });
    }
    await expect(others.getByRole("button", { name: "Park?" })).toHaveCount(0);
  });

  /**
   * §10 and §12: the readout is the ladder string alone, at most 8 characters; a retrying
   * row shows the `--warning` dot with its readout unchanged. The fixture holds §10's own
   * example six hours old with a retry queued, a scored row without, and a row nothing has
   * scored, which keeps last activity.
   */
  test("keeps every readout to 8 characters, warning-dotted while a retry is queued", async ({
    page,
  }) => {
    const dotColour = (title: string) =>
      rowNamed(page, title)
        .getByTestId("freshness-dot")
        .evaluate((node) => getComputedStyle(node).backgroundColor);

    await expect(rowNamed(page, TITLES.retrying)).toContainText("6 h ago");
    await expect(rowNamed(page, TITLES.retrying)).not.toContainText("retrying");
    await expect(rowNamed(page, TITLES.retrying)).not.toContainText("scored");
    expect(await dotColour(TITLES.retrying)).toBe(WARNING);

    await expect(rowNamed(page, TITLES.atRisk)).toContainText("2 d ago");
    expect(await dotColour(TITLES.atRisk)).toBe(PRIME);

    await expect(rowNamed(page, TITLES.flowing)).toContainText("3 h ago");
    await expect(rowNamed(page, TITLES.flowing)).not.toContainText("updated");
    expect(await dotColour(TITLES.flowing)).toBe(PRIME);

    const readouts = await rows(page).evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node.querySelector("[data-testid='freshness-dot'] ~ span")?.textContent?.trim() ?? "",
      ),
    );
    expect(readouts).toHaveLength(4);
    for (const readout of readouts) expect(readout.length).toBeLessThanOrEqual(8);
  });

  /**
   * §8.27: "2px bucket accent (`--prime` your-move / `--warning` at-risk / none flowing)",
   * unbroken down the group's left edge. Since T0.49 each row draws its own segment,
   * inside its padding and a pixel taller than itself so no hairline breaks the line —
   * which is what lets one row's span dim alone. The rows carry no border of their own.
   */
  test("runs one 2px accent down each group, coloured by bucket, unbroken by the hairlines", async ({
    page,
  }) => {
    const accents = await rows(page).evaluateAll((nodes) =>
      nodes.map((node) => {
        const before = getComputedStyle(node, "::before");
        return {
          bucket: node.getAttribute("data-bucket"),
          width: before.width,
          top: before.top,
          bottom: before.bottom,
          left: before.left,
          color: before.backgroundColor,
          rowBorder: getComputedStyle(node).borderLeftWidth,
          groupBorder: getComputedStyle(node.parentElement!).borderLeftWidth,
        };
      }),
    );
    expect(accents.length).toBe(4);
    for (const accent of accents) {
      expect(accent.width).toBe("2px");
      // Over the hairline above, to the row's bottom: contiguous with the row above.
      expect(accent.top).toBe("-1px");
      expect(accent.bottom).toBe("0px");
      expect(accent.left).toBe("0px");
      expect(accent.rowBorder).toBe("0px");
      expect(accent.groupBorder).toBe("0px");
    }
    expect(accents.find((a) => a.bucket === "your_move")?.color).toBe(PRIME);
    expect(accents.find((a) => a.bucket === "at_risk")?.color).toBe(WARNING);
    // Not merely "some other colour" — nothing painted at all.
    expect(
      accents.filter((a) => a.bucket === "flowing").every((a) => a.color === TRANSPARENT),
    ).toBe(true);
  });

  /**
   * §8.27 (v2.15): rows are a continuous ledger, not detached cards — flush on one
   * `--surface-1` surface, divided by 1px `--bg-base` hairlines, `--r-sm` on the group.
   * Measured as geometry rather than as classes: what this catches is a `gap-[4px]` or a
   * `rounded-sm` creeping back onto the row, either of which turns the ledger back into a
   * stack.
   */
  test("rows in a bucket share one surface, hairline-divided", async ({ page }) => {
    const measured = await rows(page).evaluateAll((nodes) => {
      // The largest group, because a divider needs two rows to exist.
      const groups = [...new Set(nodes.map((node) => node.parentElement!))];
      const group = groups.reduce((widest, candidate) =>
        candidate.children.length > widest.children.length ? candidate : widest,
      );
      const rows = [...group.children];
      const boxes = rows.map((row) => row.getBoundingClientRect());
      return {
        rows: rows.length,
        fills: rows.map((row) => getComputedStyle(row).backgroundColor),
        groupFill: getComputedStyle(group).backgroundColor,
        rowRadii: rows.map((row) => getComputedStyle(row).borderTopLeftRadius),
        groupRadius: getComputedStyle(group).borderTopLeftRadius,
        gaps: boxes.slice(1).map((box, i) => Math.round(box.top - boxes[i]!.bottom)),
        paddings: rows.map((row) => getComputedStyle(row).paddingLeft),
        columnGap: rows.map((row) => getComputedStyle(row).columnGap),
      };
    });

    expect(measured.rows).toBeGreaterThan(1);
    expect(measured.gaps.every((gap) => gap === 1)).toBe(true);
    expect(measured.fills.every((fill) => fill === SURFACE_1)).toBe(true);
    expect(measured.groupFill).toBe(BG_BASE);
    expect(measured.groupRadius).toBe("16px");
    expect(measured.rowRadii.every((radius) => radius === "0px")).toBe(true);
    // §8.27's addends: inline padding 16, column gap 8.
    expect(measured.paddings.every((p) => p === "16px")).toBe(true);
    expect(measured.columnGap.every((g) => g === "8px")).toBe(true);
  });

  /**
   * §10: "Row micro-meters do not render at all without a key." Absence is the assertion,
   * made against the roles a meter would take in either state.
   */
  test("a row renders no meter at all while nothing is scored", async ({ page }) => {
    const meters = await rows(page).evaluateAll(
      (nodes) =>
        nodes.flatMap((node) => [...node.querySelectorAll('[role="progressbar"], [role="img"]')])
          .length,
    );
    expect(meters).toBe(0);
  });

  // §13: "Always on top." The order of the sections is the priority.
  test("puts Your move above At risk above Flowing", async ({ page }) => {
    const headers = await page
      .getByTestId("bucket-header")
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").replace(/\d+$/, "")));
    expect(headers).toEqual(["Your move", "At risk", "Flowing"]);
  });

  /**
   * The server/client boundary — the topology `/app` has. `/dev/list` renders the fixture
   * from a Server Component so the boundary actually exists; a non-serializable prop is a
   * render-time throw, so a page that renders is the only instrument that works.
   */
  test("renders the list from a Server Component without a serialization error", async ({
    page,
  }) => {
    const response = await page.goto(LIST);
    expect(response?.status()).toBe(200);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Actions for/ }).first()).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* TC4 → AC4 · §8.9 the count badge, the chip's landing                      */
/* -------------------------------------------------------------------------- */

test.describe("TC4 · §8.9 on the list, at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);
    await settle(page);
  });

  /**
   * §8.9: "Count badges: display-num in a `--surface-2` pill, 30h — the 22 line with 4
   * above and below — pad 10, the chip's; a badge stands only where a count is a headline
   * beside a title" — the bucket header.
   */
  test("the bucket header's count badge is 30 tall, display-num, padded 10, on --surface-2", async ({
    page,
  }) => {
    const badges = await page
      .getByTestId("bucket-header")
      .locator("span")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return {
            height: Math.round(node.getBoundingClientRect().height),
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight,
            background: style.backgroundColor,
            family: style.fontFamily,
            lineHeight: style.lineHeight,
            radius: style.borderTopLeftRadius,
          };
        }),
      );
    expect(badges.length).toBe(3);
    for (const badge of badges) {
      expect(badge.height).toBe(30);
      expect(badge.paddingLeft).toBe("10px");
      expect(badge.paddingRight).toBe("10px");
      expect(badge.background).toBe(SURFACE_2);
      expect(badge.family).toContain("Space Grotesk");
      expect(badge.lineHeight).toBe("22px");
      expect(parseFloat(badge.radius)).toBeGreaterThanOrEqual(15);
    }
  });

  /**
   * §8.27: "The gap chip is a link to the item page with the check list expanded (§8.24)
   * and that check scrolled into view." Followed from the list by the app's own
   * navigation, as a person would.
   */
  test("the gap chip lands on the item page with the check list open and the line in view", async ({
    page,
  }) => {
    await rowNamed(page, TITLES.retrying).locator("a[href*='#check-prd-10']").click();
    await expect(page).toHaveURL(/\/dev\/item.*#check-prd-10$/);

    await expect(page.getByTestId("check-list")).toBeVisible();
    const line = page.locator("#check-prd-10");
    await expect(line).toBeVisible();
    const inView = await line.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    expect(inView).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The sink keeps the strip and the walker's arrow cases                     */
/* -------------------------------------------------------------------------- */

test.describe("the sink's list surface, at 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SINK);
    await settle(page);
  });

  /**
   * design-spec §11: "arrow keys walk … list rows". Driven in a real browser because focus
   * is the browser's: the DOM test proves the wiring, this proves a key press on the page
   * moves the ring. The walk crosses buckets and wraps at both ends.
   */
  test("walks the rows with the arrow keys, across buckets, wrapping at the ends", async ({
    page,
  }) => {
    const links = listSection(page).locator("a[data-row-link]");
    await expect(links).toHaveCount(4);

    await links.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(links.nth(1)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(links.last()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(links.first()).toBeFocused();

    await page.keyboard.press("End");
    await expect(links.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(links.first()).toBeFocused();
  });

  /**
   * §5's nested rule: an inner surface flush inside a rounded container takes the
   * container's radius minus the container's padding, never its own token. The strip is
   * `--r-md` (20) with 6 of padding (§8.26), so a segment is r14.
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

    const derived = measured.barRadius - measured.padding;
    expect(measured.padding).toBe(6);
    expect(derived).toBe(14);
    expect(measured.segments.length).toBeGreaterThan(0);
    expect(measured.segments.every((radius) => radius === derived)).toBe(true);
    expect(measured.segments.every((radius) => radius < measured.barRadius)).toBe(true);
  });

  /**
   * §8: the strip's active segment is `--prime-soft`. Read as a computed background,
   * because "which segment is active" is the one thing a filter strip has to communicate.
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
    expect(active[0]?.background).toBe("rgba(33, 184, 220, 0.14)");

    for (const segment of segments.filter((s) => s.current !== "true")) {
      expect(segment.background).toBe(TRANSPARENT);
    }
  });
});
