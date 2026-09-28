import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * design-spec.md §4's frame — §17's C-24, C-25 (the browser half), C-26, C-40 and C-44
 * (T0.48). Every check here measures a media query, a painted box or a DOM presence, which
 * is why §17 marks each *browser* and none *dom*.
 *
 * They drive the `/dev` routes: the frame there is the same component the signed-in
 * segments render, over fixture products and a fixture address, and `?delay=` holds a
 * page's content behind its skeleton so the chrome can be observed ahead of it (C-40).
 * Touch is `hasTouch` alone (§7: "at any width"), the viewport set per case.
 */

const LIST = "/dev/list";
const ITEM = "/dev/item";
const SINK = "/dev/primitives";

const TOUCH = { hasTouch: true };

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

/** The frame's own signal: `--layout-mode`, declared on the frame and never on `:root`. */
const modeOf = (page: Page) =>
  page
    .getByTestId("frame")
    .evaluate((node) => getComputedStyle(node).getPropertyValue("--layout-mode").trim());

const rectOf = (locator: Locator) =>
  locator.evaluate((node) => node.getBoundingClientRect().toJSON() as DOMRect);

async function pageAt(browser: Browser, width: number, height: number, touch = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...(touch ? TOUCH : {}),
  });
  const page = await context.newPage();
  return { context, page };
}

/* -------------------------------------------------------------------------- */
/* TC1 → AC1 · C-24                                                           */
/* -------------------------------------------------------------------------- */

test.describe("TC1 · C-24 the four modes switch at exactly 1440, 1280 and 1024", () => {
  for (const [width, mode] of [
    [1439, "standard"],
    [1440, "wide"],
    [1279, "desk"],
    [1280, "standard"],
    [1023, "hand"],
    [1024, "desk"],
  ] as const) {
    test(`reads ${mode} at ${width}, with the ${width >= 1024 ? "sidebar" : "top bar"} alone in the DOM`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(LIST);
      await settle(page);

      expect(await modeOf(page)).toBe(mode);

      // §4: the top bar replaces the sidebar below 1024. Not hidden — absent: after
      // hydration the refused chrome is not in the DOM.
      const sidebar = page.getByTestId("sidebar");
      const topBar = page.getByTestId("top-bar");
      if (width >= 1024) {
        await expect(sidebar).toHaveCount(1);
        await expect(topBar).toHaveCount(0);
        await expect(sidebar).toBeVisible();
      } else {
        await expect(topBar).toHaveCount(1);
        await expect(sidebar).toHaveCount(0);
        await expect(topBar).toBeVisible();
      }
    });
  }

  test("the mode is the frame's, not the document's", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LIST);
    const onRoot = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--layout-mode").trim(),
    );
    expect(onRoot).toBe("");
  });

  /**
   * §4 Geometry: "the sidebar pads 16 inline; the lockup and the switcher are 56 rows, the
   * bar height; … the account slot is a 56 row."
   */
  test("the lockup, the switcher and the account slot are 56 rows inside the sidebar's 16 inline padding", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LIST);
    await settle(page);

    const sidebar = page.getByTestId("sidebar");
    const aside = await sidebar.evaluate((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        paddingLeft: parseFloat(style.paddingLeft),
        paddingRight: parseFloat(style.paddingRight),
        borderRight: parseFloat(style.borderRightWidth),
      };
    });
    expect(Math.round(aside.width)).toBe(240);
    expect(aside.paddingLeft).toBe(16);
    expect(aside.paddingRight).toBe(16);

    for (const id of ["frame-lockup", "frame-switcher", "frame-account"] as const) {
      const row = await rectOf(page.getByTestId(id));
      expect(Math.round(row.height), id).toBe(56);
      expect(Math.round(row.left - aside.left), id).toBe(16);
      expect(Math.round(aside.right - aside.borderRight - row.right), id).toBe(16);
    }

    // The account slot is pinned to the bottom of the sidebar.
    const account = await rectOf(page.getByTestId("frame-account"));
    const asideBottom = await sidebar.evaluate((node) => node.getBoundingClientRect().bottom);
    expect(Math.round(asideBottom - account.bottom)).toBe(0);
  });

  /** §4: nav rows 40 on pointer and 44 on touch — grown for real, flush rows extend no hit area. */
  for (const [touch, height] of [
    [false, 40],
    [true, 44],
  ] as const) {
    test(`nav rows are ${height} on ${touch ? "touch" : "pointer"}`, async ({ browser }) => {
      const { context, page } = await pageAt(browser, 1280, 900, touch);
      await page.goto(LIST);
      await settle(page);

      const rows = page.getByTestId("nav-row");
      await expect(rows).toHaveCount(4);
      const heights = await rows.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );
      expect(heights).toEqual([height, height, height, height]);
      // Flush: no gap between rows, and the first sits 16 below the switcher.
      const tops = await rows.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
      for (let i = 1; i < tops.length; i += 1) expect(tops[i]! - tops[i - 1]!).toBe(height);
      const switcher = await rectOf(page.getByTestId("frame-switcher"));
      expect(Math.round(tops[0]! - switcher.bottom)).toBe(16);
      await context.close();
    });
  }
});

