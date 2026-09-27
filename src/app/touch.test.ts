import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * design-spec §17 C-27, the *grep* half — the browser half is `e2e/forms.spec.ts`.
 *
 * "No input has a font size below 16 at any width, every control carries
 * `touch-action: manipulation`, and the tap highlight is transparent."
 */

const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
  // Prose about a rule is not the rule.
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the one rule whose selector list is exactly `selectors`, in any order. */
function ruleFor(selectors: string[]): string | null {
  for (const match of globals.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const found = match[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectors.every((s) => found.includes(s))) return match[2]!;
  }
  return null;
}

/** Every font size a `.type-*` role is given, at any width. */
function roleSizes(role: string): number[] {
  const sizes: number[] = [];
  for (const match of globals.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(",").map((s) => s.trim());
    if (!selectors.includes(`.type-${role}`)) continue;
    for (const size of match[2]!.matchAll(/font-size:\s*(\d+)px/g)) sizes.push(Number(size[1]));
  }
  return sizes;
}

describe("C-27 · touch-safe controls, in the stylesheet", () => {
  it("gives every control `touch-action: manipulation`", () => {
    const body = ruleFor(["button", "a[href]", "input", "textarea", "select", "label"]);
    expect(body).not.toBeNull();
    expect(body).toMatch(/touch-action:\s*manipulation/);
  });

  it("makes the tap highlight transparent at the root", () => {
    expect(ruleFor(["html"])).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  });

  // Every role an input is set in (variants.ts): the field's and the OTP box's.
  it("sets no input role below 16", () => {
    for (const role of ["ui-input", "special-otp"]) {
      const sizes = roleSizes(role);
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    }
  });
});
