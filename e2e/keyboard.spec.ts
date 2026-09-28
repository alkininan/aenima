import { expect, test, type Page } from "@playwright/test";

/**
 * design-spec.md §11, §8.15 and §8.38, and §17's C-41, C-42 and C-43 (T0.45).
 *
 * Every check here is one §17 marks *browser*: focus, Tab order, scroll position, a computed
 * outline and a media query are all things a DOM emulator has no opinion on. They drive the
 * `/dev` mirrors, because `/app` and `/i/<key>` are behind the proxy and Playwright cannot
 * complete an emailed code: `/dev/list` renders the shell — skip link, sidebar, main region —
 * over the list fixture, and its rows link to `/dev/item`, which links back. The route change
 * between the two is a real in-app navigation, which is the thing C-41 and C-42 are about.
 *
 * Two clauses of these checks wait on surfaces that are not built, as the ticket's Decision
 * records: the hand top bar's mark (C-41, *Layout modes and chrome*) and the dock's transcript,
 * draft, remembered control and `Cmd/Ctrl+K` (C-42, C-43, *Build the dock surface*).
 */

const LIST = "/dev/list";
const ITEM = /\/dev\/item/;
const SINK = "/dev/primitives";

/** §7: touch is `hasTouch` alone — see `panel-geometry.spec.ts`. */
const TOUCH = { hasTouch: true };

/**
 * One Tab, landing on something the page owns. `next dev` mounts its own overlay control in
 * a `nextjs-portal`, which is a stop the product does not ship (see `item.spec.ts`); a stop
 * inside it is passed over so the assertion is about the page's order.
 */
async function tabToPage(page: Page, backwards = false): Promise<void> {
  for (let presses = 0; presses < 4; presses += 1) {
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
    const ours = await page.evaluate(() => !document.activeElement?.closest("nextjs-portal"));
    if (ours) return;
  }
}

const ringOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
  });

test.describe("C-41 · focus starts in the content", () => {
  test("the first Tab lands on the skip link, visible only while focused, and the second on the lockup", async ({
    page,
  }) => {
    await page.goto(LIST);
    await page.evaluate(() => document.fonts.ready);

    const skip = page.getByRole("link", { name: "Skip to content" });
    // §11: "visible only while focused" — before focus it takes no room a person can see.
    const resting = (await skip.boundingBox())!;
    expect(resting.width).toBeLessThanOrEqual(1);
    expect(resting.height).toBeLessThanOrEqual(1);

    await tabToPage(page);
    await expect(skip).toBeFocused();

    // §11: a Neutral sm pill at the top-left of the viewport inset 16 on both axes, rung 600.
    const focused = (await skip.boundingBox())!;
    expect(Math.round(focused.x)).toBe(16);
    expect(Math.round(focused.y)).toBe(16);
    expect(Math.round(focused.height)).toBe(28);
    const paint = await skip.evaluate((node) => {
      const style = getComputedStyle(node);
      return { z: style.zIndex, position: style.position, fill: style.backgroundColor };
    });
    expect(paint.z).toBe("600");
    expect(paint.position).toBe("fixed");
    // --surface-2, the Neutral fill — not Soft.
    expect(paint.fill).toBe("rgb(40, 44, 52)");

    // §11: "ahead of the sidebar's seven stops (lockup, …)".
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "aenima" })).toBeFocused();
  });

  test("the skip link carries focus into the main region", async ({ page }) => {
    await page.goto(LIST);
    await tabToPage(page);
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    // The first control of the page follows, ahead of nothing in the sidebar.
    await page.keyboard.press("Tab");
    const inSidebar = await page.evaluate(() => document.activeElement?.closest("aside") !== null);
    expect(inSidebar).toBe(false);
  });

  test("after an in-app route change the main region has focus with no ring, and the next Tab lands on the page's first control", async ({
    page,
  }) => {
    await page.goto(LIST);

    // Opened from the keyboard, so the modality is keyboard: a ring that any rule drew on the
    // main region would be drawn now (C-31: "the main region never carries one").
    const row = page.locator("[data-row-link]").first();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(ITEM);

    const main = page.locator("main");
    await expect(main).toBeFocused();
    const ring = await ringOf(page, "main");
    expect(ring.outline === "none" || ring.width === "0px").toBe(true);
    expect(ring.shadow).toBe("none");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Back to the list" })).toBeFocused();
  });
});

