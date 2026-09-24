import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * design-spec.md §17's C-09, C-10, C-11, C-20 and C-49 over the panels and toasts this
 * ticket builds (T0.37). Browser checks, because every one of them measures something a
 * DOM emulator does not have: a media query, a painted box, a hit test, a computed fill.
 */

const SINK = "/dev/primitives";

/**
 * §7 gates every pointer rule on `(hover: hover) and (pointer: fine)` and calls
 * everything else touch, "at any width" — so touch is `hasTouch` alone, and the
 * viewport stays the desktop one. A phone-sized viewport would test two things
 * at once and §7 is explicit that width is not what decides this.
 */
const TOUCH = { hasTouch: true };

/** §6's material layer — see the note in `morph.spec.ts`; the menu's parent has no box. */
const panelOf = (list: Locator): Locator =>
  list.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " panel ")][1]');

async function openMenu(page: Page) {
  await page.getByLabel("Open menu").click();
  await expect(page.getByRole("menu", { name: "Item actions" })).toBeVisible();
}

test.describe("C-09 · menu and option rows are 36 on pointer and 44 on touch", () => {
  test("is 36 on a pointer device", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    const row = page.getByRole("menuitem").first();
    const box = (await row.boundingBox())!;
    expect(Math.round(box.height)).toBe(36);
  });

  test("is 44 on touch", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    await page.goto(SINK);
    await openMenu(page);

    const row = page.getByRole("menuitem").first();
    const box = (await row.boundingBox())!;
    expect(Math.round(box.height)).toBe(44);
    await context.close();
  });

  test("gives a select's options the same two heights", async ({ page }) => {
    await page.goto(SINK);
    await page.getByLabel("empty — label at rest").click();

    const option = page.getByRole("option").first();
    const box = (await option.boundingBox())!;
    expect(Math.round(box.height)).toBe(36);
  });
});

test.describe("C-10 · a panel row is its own hit area", () => {
  /**
   * §7: "**Menu and option rows are their own hit areas:** 36 on pointer, flush to their
   * neighbours and exempt from the 40 floor — rows stacked flush have nowhere to extend
   * into; 44 on touch, where the row grows for real and the panel's height is what
   * changes."
   *
   * So what C-10 asks of a panel row is the opposite of what it asks of a button: not
   * that the row reach past itself, but that it be hittable **to its own edges**, with no
   * dead strip where a neighbour's extension would otherwise overlap it. Probed with
   * `elementFromPoint`, which is C-10's own instrument.
   *
   * C-10's other half — the 40/44 floor for controls whose box is smaller, reached with a
   * transparent `::before` — is not built anywhere in the product yet and is wider than
   * this ticket's surfaces: §7 lists "sm and md buttons, chips, tabs, the toggle, the
   * checkbox and radio, the drag handle, the sortable-header chevron, the copy button",
   * none of which this ticket touches. It is filed rather than half-done here; see
   * `docs/reports/T0.37.md`.
   */
  /**
   * Probed with a real pointer press rather than with `elementFromPoint`, which C-10
   * names. The instrument had to change for one reason, checked before it was:
   * **Chromium's `elementFromPoint` does not report top-layer content**, so over an open
   * popover it answers about the page underneath — at a menu row's own centre it returns
   * the section div behind the panel. A press at the same point activates the row. So the
   * DOM method would have reported a dead panel that is not dead, and C-10's subject —
   * "a rule about what a finger or a pointer can hit" (§7) — is what the press measures
   * directly.
   */
  /**
   * **The press the Decision was about.** On the anchor-positioned path the panel once took
   * no pointer events at all: §6 hid the trigger with `visibility: hidden`, and Chromium's
   * default `position-visibility` then treats the anchored panel as hidden for hit-testing,
   * while §6 also forbids authoring `position-visibility`. T0.37 stopped at Decision on it
   * and the answer was *default* — the trigger hides by `opacity: 0` and
   * `pointer-events: none` instead, which keeps anchor positioning and the prohibition both.
   * These two are the assertions that found the problem, and `?fallback=1` below keeps the
   * positioner path under the same press.
   */
  test("takes a press at a menu row's own top and bottom edges", async ({ page }) => {
    for (const edge of ["top", "bottom"] as const) {
      await page.goto(SINK);
      await openMenu(page);
      // Past the morph, as the option-row check below explains: a raw press while the
      // view transition runs falls through `:root::view-transition` to the page.
      await page.waitForTimeout(400);

      const row = page.getByRole("menuitem", { name: "Duplicate" });
      const rect = await row.evaluate((node) => node.getBoundingClientRect().toJSON());
      const y = edge === "top" ? rect.top + 1 : rect.bottom - 1;
      await page.mouse.click(rect.left + rect.width / 2, y);

      // The readout moves only on a real activation; a press that missed the panel
      // would close the menu by light dismiss and say nothing at all.
      await expect(page.getByText("chose: Duplicate")).toBeVisible();
    }
  });

  test("takes a press at a menu row's edges on the positioner path", async ({ page }) => {
    for (const edge of ["top", "bottom"] as const) {
      await page.goto(`${SINK}?fallback=1`);
      await openMenu(page);

      const row = page.getByRole("menuitem", { name: "Duplicate" });
      const rect = await row.evaluate((node) => node.getBoundingClientRect().toJSON());
      const y = edge === "top" ? rect.top + 1 : rect.bottom - 1;
      await page.mouse.click(rect.left + rect.width / 2, y);

      await expect(page.getByText("chose: Duplicate")).toBeVisible();
    }
  });

  test("takes a press at an option row's own edges", async ({ page }) => {
    for (const edge of ["top", "bottom"] as const) {
      await page.goto(SINK);
      const field = page.getByLabel("empty — label at rest");
      await field.click();

      const option = page.getByRole("option").first();
      await expect(option).toBeVisible();
      // Past the morph. While a view transition runs, `:root::view-transition`
      // covers the page with `pointer-events: none` (§6, so the page beneath
      // keeps taking clicks), and a raw press aimed at a row would fall straight
      // through it. A press is what this check is for, so it waits for the panel
      // rather than for the locator's actionability to paper over the timing.
      await page.waitForTimeout(400);

      const label = (await option.textContent())!.trim();
      const rect = await option.evaluate((node) => node.getBoundingClientRect().toJSON());
      const y = edge === "top" ? rect.top + 1 : rect.bottom - 1;
      await page.mouse.click(rect.left + rect.width / 2, y);

      await expect(field).toHaveValue(label);
    }
  });

  test("takes a press at an option row's edges on the positioner path", async ({ page }) => {
    for (const edge of ["top", "bottom"] as const) {
      await page.goto(`${SINK}?fallback=1`);
      const field = page.getByLabel("empty — label at rest");
      await field.click();

      const option = page.getByRole("option").first();
      await expect(option).toBeVisible();
      const label = (await option.textContent())!.trim();
      const rect = await option.evaluate((node) => node.getBoundingClientRect().toJSON());
      const y = edge === "top" ? rect.top + 1 : rect.bottom - 1;
      await page.mouse.click(rect.left + rect.width / 2, y);

      await expect(field).toHaveValue(label);
    }
  });
});