/* -------------------------------------------------------------------------- */
/* TC2 → AC2 · C-25                                                           */
/* -------------------------------------------------------------------------- */

test.describe("TC2 · C-25 the read-only line", () => {
  /**
   * §4: "the line is 768 on touch and 600 on pointer … every mutation absent from the page,
   * not disabled". The writes on main are the gap moves; `/dev/item` renders three accepts
   * and one reopen inside `data-writes` carriers.
   */
  for (const [width, touch, present] of [
    [599, false, false],
    [640, false, true],
    [767, true, false],
    [768, true, true],
  ] as const) {
    test(`${width} on ${touch ? "touch" : "pointer"}: the writes are ${present ? "present" : "absent"}`, async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, width, 900, touch);
      await page.goto(ITEM);
      await settle(page);

      const writes = page.locator("[data-writes]");
      if (present) {
        await expect(writes).toHaveCount(4);
        await expect(page.locator("main button[type=submit]")).toHaveCount(4);
        await expect(page.locator("main").getByText("Accept this risk")).toHaveCount(3);
        // Present means present: never disabled.
        await expect(page.locator("[data-writes] [disabled]")).toHaveCount(0);
      } else {
        await expect(writes).toHaveCount(0);
        // Absent from the DOM, not hidden in it.
        await expect(page.locator("main button[type=submit]")).toHaveCount(0);
        await expect(page.locator("main").getByText("Accept this risk")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Reopen" })).toHaveCount(0);
        // What happened stays: the settled stamp and the evidence are not writes.
        await expect(page.getByText("You accepted this", { exact: false })).toHaveCount(1);
      }
      await context.close();
    });
  }

  /**
   * §4: "**except the auth flow**, which must be fully usable at 375". The email step on
   * `/sign-in`, and the code step's controls — the OTP group and the resend — on the sink,
   * since a browser cannot be sent a code; each rendered, enabled and unclipped, no
   * horizontal scroll.
   */
  test("the auth flow completes at 375×600: every control rendered, enabled, unclipped", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 600 });

    const unclipped = (locator: Locator) =>
      locator.evaluate((node) => ({
        clipped: node.scrollWidth > node.clientWidth + 1,
        inside:
          node.getBoundingClientRect().left >= 0 &&
          node.getBoundingClientRect().right <= window.innerWidth,
      }));

    await page.goto("/sign-in");
    await settle(page);
    const email = page.getByLabel("Email");
    const send = page.getByRole("button", { name: "Send code" });
    await expect(email).toBeVisible();
    await expect(email).toBeEnabled();
    await expect(send).toBeVisible();
    await expect(send).toBeEnabled();
    expect(await unclipped(send)).toEqual({ clipped: false, inside: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

    await page.goto(SINK);
    await settle(page);
    const resend = page.getByRole("button", { name: "Send a new code" });
    await resend.scrollIntoViewIfNeeded();
    await expect(resend).toBeVisible();
    await expect(resend).toBeEnabled();
    expect(await unclipped(resend)).toEqual({ clipped: false, inside: true });
    const group = resend.locator("xpath=preceding::*[@role='group'][1]");
    const boxes = group.locator("input");
    await expect(boxes).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) {
      await expect(boxes.nth(i)).toBeEnabled();
      expect(await unclipped(boxes.nth(i))).toEqual({ clipped: false, inside: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });
});

