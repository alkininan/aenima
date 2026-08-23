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
        // 24 label zone + 48 pill + 8 gap + 18 helper. If a reserved slot
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

  // §8 (v2.12): 48h field inside a composite that is 24 + 48 + 8 + 18. The zone
  // is 18 of ui-label line plus the gap above the field, and that gap went 4 → 6.
  expect(rest.pillHeight).toBe(48);
  expect(rest.compositeHeight).toBe(98);

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

  /**
   * §6: the autofocused field gets a border and nothing else.
   *
   * The modality starts absent rather than on `keyboard`. An autofocused field
   * already carries a caret — that is the affordance — so a ring around it is a
   * second stroke on a field nobody has touched, which is the double stroke this
   * split removes, arriving on load instead of on a click. Sign-in autofocuses,
   * so this is the first thing anyone sees.
   */
  test("an autofocused field gets the border alone, with no ring on arrival", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    // Nothing has been touched, so nothing has been decided.
    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-focus-modality")),
    ).toBeNull();

    await expect(page.locator('input[name="email"]')).toBeFocused();
    const paint = await focusPaint(page);
    expect(paint.border).toBe(PRIME);
    expect(paint.ring).toBe("none");
    expect(paint.glow).toBe("off");
  });

  // And the first Tab brings it back — the field must not be permanently
  // ringless just because the page focused it first.
  test("the ring arrives on the first focus key", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);

    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);

    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-focus-modality")),
    ).toBe("keyboard");
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
    test(`the first step centers its mark, title and subtitle at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/sign-in");
      await page.evaluate(() => document.fonts.ready);

      const measured = await page.evaluate(() => {
        /* Element boxes are the wrong instrument here. An h1 in a flex column
         * spans the column whether its text is left-aligned or centered, so
         * getBoundingClientRect().x reads identically under §8 v2.6 and v2.7 —
         * a test built on it passes through the revision without noticing. A
         * Range measures the painted glyphs, which is what the rule is about. */
        const textBox = (el: Element) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        };
        const mid = (r: DOMRect) => Math.round(r.x + r.width / 2);
        const column = document.querySelector(".field")!.getBoundingClientRect();

        return {
          columnMid: mid(column),
          // The mark is the first svg in the page's reading order; the next one
          // is the field's leading mail icon.
          markMid: mid(document.querySelector("main svg")!.getBoundingClientRect()),
          titleMid: mid(textBox(document.querySelector("h1")!)),
          subtitleMid: mid(textBox(document.querySelector("h1 + p")!)),
        };
      });

      /* §8 (v2.7): the Æ mark is centered above every step, and a step with no
       * back button centers its title and subtitle beneath it. One pixel of
       * slack — a centered box on an odd column width lands on a half. */
      expect(Math.abs(measured.markMid - measured.columnMid)).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.titleMid - measured.columnMid)).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.subtitleMid - measured.columnMid)).toBeLessThanOrEqual(1);
    });
  }

  test("the floated label hugs the field edge, behind a leading icon", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);

    const email = page.getByLabel("Email");
    await email.blur();
    await page.waitForTimeout(250);

    const read = () =>
      page.evaluate(() => {
        const input = document.querySelector('input[name="email"]') as HTMLInputElement;
        const field = input.closest(".field")!;
        const pill = input.parentElement!.getBoundingClientRect();
        const label = field.querySelector("label")!.getBoundingClientRect();
        /* The label box spans the zone; its text is what moves, so measure the
         * glyphs rather than the box. */
        const range = document.createRange();
        range.selectNodeContents(field.querySelector("label")!);
        return {
          textFromEdge: Math.round(range.getBoundingClientRect().x - pill.x),
          valueFromEdge: Math.round(input.getBoundingClientRect().x - pill.x),
          zonePadding: Math.round(label.x - pill.x),
        };
      });

    /* §8 (v2.10): at rest the label sits *where the value will*, and that is now
     * exact rather than close. Both are measured from the pill's border box, and
     * the pill's own 1px border is part of the offset the label has to clear —
     * the label is absolutely positioned in the composite, outside that border,
     * so it carries the 1 explicitly. Behind a 24 mail icon and its 8 gap:
     * 1 + 16 + 24 + 8 = 49, for the glyphs and the value alike.
     *
     * Equality is the assertion, not the number: two constants that happen to
     * match would pass a pair of `toBe`s while drifting apart. */
    const rest = await read();
    expect(rest.textFromEdge).toBe(rest.valueFromEdge);
    expect(rest.textFromEdge).toBe(49);

    await email.focus();
    await page.waitForTimeout(250);

    /* §8 (v2.7): floated, the label hugs the field's left edge at 8 and stays
     * there regardless of the icon — only the value moves for one. This is the
     * assertion that would have failed before the revision, where the floated
     * label tracked the value to 48. */
    const floated = await read();
    expect(floated.textFromEdge).toBe(8);
    expect(floated.zonePadding).toBe(0);
    expect(floated.valueFromEdge).toBe(49);
  });

  /* Step two needs a live Supabase to reach, which is why the OTP geometry
   * tests above use /dev/primitives. The step header's structure — the neutral
   * back beside a title block that left-aligns to itself rather than centering
   * — is pinned in SignInForm.dom.test.tsx. */
});

/**
 * §2/§6/§8 (v2.8) — the aero materials, checked where they actually resolve.
 *
 * Every assertion here reads a computed value rather than a class list. A
 * gradient that never reaches the element, a sheen shadowed by a later
 * background rule, or a squish that reflows its neighbours all look identical
 * to a class-name test and identical to each other in a snapshot.
 */
test.describe("aero materials", () => {
  for (const width of [1440, 768, 375] as const) {
    test(`the primary carries the gloss gradient at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sign-in");
      await page.evaluate(() => document.fonts.ready);

      const primary = await page.evaluate(() => {
        const button = document.querySelector('button[type="submit"]')!;
        const s = getComputedStyle(button);
        return { image: s.backgroundImage, color: s.color };
      });

      // §8 (v2.8): --grad-primary, resolved. The three stops are the hero blue,
      // --prime, and the #17A9CE floor that keeps the dark label above AA.
      expect(primary.image).toContain("linear-gradient");
      expect(primary.image).toContain("rgb(67, 147, 247)");
      expect(primary.image).toContain("rgb(33, 184, 220)");
      expect(primary.image).toContain("rgb(23, 169, 206)");
      // Label #08090C — the new --bg-base.
      expect(primary.color).toBe("rgb(8, 9, 12)");
    });

    test(`fields carry the sheen and no blur at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sign-in");

      const field = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector(".field-pill")!);
        return {
          image: s.backgroundImage,
          color: s.backgroundColor,
          filter: s.backdropFilter,
        };
      });

      // §8 (v2.8): --surface-1 with --sheen over it.
      expect(field.color).toBe("rgb(21, 23, 28)");
      expect(field.image).toContain("linear-gradient");
      expect(field.image).toContain("rgba(255, 255, 255, 0.03)");
      // Blur is for genuine layer overlap only — never a field.
      expect(["none", ""]).toContain(field.filter);
    });
  }

  test("the gloss is the primary's alone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/primitives");

    const painted = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const gradient = (b: Element) => getComputedStyle(b).backgroundImage.includes("gradient");
      return {
        // Every non-primary variant carries `control-edge-none`; primary is the
        // only one with `control-gloss`. Labels cannot identify them — the
        // preview renders primaries reading "leading", "loading", "full width".
        leaks: buttons
          .filter((b) => b.classList.contains("control-edge-none") && gradient(b))
          .map((b) => b.className),
        glossed: buttons.filter((b) => b.classList.contains("control-gloss") && gradient(b)).length,
      };
    });

    // Danger and every other variant stay flat.
    expect(painted.leaks).toEqual([]);
    // And the page really does render glossed primaries, or the line above is
    // asserting nothing.
    expect(painted.glossed).toBeGreaterThan(0);
  });

  test("the press squish moves nothing around it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);

    const submit = page.getByRole("button", { name: "Send code" });

    /* The squish is a transform, so it must not participate in layout at all.
     * What would betray a regression is a neighbour moving — the field above or
     * the button's own reserved space — which is what these read. */
    const neighbours = () =>
      page.evaluate(() => {
        const field = document.querySelector(".field")!.getBoundingClientRect();
        const button = document.querySelector('button[type="submit"]')!;
        const box = button.getBoundingClientRect();
        return {
          fieldY: Math.round(field.y),
          fieldHeight: Math.round(field.height),
          // The offset box ignores transforms; the client rect does not. Layout
          // is the first, so that is what must hold still.
          buttonOffsetTop: (button as HTMLElement).offsetTop,
          buttonOffsetHeight: (button as HTMLElement).offsetHeight,
          boxHeight: Math.round(box.height),
        };
      });

    const rest = await neighbours();

    await page.mouse.move(0, 0);
    const box = await submit.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    const pressed = await neighbours();

    // §6 (v2.8): translateY(1px) scale(0.985) — a paint, never a reflow.
    expect(pressed.fieldY).toBe(rest.fieldY);
    expect(pressed.fieldHeight).toBe(rest.fieldHeight);
    expect(pressed.buttonOffsetTop).toBe(rest.buttonOffsetTop);
    expect(pressed.buttonOffsetHeight).toBe(rest.buttonOffsetHeight);
    // And the transform really is applied, or the test above proves nothing.
    expect(pressed.boxHeight).toBeLessThan(rest.boxHeight);

    await page.mouse.up();
  });
});

/**
 * §8 (v2.10) — the resend cooldown and where a control's failure is allowed to
 * land, in a browser.
 *
 * The clock is proven on fake timers in `useCooldown.dom.test.ts` and the form's
 * wiring in `SignInForm.dom.test.tsx`; the sign-in code step needs a live
 * Supabase to reach, so what runs here is the same pairing on /dev/primitives —
 * real hook, real controls, a stubbed reply that is always a rate limit.
 */
test.describe("resend cooldown", () => {
  test("a resend failure lands on the resend, never on the OTP field", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/primitives");

    /* Scoped to its own section: the OTP section further up the page renders a
     * deliberate error state, so a page-wide "no error anywhere" would pass for
     * the wrong reason and fail for another. */
    const demo = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Resend cooldown" }) });

    /* Exact: Playwright matches an accessible name loosely, and the cooling
     * label "Send a new code (0:47)" contains the resting one — a loose
     * matcher would find the disabled control and call it the live one. */
    const resend = demo.getByRole("button", { name: "Send a new code", exact: true });
    await expect(resend).toBeEnabled();

    await resend.click();

    // §8 (v2.10): the failure belongs to the control that made the request.
    await expect(demo.getByRole("status")).toHaveText(
      "Too many requests. Wait a moment before asking for another code.",
    );

    /* And the boxes beside it say nothing. The helper line under an OTP group is
     * reserved, so it is always in the DOM — "carries no error" is an empty line
     * and an unmarked group, not an absent element. */
    const boxes = await demo.evaluate((section) => {
      const group = section.querySelector('[role="group"]')!;
      const inputs = [...group.querySelectorAll("input")];
      // The composite is label / group / helper; the helper is the last of them.
      const helper = group.parentElement!.lastElementChild!;
      return {
        helperText: (helper.textContent ?? "").trim(),
        invalid: inputs.some((input) => input.hasAttribute("aria-invalid")),
        describedBy: inputs.some((input) => input.hasAttribute("aria-describedby")),
      };
    });

    expect(boxes.helperText).toBe("");
    expect(boxes.invalid).toBe(false);
    expect(boxes.describedBy).toBe(false);

    // §8 (v2.10): and the control that cannot succeed yet is disabled, counting
    // down in its own label rather than merely apologising.
    await expect(resend).toHaveCount(0);
    await expect(demo.getByRole("button", { name: /Send a new code \(\d:\d\d\)/ })).toBeDisabled();
  });
});

/**
 * §8 (v2.12) — the leading icon takes the field's state colour.
 *
 * Computed colour, not a class list. The rule is `:has()` and `:focus-within`
 * on the pill painting a child, and the failure it has to catch is the rule
 * matching nothing at all — which leaves every icon its resting grey and looks
 * exactly like a passing class-name test. The four states are read together so
 * one of them silently falling back is visible against the other three.
 */
test.describe("field state reaches the leading icon", () => {
  // §2 tokens, resolved: --prime, --danger, --n-secondary, --n-disabled.
  const PRIME = "rgb(33, 184, 220)";
  const DANGER = "rgb(255, 114, 118)";
  const SECONDARY = "rgb(157, 163, 176)";
  const DISABLED = "rgb(77, 81, 89)";

  test("rest, focus, error and disabled each reach it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/primitives");
    await page.evaluate(() => document.fonts.ready);

    const demo = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Field state, all the way to the icon" }),
    });

    const read = () =>
      demo.evaluate((section) => {
        const fields = [...section.querySelectorAll(".field")];
        const leading = (index: number) =>
          getComputedStyle(fields[index]!.querySelector(".field-icon-leading")!).color;
        // The pill is [leading, input, trailing] — the trailing slot is
        // decoration and must not follow the state.
        const trailing = getComputedStyle(
          fields[3]!.querySelector(".field-pill")!.lastElementChild!,
        ).color;
        return { rest: leading(0), error: leading(1), disabled: leading(2), trailing };
      });

    const atRest = await read();
    expect(atRest.rest).toBe(SECONDARY);
    expect(atRest.error).toBe(DANGER);
    expect(atRest.disabled).toBe(DISABLED);
    expect(atRest.trailing).toBe(SECONDARY);

    // Focus is the one state that needs a pointer to reach. The colour
    // transitions over --t-fast, and a computed value read mid-transition is
    // the *interpolated* one — which on the first frame is still the resting
    // grey, and reads as "the rule never matched".
    await demo.locator(".field input").first().click();
    await page.waitForTimeout(250);
    const focused = await read();
    expect(focused.rest).toBe(PRIME);

    // And the other three are unmoved by one field taking focus.
    expect(focused.error).toBe(DANGER);
    expect(focused.disabled).toBe(DISABLED);
    expect(focused.trailing).toBe(SECONDARY);
  });
});