test.describe("C-11 · no square corner on a free edge, and nested radii", () => {
  test("gives an option row the panel's radius less its padding", async ({ page }) => {
    await page.goto(SINK);
    await page.getByLabel("empty — label at rest").click();

    const option = page.getByRole("option").first();
    // The radius and the padding are the *panel's*; the listbox is the plain list
    // inside it, and measuring that would compare a row against nothing.
    const panel = panelOf(page.getByRole("listbox"));

    const radii = await panel.evaluate((node) => {
      const outer = getComputedStyle(node);
      const row = node.querySelector('[role="option"]')!;
      return {
        panel: Number.parseFloat(outer.borderTopLeftRadius),
        padding: Number.parseFloat(outer.paddingTop),
        row: Number.parseFloat(getComputedStyle(row).borderTopLeftRadius),
      };
    });

    expect(await option.isVisible()).toBe(true);
    expect(radii.panel).toBeGreaterThan(0);
    expect(radii.padding).toBeGreaterThan(0);
    // §5's nested rule: "an inner surface flush inside a rounded container takes
    // the container's radius minus the container's padding".
    expect(radii.row).toBeCloseTo(radii.panel - radii.padding, 1);
  });

  test("rounds every corner of a floating panel", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    const corners = await panelOf(page.getByRole("menu", { name: "Item actions" })).evaluate(
      (node) => {
        const style = getComputedStyle(node);
        return [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomLeftRadius,
          style.borderBottomRightRadius,
        ].map((value) => Number.parseFloat(value));
      },
    );
    for (const corner of corners) expect(corner).toBeGreaterThan(0);
  });
});

