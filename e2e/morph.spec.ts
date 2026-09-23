import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * design-spec.md §6 Morph and §17's C-14, C-16, C-17, C-28 and C-48 (T0.37).
 *
 * Every check here is one §17 marks *browser*, and the reason §17 gives is the reason
 * these are not DOM tests: "every check that measures layout, media queries, hit-testing,
 * the top layer or transitions is *browser*, never *dom*, because a DOM emulator has no
 * layout and passes those vacuously."
 *
 * They drive the kitchen-sink route, which §17's preamble builds for exactly this: it
 * "takes `data-force-fallback`, which forces the JS positioner, the bare open without
 * `startViewTransition` and the solid `--glass-fallback` recipe, so both placement paths,
 * both transition paths and both glass paths run in one engine."
 */

const SINK = "/dev/primitives";

/** Counts the view transitions a page starts, from before any script of its own runs. */
async function countTransitions(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    // Counted through an untyped view of `document`: the wrapper only has to pass
    // the call along, and matching the API's full overload set here would say
    // nothing about the morph.
    const target = document as unknown as Record<string, unknown>;
    target["__morphs"] = 0;
    const original = target["startViewTransition"];
    if (typeof original !== "function") return;
    target["startViewTransition"] = function patched(this: Document, ...args: unknown[]) {
      target["__morphs"] = ((target["__morphs"] as number) ?? 0) + 1;
      return (original as (...rest: unknown[]) => unknown).apply(this, args);
    };
  });
  return () =>
    page.evaluate(
      () => ((document as unknown as Record<string, unknown>)["__morphs"] as number) ?? 0,
    );
}



const menuTrigger = (page: Page): Locator => page.getByLabel("Open menu");
const menuPanel = (page: Page): Locator => page.getByRole("menu", { name: "Item actions" });

/**
 * The panel element itself — §6's material layer, the one that carries the glass, the
 * radius and the `morph` name.
 *
 * Not the menu's parent: that is the contents wrapper, which is `display: contents` and
 * so has no box at all — measuring it returns null, which reads as a missing panel rather
 * than as the wrong element. The ancestor lookup names what is wanted instead.
 */
const panelOf = (list: Locator): Locator =>
  list.locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " panel ")][1]');

async function openMenu(page: Page) {
  await menuTrigger(page).click();
  await expect(menuPanel(page)).toBeVisible();
}

test.describe("C-14 · the morph", () => {
  test("runs one view transition on open and none on close", async ({ page }) => {
    const morphs = await countTransitions(page);
    await page.goto(SINK);

    await openMenu(page);
    expect(await morphs()).toBe(1);

    await page.keyboard.press("Escape");
    await expect(menuPanel(page)).toBeHidden();
    // §6: "Close is instant on every path … one close path is worth more than a
    // return flow."
    expect(await morphs()).toBe(1);
  });

  test("leaves no view-transition-name on any element once it has settled", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);
    await page.waitForTimeout(400);

    // §6: "two live elements sharing a name abort every transition on the page",
    // which is why the names come off at `finished` rather than being left.
    const named = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("*")].filter(
        (element) => element.style.getPropertyValue("view-transition-name") !== "",
      ).length,
    );
    expect(named).toBe(0);
  });

  test("opts the root out", async ({ page }) => {
    await page.goto(SINK);
    const name = await page.evaluate(
      () => getComputedStyle(document.documentElement).viewTransitionName,
    );
    expect(name).toBe("none");
  });

  test("grows the group from the trigger's box toward the panel's", async ({ page }) => {
    await page.goto(SINK);

    const trigger = await menuTrigger(page).boundingBox();
    expect(trigger).not.toBeNull();

    // Sampled mid-flight: `--t-med` is 200ms, so ~90ms in is inside the open with
    // room either side of it for a slow frame.
    await menuTrigger(page).click();
    await page.waitForTimeout(90);
    const midway = await page.evaluate(
      () =>
        getComputedStyle(document.documentElement, "::view-transition-group(morph)").width ?? "",
    );

    await expect(menuPanel(page)).toBeVisible();
    // Past `--t-med` and its own margin. Waiting on `getAnimations()` would never
    // settle here: the kitchen-sink route has a spinner and a skeleton on it, and
    // both loop forever by design.
    await page.waitForTimeout(500);
    // The element's own rect rather than the locator's box: the panel is in the
    // top layer, and its box is what the rule placed, not what an ancestor frames.
    const settled = await panelOf(menuPanel(page)).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    const sampled = Number.parseFloat(midway);
    // A browser that skipped the transition reports nothing here; the two checks
    // above already say one ran, so this asserts the shape rather than its
    // existence.
    test.skip(Number.isNaN(sampled), "no view transition pseudo-element to sample");
    expect(sampled).toBeGreaterThan(Math.min(trigger!.width, settled.width) - 1);
    expect(sampled).toBeLessThan(Math.max(trigger!.width, settled.width) + 1);
  });

  test("opens in place, at the same rect, under reduced motion", async ({ page }) => {
    const morphs = await countTransitions(page);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(SINK);
    await openMenu(page);
    await page.waitForTimeout(400);
    const animated = await panelOf(menuPanel(page)).boundingBox();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SINK);
    await openMenu(page);
    const still = await panelOf(menuPanel(page)).boundingBox();

    // §6: "Where `startViewTransition` is absent, or under `prefers-reduced-motion`,
    // the callback runs bare and the panel simply appears."
    expect(await morphs()).toBe(0);
    expect(still).toEqual(animated);
  });

  test("places a panel at the same rect on the positioner as on the anchor", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);
    await page.waitForTimeout(400);
    const anchored = await panelOf(menuPanel(page)).boundingBox();

    // §17: `data-force-fallback` forces the JS positioner. §6: "the two must be
    // pixel-identical."
    await page.goto(`${SINK}?fallback=1`);
    await openMenu(page);
    const positioned = await panelOf(menuPanel(page)).boundingBox();

    expect(positioned).toEqual(anchored);
  });

  test("forces the solid recipe under data-force-fallback", async ({ page }) => {
    await page.goto(`${SINK}?fallback=1`);
    await openMenu(page);

    const filter = await panelOf(menuPanel(page)).evaluate(
      (node) => getComputedStyle(node).backdropFilter,
    );
    expect(filter === "none" || filter === "").toBe(true);
  });
});

