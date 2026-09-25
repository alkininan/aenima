import { expect, test, type Page } from "@playwright/test";

/**
 * design-spec.md §17's C-07, C-08, C-27 and C-31 over the buttons, fields and sign-in step
 * (T0.42). Browser checks, because each one measures something a DOM emulator does not
 * have: a line box, a painted transform, a media query, a computed touch rule.
 *
 * C-18 and C-19 are *dom* checks and live beside the form, in SignInForm.dom.test.tsx.
 */

const SINK = "/dev/primitives";

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test.describe("C-07 · button and icon-button geometry", () => {
  test("buttons are 28, 34 and 48 with vertical padding (height − line) ÷ 2", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SINK);
    await settle(page);

    const measured = await page.evaluate(() =>
      // A button is what wears §3's button roles; a chip or an icon button wears neither.
      [...document.querySelectorAll("button.type-ui-button, button.type-ui-button-sm")].map((b) => {
        const s = getComputedStyle(b);
        return {
          h: Math.round(b.getBoundingClientRect().height),
          pad: parseFloat(s.paddingTop),
          padBottom: parseFloat(s.paddingBottom),
          // The label's line box is the button's type role, ui-button or ui-button-sm.
          line: parseFloat(s.lineHeight),
        };
      }),
    );

    expect(measured.length).toBeGreaterThan(0);
    const heights = new Set(measured.map((m) => m.h));
    // The preview's full-width primary is lg too, so nothing outside the three.
    expect([...heights].sort()).toEqual([28, 34, 48]);
    for (const m of measured) {
      expect(m.pad).toBe((m.h - m.line) / 2);
      expect(m.padBottom).toBe(m.pad);
    }
  });

  test("icon buttons are square at the same three, padded (box − icon) ÷ 2", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SINK);
    await settle(page);

    const measured = await page.evaluate(() =>
      [...document.querySelectorAll("button.control[aria-label]")]
        .filter((b) => b.querySelector("svg") && !b.hasAttribute("aria-busy"))
        .map((b) => {
          const box = b.getBoundingClientRect();
          const icon = b.querySelector("svg")!.getBoundingClientRect();
          const s = getComputedStyle(b);
          return {
            w: Math.round(box.width),
            h: Math.round(box.height),
            icon: Math.round(icon.width),
            inset: Math.round(icon.x - box.x),
            pad: parseFloat(s.paddingLeft),
            padTop: parseFloat(s.paddingTop),
          };
        }),
    );

    expect(measured.length).toBeGreaterThan(0);
    const expected: Record<number, { icon: number; pad: number }> = {
      28: { icon: 18, pad: 5 },
      34: { icon: 20, pad: 7 },
      48: { icon: 24, pad: 12 },
    };
    for (const m of measured) {
      expect(m.w).toBe(m.h);
      const spec = expected[m.h];
      expect(spec).toBeDefined();
      expect(m.icon).toBe(spec!.icon);
      // The padding is declared, not merely the result of centring.
      expect(m.pad).toBe(spec!.pad);
      expect(m.padTop).toBe(spec!.pad);
      expect(m.inset).toBe(spec!.pad);
    }
  });
});

test.describe("C-08 · the field reserves everything it will ever show", () => {
  test("the floated label moves on transform alone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await settle(page);

    const email = page.getByLabel("Email");
    await email.blur();
    await page.waitForTimeout(250);

    const read = () =>
      page.evaluate(() => {
        const label = document.querySelector(".field label") as HTMLElement;
        const s = getComputedStyle(label);
        return {
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          fontWeight: s.fontWeight,
          transition: s.transitionProperty,
          transform: s.transform,
          paintedHeight: label.getBoundingClientRect().height,
        };
      });

    const rest = await read();
    await email.focus();
    await page.waitForTimeout(250);
    const floated = await read();

    // The scaled box must not overshoot: a 375 page never pans sideways, at rest or floated.
    await page.setViewportSize({ width: 375, height: 812 });
    await email.blur();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await email.focus();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

    // §8.2: at rest the label is its floated self — ui-label, 13/18 Medium — scaled 17/13.
    for (const state of [rest, floated]) {
      expect(state.fontSize).toBe("13px");
      expect(state.lineHeight).toBe("18px");
      expect(state.fontWeight).toBe("500");
      // Never font-size, which would re-lay the text out on every frame.
      expect(state.transition).toBe("transform");
    }
    expect(rest.transform).not.toBe(floated.transform);
    expect(rest.paintedHeight).toBeCloseTo((18 * 17) / 13, 1);
    expect(floated.paintedHeight).toBeCloseTo(18, 1);
  });

  test("the OTP group reserves two helper lines, and an error moves nothing", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(SINK);
    await settle(page);

    const read = () =>
      page.evaluate(() => {
        const section = [...document.querySelectorAll("section")].find(
          (s) => s.querySelector("h2")?.textContent === "OTP",
        )!;
        return [...section.querySelectorAll('[role="group"]')].map((group) => {
          const helper = group.parentElement!.lastElementChild!.getBoundingClientRect();
          return {
            helperHeight: Math.round(helper.height),
            composite: Math.round(group.parentElement!.getBoundingClientRect().height),
          };
        });
      });

    const groups = await read();
    // Empty, partly filled, error, disabled — the error one carries its message.
    expect(groups.length).toBe(4);
    for (const g of groups) expect(g.helperHeight).toBe(36);
    expect(new Set(groups.map((g) => g.composite)).size).toBe(1);
  });

  test("a focused field in error keeps its danger border and icon", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await settle(page);

    const email = page.getByLabel("Email");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText("That doesn't look like an email address yet.")).toBeVisible();

    await email.click();
    await page.waitForTimeout(250);
    await expect(email).toBeFocused();

    const paint = await page.evaluate(() => {
      const pill = document.querySelector(".field-pill") as HTMLElement;
      return {
        border: getComputedStyle(pill).borderColor,
        icon: getComputedStyle(pill.querySelector(".field-icon-leading")!).color,
      };
    });
    // §2 --danger, resolved: error outranks focus (§8.2).
    expect(paint.border).toBe("rgb(255, 114, 118)");
    expect(paint.icon).toBe("rgb(255, 114, 118)");
  });
});

