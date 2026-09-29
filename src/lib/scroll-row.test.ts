import { describe, expect, it } from "vitest";

import { activeScrollLeft } from "./scroll-row";

/**
 * §8.19 and §8.26: below 768 a tab row and the pipeline strip scroll with the active
 * element in view (T0.48). The browser half — that the strip really overflows and lands
 * where this says — is TC3 in `e2e/frame.spec.ts`.
 */
describe("activeScrollLeft", () => {
  it("scrolls nowhere while the row fits", () => {
    expect(
      activeScrollLeft({ listWidth: 400, scrollWidth: 400, activeLeft: 300, activeWidth: 80 }),
    ).toBe(0);
    expect(
      activeScrollLeft({ listWidth: 400, scrollWidth: 350, activeLeft: 300, activeWidth: 50 }),
    ).toBe(0);
  });

  it("centres the active element in a row that overflows", () => {
    // The element's centre is at 340; the row's centre is 150; scroll 190.
    expect(
      activeScrollLeft({ listWidth: 300, scrollWidth: 800, activeLeft: 300, activeWidth: 80 }),
    ).toBe(190);
  });

  it("clamps to the row's own range at either end", () => {
    expect(
      activeScrollLeft({ listWidth: 300, scrollWidth: 800, activeLeft: 0, activeWidth: 80 }),
    ).toBe(0);
    // Centring the last element would ask for 690; the row can only scroll 500.
    expect(
      activeScrollLeft({ listWidth: 300, scrollWidth: 800, activeLeft: 720, activeWidth: 80 }),
    ).toBe(500);
  });
});