/* -------------------------------------------------------------------------- */
/* TC3 → AC3 · C-26                                                           */
/* -------------------------------------------------------------------------- */

test.describe("TC3 · C-26 the 768 line", () => {
  const R_LG = "24px";
  const R_MD = "20px";

  const settledDialog = async (page: Page) => {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Past the entrance: §6's rise moves the surface while it runs.
    await dialog.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    return dialog;
  };

  const corners = (dialog: Locator) =>
    dialog.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
      };
    });

  for (const touch of [false, true]) {
    const on = touch ? "touch" : "pointer";

    /**
     * §8.21: "Below 768 a modal and a side sheet are both bottom sheets: glass recipe
     * without blur, `--r-lg` on the top corners only, rising from the bottom edge … at most
     * 90% of the viewport tall, `env(safe-area-inset-bottom)` padded … a grabber — 36×4 —
     * drawn on touch and not on pointer; the modal's footer lg, full width, stacked, primary
     * last."
     */
    test(`at 767 on ${on} a modal is a bottom sheet`, async ({ browser }) => {
      const { context, page } = await pageAt(browser, 767, 900, touch);
      await page.goto(SINK);
      await page.getByRole("button", { name: "confirm modal" }).click();
      const dialog = await settledDialog(page);

      const rect = await rectOf(dialog);
      expect(Math.round(rect.bottom)).toBe(900);
      expect(Math.round(rect.left)).toBe(0);
      expect(Math.round(rect.right)).toBe(767);
      expect(rect.height).toBeLessThanOrEqual(900 * 0.9);
      expect(await corners(dialog)).toEqual({
        topLeft: R_LG,
        topRight: R_LG,
        bottomLeft: "0px",
        bottomRight: "0px",
      });
      const paint = await dialog.evaluate((node) => ({
        blur: getComputedStyle(node).backdropFilter,
        overflow: getComputedStyle(document.body).overflow,
      }));
      expect(paint.blur === "none" || paint.blur === "").toBe(true);
      // The page behind never scrolls.
      expect(paint.overflow).toBe("hidden");

      const grabber = page.getByTestId("grabber");
      if (touch) {
        await expect(grabber).toBeVisible();
        const box = await rectOf(grabber);
        expect(Math.round(box.width)).toBe(36);
        expect(Math.round(box.height)).toBe(4);
        expect(Math.round(box.top - rect.top)).toBe(8);
      } else {
        await expect(grabber).toBeHidden();
      }

      // The footer: lg, full width, stacked, primary last.
      const cancel = await rectOf(dialog.getByRole("button", { name: "Cancel" }));
      const primary = await rectOf(dialog.getByRole("button", { name: "Looks right" }));
      expect(Math.round(cancel.height)).toBe(48);
      expect(Math.round(primary.height)).toBe(48);
      expect(Math.round(cancel.width)).toBe(Math.round(primary.width));
      // Full width: the surface's own 20 padding and 1px border on each side, no more.
      expect(Math.round(primary.left - rect.left)).toBe(21);
      expect(Math.round(rect.right - primary.right)).toBe(21);
      expect(primary.top).toBeGreaterThan(cancel.bottom);
      await context.close();
    });

    test(`at 767 on ${on} a side sheet is a bottom sheet with its pinned header`, async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, 767, 900, touch);
      await page.goto(SINK);
      await page.getByRole("button", { name: "side sheet" }).click();
      const dialog = await settledDialog(page);

      const rect = await rectOf(dialog);
      expect(Math.round(rect.bottom)).toBe(900);
      expect(Math.round(rect.width)).toBe(767);
      expect(rect.height).toBeLessThanOrEqual(900 * 0.9);
      expect(await corners(dialog)).toEqual({
        topLeft: R_LG,
        topRight: R_LG,
        bottomLeft: "0px",
        bottomRight: "0px",
      });

      // §8.21: the 56 header — display-md title and a Neutral 34 close — at every width.
      const title = dialog.getByRole("heading", { name: "Side sheet" });
      const close = dialog.getByRole("button", { name: "Close" });
      await expect(title).toBeVisible();
      await expect(close).toBeVisible();
      const header = await title.evaluate((node) => ({
        height: Math.round(node.parentElement!.getBoundingClientRect().height),
        size: getComputedStyle(node).fontSize,
      }));
      expect(header).toEqual({ height: 56, size: "18px" });
      const closeBox = await rectOf(close);
      expect(Math.round(closeBox.width)).toBe(34);
      expect(Math.round(closeBox.height)).toBe(34);
      if (touch) await expect(page.getByTestId("grabber")).toBeVisible();
      else await expect(page.getByTestId("grabber")).toBeHidden();

      await close.click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await context.close();
    });
  }

  /** §8.21: "At 768–1023 a modal keeps its maxima, centred, and a side sheet keeps its 480." */
  test("at 768 the modal keeps its maxima and the sheet its 480", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(SINK);

    await page.getByRole("button", { name: "confirm modal" }).click();
    let dialog = await settledDialog(page);
    let rect = await rectOf(dialog);
    expect(Math.round(rect.width)).toBe(400);
    expect(Math.round(rect.left + rect.width / 2)).toBe(384);
    expect(await corners(dialog)).toEqual({
      topLeft: R_MD,
      topRight: R_MD,
      bottomLeft: R_MD,
      bottomRight: R_MD,
    });
    await expect(page.getByTestId("grabber")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "content modal" }).click();
    dialog = await settledDialog(page);
    expect(Math.round((await rectOf(dialog)).width)).toBe(640);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "side sheet" }).click();
    dialog = await settledDialog(page);
    rect = await rectOf(dialog);
    expect(Math.round(rect.width)).toBe(480);
    expect(Math.round(rect.right)).toBe(768);
    expect(Math.round(rect.height)).toBe(900);
    expect(await corners(dialog)).toEqual({
      topLeft: R_LG,
      topRight: "0px",
      bottomLeft: R_LG,
      bottomRight: "0px",
    });
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  });

  /** §8.20: below 768 a toast spans the width less 16 gutters, 16 above `env(safe-area-inset-bottom)`. */
  test("the toast spans the width less 32 above the safe-area inset at 767", async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 812 });
    await page.goto(SINK);
    await page.getByRole("button", { name: "undo toast" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    await toast.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    const rect = await rectOf(toast);
    expect(Math.round(rect.left)).toBe(16);
    expect(Math.round(rect.right)).toBe(767 - 16);
    expect(Math.round(rect.bottom)).toBe(812 - 16);
    const region = page.getByRole("region", { name: "Notifications" });
    expect(await region.evaluate((node) => getComputedStyle(node).bottom)).toBe("16px");
  });

  /**
   * §8.19 and §8.26: below 768 the tab row and the pipeline strip "scroll rather than
   * wrap", the active one in view. Read as the rule — nowrap, sideways overflow, segments
   * that never shrink — at 767, and as the fact at 280, where the strip cannot fit.
   */
  for (const touch of [false, true]) {
    test(`tabs and the strip scroll rather than wrap on ${touch ? "touch" : "pointer"}`, async ({
      browser,
    }) => {
      const { context, page } = await pageAt(browser, 767, 900, touch);
      await page.goto(SINK);
      await settle(page);

      const tabs = page.getByRole("tablist", { name: "Preview tabs" });
      expect(
        await tabs.evaluate((node) => ({
          overflow: getComputedStyle(node).overflowX,
          wrap: getComputedStyle(node).flexWrap,
        })),
      ).toEqual({ overflow: "auto", wrap: "nowrap" });

      const strip = page.getByRole("navigation", { name: "Your work" }).last();
      const measured = await strip.evaluate((node) => {
        const style = getComputedStyle(node);
        const segments = [...node.querySelectorAll("a")];
        const active = node.querySelector<HTMLElement>("[aria-current]")!;
        const box = node.getBoundingClientRect();
        const activeBox = active.getBoundingClientRect();
        return {
          overflow: style.overflowX,
          wrap: style.flexWrap,
          shrink: segments.map((segment) => getComputedStyle(segment).flexShrink),
          grow: segments.map((segment) => getComputedStyle(segment).flexGrow),
          heights: segments.map((segment) => Math.round(segment.getBoundingClientRect().height)),
          clipped: segments.some((segment) =>
            [...segment.querySelectorAll("span")].some(
              (span) => span.scrollWidth > span.clientWidth,
            ),
          ),
          activeInView: activeBox.left >= box.left && activeBox.right <= box.right,
        };
      });
      expect(measured.overflow).toBe("auto");
      expect(measured.wrap).toBe("nowrap");
      expect(measured.shrink.every((value) => value === "0")).toBe(true);
      expect(measured.grow.every((value) => value === "0")).toBe(true);
      expect(measured.heights.every((height) => height === 48)).toBe(true);
      expect(measured.clipped).toBe(false);
      expect(measured.activeInView).toBe(true);

      // Where it cannot fit, it scrolls — and lands with the active segment in view.
      await page.setViewportSize({ width: 280, height: 900 });
      await page.goto(SINK);
      await settle(page);
      const narrow = await page
        .getByRole("navigation", { name: "Your work" })
        .last()
        .evaluate((node) => {
          const box = node.getBoundingClientRect();
          const active = node.querySelector<HTMLElement>("[aria-current]")!.getBoundingClientRect();
          return {
            overflows: node.scrollWidth > node.clientWidth,
            scrolled: node.scrollLeft > 0,
            activeInView: active.left >= box.left - 0.5 && active.right <= box.right + 0.5,
            clipped: [...node.querySelectorAll("a span")].some(
              (span) => span.scrollWidth > span.clientWidth,
            ),
          };
        });
      expect(narrow.overflows).toBe(true);
      expect(narrow.clipped).toBe(false);
      expect(narrow.activeInView).toBe(true);
      expect(narrow.scrolled).toBe(true);
      await context.close();
    });
  }
});