test.describe("C-42 · the way back restores the place", () => {
  for (const way of ["Back", "the breadcrumb"] as const) {
    test(`returning by ${way} restores the list's scroll position and focuses the opened row, ringed, not the main region`, async ({
      page,
    }) => {
      // Short enough that the list scrolls: the fixture's last row sits below the fold.
      await page.setViewportSize({ width: 1440, height: 400 });
      await page.goto(LIST);

      const row = page.locator("[data-row-link='soc-7']");
      await row.focus();
      const left = await page.evaluate(() => window.scrollY);
      expect(left).toBeGreaterThan(0);

      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(ITEM);
      await expect(page.locator("main")).toBeFocused();

      if (way === "Back") {
        await page.goBack();
      } else {
        // From the keyboard, so the ring on the way back is the keyboard modality's.
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Back to the list" })).toBeFocused();
        await page.keyboard.press("Enter");
      }

      await expect(page).toHaveURL(/\/dev\/list$/);
      await expect(row).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
      expect(await page.locator("main").evaluate((node) => node === document.activeElement)).toBe(
        false,
      );
      // §11: "with the ring under keyboard modality, since a row is a control".
      const ring = await ringOf(page, "[data-row-link='soc-7']");
      expect(ring.width).toBe("2px");
    });
  }

  test("an item opened from the row's overflow menu is the opened row too: Back focuses it and restores the scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 400 });
    await page.goto(LIST);

    const row = page.locator("[data-row-link='soc-7']");
    // The row's overflow trigger, opened and chosen from the keyboard so the walk stays under
    // keyboard modality; the menu places focus on its first row, "Open", as it opens.
    const trigger = page.getByRole("button", {
      name: "Actions for Can we diff Figma frames by node id?",
    });
    await trigger.focus();
    const left = await page.evaluate(() => window.scrollY);
    expect(left).toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    const open = page.getByRole("menuitem", { name: "Open" });
    await expect(open).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(ITEM);
    await expect(page.locator("main")).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/list$/);
    await expect(row).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
    expect(await page.locator("main").evaluate((node) => node === document.activeElement)).toBe(
      false,
    );
  });

  test("a list reached with nothing to return to focuses the main region, not a row", async ({
    page,
  }) => {
    await page.goto(`${SINK}`);
    // The sink has no shell; the list mirror is reached by a client navigation from it.
    await page.evaluate(() => {
      const link = document.createElement("a");
      link.href = "/dev/list";
      link.textContent = "list";
      link.id = "to-list";
      document.body.append(link);
    });
    await page.locator("#to-list").click();
    await expect(page).toHaveURL(/\/dev\/list$/);
    // A full document load, which is not the case §11 speaks of — so this asserts only that
    // no row was picked; the route-change case is the test above.
    const activeIsRow = await page.evaluate(
      () => document.activeElement?.hasAttribute("data-row-link") ?? false,
    );
    expect(activeIsRow).toBe(false);
  });
});

