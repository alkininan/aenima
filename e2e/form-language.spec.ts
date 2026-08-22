import { expect, test } from "@playwright/test";

/**
 * The v2.3/v2.4 form language, measured in a real browser.
 *
 * Both things checked here are invisible to the unit tests by nature. The
 * reserved slots are a *layout* guarantee, and jsdom has no layout — the DOM
 * test next to the component can only prove that no node appears or
 * disappears, not that nothing moved. The OTP step-down is a media query, and
 * a class list assertion cannot tell you which side of the breakpoint actually
 * won. Both failures show up only on a real page at a real width, which is
 * exactly the kind of thing that ships unnoticed.
 */

test("a field does not shift as it goes from rest to focused to errored", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sign-in");
  // §3 loads the faces with `font-display: swap`, so measuring before the swap
  // lands compares one state in the fallback metrics and the next in the real
  // ones — a sub-pixel difference that has nothing to do with the field.
  await page.evaluate(() => document.fonts.ready);

  const email = page.getByLabel("Email");
  const submit = page.getByRole("button", { name: "Send code" });

  /**
   * Every number in one evaluate, deliberately. Read across separate round
   * trips, a reflow can land between two measurements of the same state and
   * show up as a fraction of a pixel that no user could ever experience — which
   * is a flake, not a finding. One pass, one layout.
   */
  const measure = () =>
    page.evaluate(() => {
      const input = document.querySelector('input[name="email"]') as HTMLInputElement;
      const pill = input.parentElement!.getBoundingClientRect();
      const composite = input.closest(".field")!.getBoundingClientRect();
      const button = document.querySelector('button[type="submit"]')!.getBoundingClientRect();
      const helper = input
        .closest(".field")!
        .querySelector('[id$="-helper"]')!
        .getBoundingClientRect();
      return {
        pillY: pill.y,
        helperHeight: Math.round(helper.height),
        pillHeight: Math.round(pill.height),
        // 20 label zone + 48 pill + 8 gap + 18 helper. If a reserved slot
        // collapses when it has nothing to show, this is what changes.
        compositeHeight: Math.round(composite.height),
        submitY: button.y,
      };
    });

  // The field autofocuses, so rest has to be arranged rather than assumed.
  await email.blur();
  const rest = await measure();

  await email.focus();
  // Longer than --t-fast, so the label has finished moving.
  await page.waitForTimeout(250);
  const focused = await measure();

  await email.fill("not-an-email");
  await submit.click();
  await expect(page.getByText("That doesn't look like an email address yet.")).toBeVisible();
  // §6 press physics: the click leaves the button springing back from
  // translateY(1px) over --t-fast. That transform is in the button's bounding
  // box, so measuring too early reads the retro click as a layout shift — it is
  // not one, and waiting it out is the difference between the two.
  await page.waitForTimeout(250);
  const errored = await measure();

  // §8: the label zone and the helper line are reserved, so the label floating
  // and an error arriving move nothing. If either slot is only rendered when it
  // has content, the submit button jumps down the page here.
  expect(focused).toEqual(rest);
  expect(errored).toEqual(rest);

  // §8 (v2.3): 48h field inside a composite that is 20 + 48 + 8 + 18.
  expect(rest.pillHeight).toBe(48);
  expect(rest.compositeHeight).toBe(94);

  // The helper slot holds its 18h line before it has anything to say, which is
  // what "reserved" means and what keeps the button still above.
  expect(rest.helperHeight).toBe(18);
  expect(errored.helperHeight).toBe(18);
});

/**
 * §8 (v2.4): the OTP group steps to 44×44 / r22 / gap 8 below 768 and back to
 * 52×52 / r27 / gap 16 above it. §4 puts the breakpoint at 768, which is where
 * Tailwind's `md` sits.
 *
 * The step exists because six 52s with five 16 gaps need 392px and a 375
 * viewport does not have them — the boxes ran off the right edge of the screen.
 */
test.describe("OTP geometry", () => {
  const box = (page: import("@playwright/test").Page) =>
    page.locator('[role="group"] input').first();

  test("steps down to 44 below the 768 breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dev/primitives");

    const first = box(page);
    await expect(first).toBeVisible();
    const size = await first.boundingBox();

    expect(Math.round(size?.width ?? 0)).toBe(44);
    expect(Math.round(size?.height ?? 0)).toBe(44);
    expect(await first.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("22px");
    expect(await first.evaluate((el) => getComputedStyle(el.parentElement!).gap)).toBe("8px");

    // The point of the whole change: the row of boxes now fits. The group is a
    // full-width flex container, so what matters is the span the boxes actually
    // occupy — first box's left edge to last box's right. 6×44 + 5×8 = 304.
    const span = await page
      .locator('[role="group"]')
      .first()
      .evaluate((group) => {
        const boxes = [...group.querySelectorAll("input")];
        const first = boxes[0]!.getBoundingClientRect();
        const last = boxes[boxes.length - 1]!.getBoundingClientRect();
        return last.right - first.left;
      });
    expect(Math.round(span)).toBe(304);
    expect(span).toBeLessThan(375);
  });

  test("keeps the §8 52 above the breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/dev/primitives");

    const first = box(page);
    await expect(first).toBeVisible();
    const size = await first.boundingBox();

    expect(Math.round(size?.width ?? 0)).toBe(52);
    expect(Math.round(size?.height ?? 0)).toBe(52);
    expect(await first.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("27px");
    expect(await first.evaluate((el) => getComputedStyle(el.parentElement!).gap)).toBe("16px");
  });

  // The OTP is exempt from the 48 field height in both directions (§8), so the
  // two scales must not drift into each other.
  test("stays its own scale, never the field's 48", async ({ page }) => {
    for (const width of [375, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dev/primitives");
      const h = Math.round((await box(page).boundingBox())?.height ?? 0);
      expect(h).not.toBe(48);
    }
  });
});