/* -------------------------------------------------------------------------- */
/* TC4 → AC4 · C-40                                                           */
/* -------------------------------------------------------------------------- */

test.describe("TC4 · C-40 chrome before data", () => {
  const HELD_MS = 4000;

  /**
   * "On every route the sidebar or top bar, the page topbar and the dock are in the DOM
   * and interactive before the route's first data request resolves, and the only skeletons
   * inside them are the topbar's title and freshness slots" — the dock being T3.2's. The
   * request is held by the fixture's `?delay=`; the proof that it was still held when the
   * chrome was measured is the content mark's absence.
   */
  for (const [route, chromeSkeletons] of [
    [LIST, 0],
    [ITEM, 2],
    [SINK, 0],
  ] as const) {
    for (const [width, chrome] of [
      [1280, "sidebar"],
      [768, "top-bar"],
    ] as const) {
      test(`${route} at ${width}: the ${chrome} and the page topbar stand and answer while the content is held`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        // `load` waits for the whole stream; the shell is what this measures.
        await page.goto(`${route}?delay=${HELD_MS}`, { waitUntil: "commit" });

        const bar = page.getByTestId(chrome);
        const topbar = page.getByTestId("page-topbar");
        await expect(bar).toBeVisible();
        await expect(topbar).toBeVisible();
        // Hydrated: the chrome the viewport refuses leaves the DOM only once React has
        // run, and "interactive" is a claim about a hydrated island.
        await expect(page.getByTestId(chrome === "sidebar" ? "top-bar" : "sidebar")).toHaveCount(0);

        // Held: the content has not committed.
        const contentMarks = () =>
          page.evaluate(() => performance.getEntriesByName("aenima:content").length);
        expect(await contentMarks()).toBe(0);

        // The content column shows its own skeleton, and no spinner; the chrome
        // skeletons nothing but the item topbar's two slots.
        await expect(page.locator("main [aria-busy='true']")).toHaveCount(1);
        await expect(page.locator("main .spinner-ring")).toHaveCount(0);
        await expect(topbar.locator(".shimmer")).toHaveCount(chromeSkeletons);
        await expect(bar.locator(".shimmer")).toHaveCount(0);
        await expect(bar.locator("[disabled], [aria-busy='true']")).toHaveCount(0);

        // Interactive: the switcher opens.
        await page.getByTestId("frame-switcher").click();
        const menu = page.getByRole("menu", { name: "Your work" });
        await expect(menu).toBeVisible();
        await expect(menu.getByRole("menuitem", { name: "All" })).toBeVisible();
        expect(await contentMarks()).toBe(0);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();

        // And the nav navigates: the dashboard row leads to the fixture list, where
        // the content arrives.
        if (chrome === "top-bar") {
          await page.getByTestId("frame-menu").click();
          await page.getByRole("menuitem", { name: "Dashboard" }).click();
        } else {
          await page.getByRole("link", { name: "Dashboard" }).click();
        }
        await expect(page).toHaveURL(/\/dev\/list$/);
        await expect(page.getByTestId("item-row").first()).toBeVisible();
      });
    }
  }
});