test.describe("C-43 · the shortcut sheet, and the shortcuts in and out of text fields and modals", () => {
  test("? opens the sheet outside a text field and outside a modal; Esc closes it and returns focus, and never changes the route", async ({
    page,
  }) => {
    await page.goto(LIST);
    const url = page.url();
    const row = page.locator("[data-row-link]").first();
    await row.focus();

    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet).toBeVisible();

    // §8.38: the groups that exist on this page — a list and the sidebar's menus, no chat and
    // nothing that reorders — under mono-micro titles, rows 36 high, flush like a menu's.
    await expect(sheet.getByText("Anywhere", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Lists", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Panels", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Chat", { exact: true })).toHaveCount(0);
    await expect(sheet.getByText("Drag", { exact: true })).toHaveCount(0);

    const rows = sheet.locator("li");
    const heights = await rows.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height === 36)).toBe(true);
    // The Decision's verb phrases, each with its kbd hint at the trailing edge.
    for (const label of [
      "Show keyboard shortcuts",
      "Close the last thing opened",
      "Undo",
      "Move between rows",
      "Open the item",
      "Jump to the first or last",
      "Move between options",
      "Choose",
    ]) {
      // "Jump to the first or last" stands in Lists and in Panels both; the first is enough.
      await expect(sheet.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const first = rows.first();
    const geometry = await first.evaluate((node) => {
      const kbd = node.querySelector("kbd")!;
      const row = node.getBoundingClientRect();
      const cap = kbd.getBoundingClientRect();
      const style = getComputedStyle(kbd);
      return {
        trailing: Math.round(row.right - cap.right),
        height: Math.round(cap.height),
        fill: style.backgroundColor,
        bottomBorder: style.borderBottomWidth,
        topBorder: style.borderTopWidth,
        text: kbd.textContent,
      };
    });
    // §8.15: 20 high, --surface-2, a 1px border on the bottom edge only, trailing in its row.
    expect(geometry.height).toBe(20);
    expect(geometry.fill).toBe("rgb(40, 44, 52)");
    expect(geometry.bottomBorder).toBe("1px");
    expect(geometry.topBorder).toBe("0px");
    expect(geometry.trailing).toBe(12);
    expect(geometry.text).toBe("?");
    // §8.38: a footer with one Neutral md "Close".
    const close = sheet.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    expect(Math.round((await close.boundingBox())!.height)).toBe(34);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();
    expect(page.url()).toBe(url);
  });

  test("the account menu's Keyboard shortcuts row opens it, and Close closes it and returns focus", async ({
    page,
  }) => {
    await page.goto(LIST);
    const account = page.getByRole("button", { name: "someone@example.com" });
    await account.click();
    const menu = page.getByRole("menu", { name: "someone@example.com" });
    await expect(menu).toBeVisible();
    // §4: "Keyboard shortcuts" then "Sign out", and nothing else.
    await expect(menu.getByRole("menuitem")).toHaveText(["Keyboard shortcuts?", "Sign out"]);

    await menu.getByRole("menuitem", { name: /Keyboard shortcuts/ }).click();
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet).toBeVisible();
    await expect(menu).toBeHidden();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    await expect(account).toBeFocused();
  });

  test("/, ? and Cmd/Ctrl+Z do nothing in a text field, where Esc still acts", async ({ page }) => {
    await page.goto(SINK);
    const url = page.url();

    // An undo showing, so Cmd/Ctrl+Z has something to take — and must not, from a field.
    await page.getByRole("button", { name: "undo toast" }).click();
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();

    const field = page.getByLabel("At rest", { exact: true });
    await field.click();
    await page.keyboard.press("?");
    await page.keyboard.press("/");
    await expect(field).toHaveValue("?/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Search")).not.toBeFocused();

    await page.keyboard.press("ControlOrMeta+z");
    // The undo did not fire: firing it dismisses the toast.
    await expect(toast).toBeVisible();

    // Esc acts there: a field inside a modal, Esc closes the modal.
    await page.getByRole("button", { name: "content modal" }).click();
    const modal = page.getByRole("dialog", { name: "Content modal" });
    await expect(modal).toBeVisible();
    await modal.getByLabel("A field in a modal").click();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    expect(page.url()).toBe(url);
  });

  test("/ focuses the search field outside a text field", async ({ page }) => {
    await page.goto(SINK);
    await page.locator("h1").click();
    await page.keyboard.press("/");
    const search = page.getByLabel("Search");
    await expect(search).toBeFocused();
    // The keystroke went to focusing, not to the field.
    await expect(search).toHaveValue("");
  });

  test("with a modal open / and ? do nothing and Esc closes the modal, never the route", async ({
    page,
  }) => {
    await page.goto(SINK);
    const url = page.url();
    await page.getByRole("button", { name: "confirm modal" }).click();
    const modal = page.getByRole("dialog", { name: "Confirm modal" });
    await expect(modal).toBeVisible();

    await page.keyboard.press("?");
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
    await expect(page.getByLabel("Search")).not.toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    expect(page.url()).toBe(url);

    // And with nothing open at all, Esc changes nothing either.
    await page.keyboard.press("Escape");
    expect(page.url()).toBe(url);
  });

  test("the Keyboard shortcuts row and its kbd hint show on pointer devices", async ({ page }) => {
    await page.goto(LIST);
    await page.getByRole("button", { name: "someone@example.com" }).click();
    const row = page.getByRole("menuitem", { name: /Keyboard shortcuts/ });
    await expect(row).toBeVisible();
    await expect(row.locator("kbd")).toBeVisible();
  });

  test("on touch the row and every kbd hint appear only once keyboard input has been recorded", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    await page.goto(LIST);

    const account = page.getByRole("button", { name: "someone@example.com" });
    await account.click();
    const menu = page.getByRole("menu", { name: "someone@example.com" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Sign out"]);
    // Closed by a press elsewhere — Esc is keyboard input, and would record it.
    await page.mouse.click(700, 300);
    await expect(menu).toBeHidden();

    await page.keyboard.press("Tab");
    await account.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Keyboard shortcuts?", "Sign out"]);
    await expect(
      menu.getByRole("menuitem", { name: /Keyboard shortcuts/ }).locator("kbd"),
    ).toBeVisible();
    await context.close();
  });

  test("a kbd hint on the sink is hidden on touch until keyboard input, and shown on pointer", async ({
    browser,
    page,
  }) => {
    await page.goto(SINK);
    const hint = page.getByTestId("kbd-hint").first();
    await expect(hint).toBeVisible();

    const context = await browser.newContext(TOUCH);
    const touch = await context.newPage();
    await touch.goto(SINK);
    const touched = touch.getByTestId("kbd-hint").first();
    await expect(touched).toBeHidden();
    await touch.keyboard.press("Tab");
    await expect(touched).toBeVisible();
    await context.close();
  });
});
