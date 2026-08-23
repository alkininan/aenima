import { expect, test } from "@playwright/test";

/**
 * The v2.5 form language, measured in a real browser.
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
        // 22 label zone + 48 pill + 8 gap + 18 helper. If a reserved slot
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

  // §8 (v2.5): 48h field inside a composite that is 22 + 48 + 8 + 18. The zone
  // grew by 2 with the label's step from ui-caption 12/16 to ui-label 13/18.
  expect(rest.pillHeight).toBe(48);
  expect(rest.compositeHeight).toBe(96);

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

/**
 * §6/§7/§8 (v2.5) — the focus split, in the only place it can be checked.
 *
 * `:focus-visible` is not a proxy for "the keyboard did this": Chromium matches
 * it on a text input that was clicked, which is why the ring is gated on the
 * modality attribute instead. That behaviour is a browser's, so a unit test
 * cannot see it and a class-list assertion would pass either way.
 */
test.describe("focus split", () => {
  /** Both halves of the treatment, read off the painted pill in one pass. */
  const focusPaint = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const pill = document.querySelector(".field-pill") as HTMLElement;
      const s = getComputedStyle(pill);
      return {
        ring: s.outlineStyle === "solid" ? s.outlineWidth : "none",
        // The glow is the only box-shadow the pill ever carries.
        glow: s.boxShadow.includes("33, 184, 220") ? "on" : "off",
        border: s.borderColor,
      };
    });

  const PRIME = "rgb(33, 184, 220)";

  test("a mouse click swaps the border and paints nothing else", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

    await page.locator('input[name="email"]').click();
    // Past --t-fast, so the border transition has settled.
    await page.waitForTimeout(250);

    const paint = await focusPaint(page);
    expect(paint.border).toBe(PRIME);
    expect(paint.ring).toBe("none");
    expect(paint.glow).toBe("off");
  });

  test("the keyboard gets the border, the ring and the glow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);

    // Start from pointer modality on purpose: clicking the title focuses
    // nothing but sets the pointer flag, so the Tab that follows has to switch
    // it back. Starting from a blurred autofocus would Tab *past* the field —
    // the sequential navigation point is still sitting on it.
    await page.locator("h1").click();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);

    await expect(page.locator('input[name="email"]')).toBeFocused();
    const paint = await focusPaint(page);
    expect(paint.border).toBe(PRIME);
    expect(paint.ring).toBe("2px");
    expect(paint.glow).toBe("on");
  });

  test("typing after a click does not summon the ring mid-word", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);

    await page.locator('input[name="email"]').click();
    await page.keyboard.type("someone@");
    await page.waitForTimeout(250);

    expect((await focusPaint(page)).ring).toBe("none");
  });
});

/**
 * §8 (v2.5) — a field shows one text, ever: its label. The exemptions are
 * Search and the composer, and the composer does not exist yet.
 */
test.describe("one text per field", () => {
  for (const [name, path] of [
    ["sign-in", "/sign-in"],
    ["primitives", "/dev/primitives"],
  ] as const) {
    test(`no field on ${name} paints a placeholder except Search`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll("input")]
          .filter((input) => {
            const text = input.getAttribute("placeholder");
            // The sentinel space is the mechanism, not a text: it paints nothing.
            if (text === null || text.trim() === "") return false;
            // §8 exempts the fields that are named by context instead.
            return !input.closest(".field-unlabelled");
          })
          .map((input) => `${input.name || input.id}: ${input.getAttribute("placeholder")}`),
      );

      expect(offenders).toEqual([]);
    });
  }

  test("the Search exemption still paints, in placeholder tone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/primitives");

    const search = page.locator(".field-unlabelled input").first();
    await expect(search).toHaveAttribute("placeholder", "Search");
    // §2 (v2.5): --n-placeholder dimmed to #5C6069, and this is its only home.
    const colour = await search.evaluate(
      (el) => getComputedStyle(el, "::placeholder").color || getComputedStyle(el).color,
    );
    expect(colour).toBe("rgb(92, 96, 105)");
  });
});

/**
 * §8 (v2.5) — steps are left-aligned, and back lives in the step header.
 *
 * Checked at all three widths from the ticket: the auth flow is §4's named
 * exception to read-only mobile web, so 375 is a supported size, not a
 * degradation.
 */
test.describe("step layout", () => {
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [375, 812],
  ] as const) {
    test(`title, subtitle and field share one left edge at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/sign-in");
      await page.evaluate(() => document.fonts.ready);

      const edges = await page.evaluate(() => {
        const x = (selector: string) =>
          Math.round(document.querySelector(selector)!.getBoundingClientRect().x);
        return {
          title: x("h1"),
          subtitle: x("h1 + p"),
          pill: x(".field-pill"),
          submit: x('button[type="submit"]'),
        };
      });

      // One edge, not four. The label sits at the pill's text inset, which is
      // inside this edge by design — the pill is what aligns, and a leading
      // icon would move the label further in without moving the pill.
      expect(edges.subtitle).toBe(edges.title);
      expect(edges.pill).toBe(edges.title);
      expect(edges.submit).toBe(edges.title);
    });
  }

  /* Step two needs a live Supabase to reach, which is why the OTP geometry
   * tests above use /dev/primitives. The step header's structure — back above
   * the primary, not beside it — is pinned in SignInForm.dom.test.tsx. */
});