/* -------------------------------------------------------------------------- */
/* TC5 → AC5 · C-44                                                           */
/* -------------------------------------------------------------------------- */

test.describe("TC5 · C-44 200% zoom at 1280 on a pointer device", () => {
  /**
   * §13: "At 200% browser zoom every string stays readable and whole and no control clips:
   * the px breakpoints (§4) carry the layout into the narrower mode." 1280 at 200% is a 640
   * CSS px viewport at a device scale of 2 — hand chrome on pointer rules, above the 600
   * line, so the writes stay.
   */
  const STRINGS: Record<string, readonly string[]> = {
    [SINK]: [
      "scored 6 h ago — retrying",
      "Nothing needs you right now",
      "Back to dashboard",
      "Retry",
      "Send a new code",
    ],
    // §10's line stands beside the hollow track on the unscored item page.
    ["/dev/item?run=none"]: ["Connect AI to activate scoring"],
  };

  // The item's writes: three accepts and one reopen, and with no run — no expansion,
  // so no check-line moves — the two on the gap cards.
  for (const [route, writes] of [
    [SINK, 0],
    [ITEM, 4],
    ["/dev/item?run=none", 2],
  ] as const) {
    test(`${route}: hand chrome, its writes present, every string whole, nothing clipped`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: 640, height: 450 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.goto(route);
      await settle(page);

      expect(await modeOf(page)).toBe("hand");
      await expect(page.getByTestId("top-bar")).toBeVisible();
      await expect(page.locator("[data-writes]")).toHaveCount(writes);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(640);

      {
        for (const text of STRINGS[route] ?? []) {
          const found = page.getByText(text, { exact: true }).first();
          await expect(found, text).toHaveCount(1);
          const whole = await found.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return (
              node.scrollWidth <= node.clientWidth + 1 &&
              rect.left >= 0 &&
              rect.right <= window.innerWidth
            );
          });
          expect(whole, text).toBe(true);
        }
      }

      // No control's text is clipped, and no title is allowed to truncate.
      const clipped = await page.evaluate(() => {
        const visible = (el: Element) => el.getClientRects().length > 0;
        const controls = [...document.querySelectorAll('button, [role="tab"], nav a, h1')].filter(
          visible,
        );
        return controls
          .filter((el) => {
            const style = getComputedStyle(el);
            const truncates = style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap";
            return el.scrollWidth > el.clientWidth + 1 || (el.tagName === "H1" && truncates);
          })
          .map((el) => `${el.tagName} ${(el.textContent ?? "").trim().slice(0, 40)}`);
      });
      expect(clipped).toEqual([]);
      await context.close();
    });
  }
});