test.describe("C-20 · toasts", () => {
  /**
   * §8.20: "Bottom-centre, 24 above the viewport's bottom edge". The region is shown as a
   * `popover="manual"`, so the UA's `[popover]:popover-open` rule — `inset: 0`,
   * `fit-content` on both axes, a `Canvas` background — applies unless the region undoes
   * it; with `top: 0` left standing the over-constrained `bottom` is the inset dropped and
   * the toast sits at the top-left on a solid strip.
   */
  test("sits bottom-centre, 24 above the viewport's edge, on no fill of its own", async ({
    page,
  }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "undo toast" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    // Past the entrance: §6's rise moves the toast while it runs.
    await toast.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    const viewport = page.viewportSize()!;
    const rect = await toast.evaluate((node) => node.getBoundingClientRect().toJSON());
    expect(Math.round(rect.bottom)).toBe(viewport.height - 24);
    expect(Math.round(rect.left + rect.width / 2)).toBe(Math.round(viewport.width / 2));

    const fill = await page
      .getByRole("region", { name: "Notifications" })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(fill).toBe("rgba(0, 0, 0, 0)");
  });

  /** §8.20: "Below 768 a toast spans the width minus 16 gutters and sits 16 above
   * `env(safe-area-inset-bottom)`" — which is 0 in a desktop engine, so 16 above the edge. */
  test("spans the width less 16 gutters and sits 16 above the edge below 768", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(SINK);
    await page.getByRole("button", { name: "undo toast" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    await toast.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    const rect = await toast.evaluate((node) => node.getBoundingClientRect().toJSON());
    expect(Math.round(rect.left)).toBe(16);
    expect(Math.round(rect.right)).toBe(375 - 16);
    expect(Math.round(rect.bottom)).toBe(812 - 16);
  });

  test("replaces the one showing with the newest, undo or not", async ({ page }) => {
    await page.goto(SINK);

    await page.getByRole("button", { name: "undo toast" }).click();
    await expect(page.getByRole("status")).toHaveCount(1);
    await expect(page.getByRole("status").getByRole("button", { name: "Undo" })).toBeVisible();

    await page.getByRole("button", { name: "pause on hover" }).click();
    await expect(page.getByRole("status")).toHaveCount(1);
    await expect(page.getByRole("status").getByRole("button", { name: "Undo" })).toBeHidden();
  });

  test("triggers a showing undo on Cmd/Ctrl+Z outside a text field", async ({ page }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "undo toast" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("status")).toBeHidden();
  });

  test("leaves the keystroke to a text field", async ({ page }) => {
    await page.goto(SINK);
    await page.getByLabel("Rest — and focus, if you click it").click();
    await page.getByRole("button", { name: "undo toast" }).click();
    await page.getByLabel("Rest — and focus, if you click it").focus();

    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("status")).toBeVisible();
  });

  test("stays clickable over an open modal", async ({ page }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "confirm modal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The host moves into the modal's subtree (§8.20), so the toast is on the
    // live side of the page's inertness rather than painted above it and inert.
    await page.evaluate(() => {
      document.querySelectorAll("button").forEach((button) => {
        if (button.textContent?.trim() === "undo toast") button.click();
      });
    });

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    const inside = await toast.evaluate((node) => node.closest('[role="dialog"]') !== null);
    expect(inside).toBe(true);
    // C-20 says clickable, so it is clicked: the undo runs and the toast goes.
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("status")).toBeHidden();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("carries a Neutral sm action", async ({ page }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "undo toast" }).click();

    const undo = page.getByRole("status").getByRole("button", { name: "Undo" });
    const box = (await undo.boundingBox())!;
    // §8.1's three button heights are 28, 34 and 48; sm is the first of them.
    expect(Math.round(box.height)).toBe(28);
    const fill = await undo.evaluate((node) => getComputedStyle(node).backgroundColor);
    const surface2 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--surface-2").trim(),
    );
    expect(fill).toBe(hexToRgb(surface2));
  });
});

test.describe("C-49 · glass goes solid where transparency is refused", () => {
  test("is solid under prefers-reduced-transparency", async ({ page }) => {
    await page.goto(SINK);
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });

    await openMenu(page);
    const panel = panelOf(page.getByRole("menu", { name: "Item actions" }));
    const painted = await panel.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      blur: getComputedStyle(node).backdropFilter,
    }));
    const fallback = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--glass-fallback").trim(),
    );

    expect(painted.blur === "none" || painted.blur === "").toBe(true);
    expect(painted.fill).toBe(hexToRgb(fallback));
  });

  test("is solid, with a brighter border, under prefers-contrast: more", async ({ browser }) => {
    const context = await browser.newContext({ contrast: "more" });
    const page = await context.newPage();
    await page.goto(SINK);
    await openMenu(page);

    const panel = panelOf(page.getByRole("menu", { name: "Item actions" }));
    const painted = await panel.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      border: getComputedStyle(node).borderTopColor,
      blur: getComputedStyle(node).backdropFilter,
    }));
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        fallback: root.getPropertyValue("--glass-fallback").trim(),
        secondary: root.getPropertyValue("--n-secondary").trim(),
      };
    });

    expect(painted.blur === "none" || painted.blur === "").toBe(true);
    expect(painted.fill).toBe(hexToRgb(tokens.fallback));
    expect(painted.border).toBe(hexToRgb(tokens.secondary));
    await context.close();
  });
});

/** `#1B1E24` as the `rgb(…)` a computed style reports. */
function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