test.describe("C-08 · the step's geometry (§8.3)", () => {
  // §4: the column sits inside the mode's gutters — 16 in hand chrome, so 343 at 375.
  for (const [width, height, top, column] of [
    [1440, 900, 48, 400],
    [1440, 500, 16, 400],
    [375, 812, 48, 343],
  ] as const) {
    test(`the mark sits ${top} below the top of a ${width}×${height} page`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/sign-in");
      await settle(page);

      const m = await page.evaluate(() => {
        const mark = document.querySelector("main svg")!.getBoundingClientRect();
        const title = document.querySelector("h1")!.getBoundingClientRect();
        const subtitle = document.querySelector("h1 + p")!.getBoundingClientRect();
        const field = document.querySelector(".field")!.getBoundingClientRect();
        const column = document.querySelector("main > div")!.getBoundingClientRect();
        return {
          markTop: Math.round(mark.y + window.scrollY),
          markSize: Math.round(mark.height),
          markToTitle: Math.round(title.y - mark.bottom),
          titleBlockToField: Math.round(field.y - subtitle.bottom),
          column: Math.round(column.width),
        };
      });

      expect(m.markTop).toBe(top);
      expect(m.markSize).toBe(32);
      expect(m.markToTitle).toBe(24);
      expect(m.titleBlockToField).toBe(24);
      expect(m.column).toBe(column);
    });
  }
});

test.describe("C-27 · touch-safe inputs and controls", () => {
  for (const path of ["/sign-in", SINK]) {
    for (const width of [375, 1440]) {
      test(`${path} at ${width}: inputs 16 or more, controls manipulation, no tap flash`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settle(page);

        const found = await page.evaluate(() => {
          const visible = (el: Element) => {
            const s = getComputedStyle(el);
            return s.display !== "none" && el.getClientRects().length > 0;
          };
          const inputs = [...document.querySelectorAll("input, textarea, select")].filter(
            (el) => (el as HTMLInputElement).type !== "hidden",
          );
          const controls = [
            ...document.querySelectorAll(
              'button, a[href], input, textarea, select, label, [role="button"], [role="option"], [role="menuitem"], [role="tab"]',
            ),
          ].filter(visible);
          return {
            inputs: inputs.length,
            small: inputs
              .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
              .map((el) => `${el.tagName} ${getComputedStyle(el).fontSize}`),
            controls: controls.length,
            notManipulation: controls
              .filter((el) => getComputedStyle(el).touchAction !== "manipulation")
              .map((el) => `${el.tagName}.${el.className}`.slice(0, 80)),
            tap: getComputedStyle(document.body).getPropertyValue("-webkit-tap-highlight-color"),
          };
        });

        expect(found.inputs).toBeGreaterThan(0);
        expect(found.small).toEqual([]);
        expect(found.controls).toBeGreaterThan(0);
        expect(found.notManipulation).toEqual([]);
        expect(found.tap).toBe("rgba(0, 0, 0, 0)");
      });
    }
  }
});

test.describe("C-31 · the ring is the keyboard's alone", () => {
  const ring = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const s = getComputedStyle(document.querySelector(sel)!);
      return s.outlineStyle === "none" || s.outlineWidth === "0px" ? "none" : s.outlineWidth;
    }, selector);

  test("no ring on load, none on a click, one after Tab, and never on main", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-in");
    await settle(page);
    await page.waitForTimeout(250);

    await expect(page.getByLabel("Email")).toBeFocused();
    expect(await ring(page, ".field-pill")).toBe("none");
    expect(await ring(page, "main")).toBe("none");

    await page.getByLabel("Email").click();
    await page.waitForTimeout(250);
    expect(await ring(page, ".field-pill")).toBe("none");

    await page.locator("h1").click();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);
    await expect(page.getByLabel("Email")).toBeFocused();
    expect(await ring(page, ".field-pill")).toBe("2px");
    expect(await ring(page, "main")).toBe("none");
  });
});