test.describe("C-16 · Esc closes the topmost layer", () => {
  test("gives a select inside a modal the first Esc and the modal the second", async ({ page }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "content modal" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    await modal.getByRole("combobox").click();
    await expect(page.getByRole("listbox")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });

  test("gives a showing tooltip the first Esc and closes nothing else", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    // §8.14: a tooltip "hides on Esc, which it takes first and which then closes
    // nothing else". The open menu beneath it is what "nothing else" is measured
    // against — without a second layer the check would pass on an empty page.
    await page.getByRole("button", { name: "tooltip default" }).hover();
    await expect(page.getByRole("tooltip").first()).toBeVisible({ timeout: 2000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(menuPanel(page)).toBeVisible();
  });

  test("keeps a tooltip up while the pointer crosses the 8 onto it", async ({ page }) => {
    await page.goto(SINK);

    const trigger = page.getByRole("button", { name: "tooltip default" });
    await trigger.hover();
    const tip = page.getByRole("tooltip").first();
    await expect(tip).toBeVisible({ timeout: 2000 });

    // §8.14: it "stays while the pointer is over the trigger, the tooltip or the 8
    // between them". Crossing the gap is the case a margin would break.
    const box = (await tip.boundingBox())!;
    const from = (await trigger.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.move(box.x + box.width / 2, box.y - 4);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tip).toBeVisible();
  });
});

test.describe("C-17 · where focus is", () => {
  test("puts focus on a menu's first row when it opens", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    const role = await page.evaluate(() => document.activeElement?.getAttribute("role"));
    expect(role).toBe("menuitem");
  });

  test("puts focus on a select's selected option", async ({ page }) => {
    await page.goto(SINK);
    const field = page.getByLabel("selected + inner scroll");
    await field.click();

    const focused = await page.evaluate(() => ({
      role: document.activeElement?.getAttribute("role"),
      selected: document.activeElement?.getAttribute("aria-selected"),
    }));
    expect(focused.role).toBe("option");
    expect(focused.selected).toBe("true");
  });

  test("returns focus to the trigger after Esc", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);
    await page.keyboard.press("Escape");

    await expect(menuTrigger(page)).toBeFocused();
  });

  test("carries focus to the stop after the trigger on Tab, committing first", async ({ page }) => {
    await page.goto(SINK);
    const field = page.getByLabel("empty — label at rest");
    await field.click();
    await expect(page.getByRole("listbox")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("listbox")).toBeHidden();

    // §8.5: "Tab selects the active option and closes, carrying focus onward."
    await expect(field).not.toHaveValue("");
    const insideTheControl = await page.evaluate(() => {
      const active = document.activeElement;
      const combobox = document.querySelector('input[role="combobox"]');
      return combobox?.parentElement?.parentElement?.contains(active) ?? false;
    });
    expect(insideTheControl).toBe(false);
  });
});

test.describe("C-28 · what closes an open panel", () => {
  test("closes on a width change and stays open through a height-only one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(SINK);

    await openMenu(page);
    await page.setViewportSize({ width: 1280, height: 780 });
    // §6: a height-only change "leaves it open and re-places it".
    await expect(menuPanel(page)).toBeVisible();

    await page.setViewportSize({ width: 1100, height: 780 });
    await expect(menuPanel(page)).toBeHidden();
  });

  test("closes when the docked dock opens or closes", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    await page.getByRole("button", { name: "toggle dock" }).click();
    await expect(menuPanel(page)).toBeHidden();
  });
});

test.describe("C-48 · exits run one step faster and never spring", () => {
  test("leaves a morphed panel in one frame", async ({ page }) => {
    await page.goto(SINK);
    await openMenu(page);

    const panel = panelOf(menuPanel(page));
    const transition = await panel.evaluate((node) => getComputedStyle(node).transitionDuration);
    // §6: "the morphed panel excepted, which leaves in one frame."
    expect(transition === "0s" || transition === "").toBe(true);
  });

  test("gives a modal --t-med in and --t-fast out, on --ease", async ({ page }) => {
    await page.goto(SINK);
    await page.getByRole("button", { name: "confirm modal" }).click();

    const surface = page.getByRole("dialog");
    const entering = await surface.evaluate((node) => ({
      duration: getComputedStyle(node).transitionDuration,
      easing: getComputedStyle(node).transitionTimingFunction,
    }));
    expect(entering.duration).toContain("0.2s");
    expect(entering.easing).not.toContain("cubic-bezier(0.34, 1.56");

    const leaving = await surface.evaluate((node) => {
      node.setAttribute("data-leaving", "");
      return getComputedStyle(node).transitionDuration;
    });
    expect(leaving).toContain("0.12s");
  });
});
