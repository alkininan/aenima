import { describe, expect, it } from "vitest";

import {
  BUTTON_SIZES,
  BUTTON_SPINNER_SIZE,
  BUTTON_VARIANTS,
  CHIP_GAP_TONES,
  SPINNER_SIZES,
  SPINNER_TONES,
  buttonClasses,
  chipClasses,
  iconButtonClasses,
  inputFieldClasses,
  inputHelperClasses,
  spinnerClasses,
  type ButtonVariant,
} from "@/components/ui/variants";

/** Class lists are order-insensitive; compare as sets. */
const has = (classes: string, ...expected: string[]) => {
  const present = new Set(classes.split(" ").filter(Boolean));
  return expected.every((token) => present.has(token));
};

describe("buttonClasses", () => {
  it("defaults to md + primary", () => {
    const classes = buttonClasses();
    expect(has(classes, "h-[34px]", "type-ui-button", "bg-prime", "text-bg-base")).toBe(true);
  });

  // design-spec.md §8: sm 28h pad 4/10 gap 4 icon 18 · md 34h pad 7/14 gap 4
  // icon 20 · lg 48h pad 12/20 gap 4 icon 24.
  it.each([
    ["sm", "h-[28px]", "px-[10px]", "py-[4px]", "[--control-icon:18px]", "type-ui-button-sm"],
    ["md", "h-[34px]", "px-[14px]", "py-[7px]", "[--control-icon:20px]", "type-ui-button"],
    ["lg", "h-[48px]", "px-[20px]", "py-[12px]", "[--control-icon:24px]", "type-ui-button"],
  ] as const)("sizes %s to the spec box", (size, ...expected) => {
    const classes = buttonClasses({ size });
    expect(has(classes, ...expected, "gap-[4px]", "rounded-pill")).toBe(true);
  });

  it.each([
    ["primary", ["bg-prime", "text-bg-base", "control-edge-strong"]],
    ["soft", ["bg-prime-soft", "text-prime"]],
    ["secondary", ["border", "border-glass-border", "bg-transparent", "text-n-primary"]],
    ["ghost", ["bg-transparent", "text-n-secondary"]],
    ["danger", ["bg-danger-deep", "text-n-white"]],
  ] as const)("paints the %s variant from its tokens", (variant, expected) => {
    expect(has(buttonClasses({ variant }), ...expected)).toBe(true);
  });

  // §5 law: every glass surface and primary control carries the specular edge;
  // §8 states the 24% highlight for Primary only.
  it("gives the specular edge to primary alone", () => {
    for (const variant of BUTTON_VARIANTS) {
      const classes = buttonClasses({ variant });
      expect(has(classes, "control-edge-strong")).toBe(variant === "primary");
    }
  });

  // §7 disabled: --n-disabled label, fills at 40%.
  it("carries a disabled treatment for every variant", () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonClasses({ variant })).toContain("disabled:text-n-disabled");
    }
  });

  it.each([
    ["primary", "disabled:bg-prime/40"],
    ["soft", "disabled:bg-prime-soft/40"],
    ["secondary", "disabled:border-glass-border/40"],
    ["danger", "disabled:bg-danger-deep/40"],
  ] as const)("drops the %s fill to 40%% when disabled", (variant, expected) => {
    expect(has(buttonClasses({ variant }), expected)).toBe(true);
  });

  // §8 loading: spinner replaces the label, width locked — the button keeps its
  // variant fill and is not restyled as disabled.
  it("blocks the press while loading without borrowing disabled styling", () => {
    const loading = buttonClasses({ loading: true });
    expect(has(loading, "pointer-events-none", "bg-prime")).toBe(true);
    expect(buttonClasses()).not.toContain("pointer-events-none");
  });

  it("takes fullWidth and caller classes last", () => {
    expect(buttonClasses({ fullWidth: true })).toContain("w-full");
    expect(buttonClasses()).not.toContain("w-full");
    expect(buttonClasses({ className: "ml-auto" }).endsWith("ml-auto")).toBe(true);
  });

  // §0 law 2: Danger is reserved for destructive actions.
  it("keeps danger tokens out of every non-danger variant", () => {
    for (const variant of BUTTON_VARIANTS) {
      const usesDanger = /danger/.test(buttonClasses({ variant }));
      expect(usesDanger).toBe(variant === "danger");
    }
  });

  it("pairs each size with a spec spinner ring", () => {
    for (const size of BUTTON_SIZES) {
      expect(SPINNER_SIZES).toContain(BUTTON_SPINNER_SIZE[size]);
    }
  });
});

describe("iconButtonClasses", () => {
  // §8: 28/34/48 square, same variants. Icon sizes stay the button grammar's.
  it.each([
    ["sm", "size-[28px]", "[--control-icon:18px]"],
    ["md", "size-[34px]", "[--control-icon:20px]"],
    ["lg", "size-[48px]", "[--control-icon:24px]"],
  ] as const)("squares %s", (size, box, icon) => {
    expect(has(iconButtonClasses({ size }), box, icon, "rounded-pill")).toBe(true);
  });

  it("reuses the button's variant grammar exactly", () => {
    for (const variant of BUTTON_VARIANTS as readonly ButtonVariant[]) {
      const button = new Set(buttonClasses({ variant }).split(" "));
      for (const token of iconButtonClasses({ variant }).split(" ")) {
        if (token.startsWith("bg-") || token.startsWith("text-") || token.startsWith("control-")) {
          expect(button.has(token)).toBe(true);
        }
      }
    }
  });
});

describe("inputFieldClasses", () => {
  // §8: field 52h, --r-pill, --surface-1 fill, 1px --glass-border, pad 14/16, gap 8.
  it("builds the resting 52h pill", () => {
    const classes = inputFieldClasses();
    expect(
      has(
        classes,
        "h-[52px]",
        "rounded-pill",
        "bg-surface-1",
        "border-glass-border",
        "px-[16px]",
        "py-[14px]",
        "gap-[8px]",
      ),
    ).toBe(true);
  });

  // §8 focus: --prime border + ring/glow.
  it("moves the border to prime on focus", () => {
    expect(inputFieldClasses()).toContain("focus-within:border-prime");
    expect(inputFieldClasses()).toContain("focus-within:shadow-[var(--prime-glow)]");
  });

  // §8 error: --danger border.
  it("swaps the border to danger when invalid", () => {
    const classes = inputFieldClasses({ invalid: true });
    expect(has(classes, "border-danger")).toBe(true);
    expect(has(classes, "border-glass-border")).toBe(false);
  });

  // §7 disabled: 40% opacity, cursor default, no focus affordance.
  it("dims to 40% and drops focus styling when disabled", () => {
    const classes = inputFieldClasses({ disabled: true });
    expect(has(classes, "opacity-40", "cursor-default")).toBe(true);
    expect(classes).not.toContain("focus-within:");
  });
});

describe("inputHelperClasses", () => {
  // §8: helper is ui-footnote --n-secondary, flipping to --danger on error.
  it("flips the helper to danger only on error", () => {
    expect(has(inputHelperClasses(), "type-ui-footnote", "text-n-secondary", "mt-[8px]")).toBe(
      true,
    );
    expect(has(inputHelperClasses(true), "text-danger")).toBe(true);
    expect(inputHelperClasses()).not.toContain("text-danger");
  });
});

describe("chipClasses", () => {
  // §8: chip 24h, --r-pill, --surface-2 fill, ui-caption.
  it("builds the base chip", () => {
    expect(has(chipClasses(), "h-[24px]", "rounded-pill", "bg-surface-2", "type-ui-caption")).toBe(
      true,
    );
  });

  // §8: type badges are informative, never colourful.
  it("keeps the type badge outlined and neutral", () => {
    const classes = chipClasses({ variant: "type-badge" });
    expect(
      has(classes, "border", "border-glass-border", "bg-transparent", "text-n-secondary"),
    ).toBe(true);
    expect(has(classes, "bg-surface-2")).toBe(false);
  });

  // §8 gap chips: open Must warning-toned, open Should and accepted neutral,
  // excluded a disabled outline.
  it.each([
    ["must", ["bg-warning-soft", "text-warning"]],
    ["should", ["bg-surface-2", "text-n-secondary"]],
    ["accepted", ["bg-surface-2", "text-n-secondary"]],
    ["excluded", ["border-n-disabled", "bg-transparent", "text-n-disabled"]],
  ] as const)("tones the %s gap chip", (tone, expected) => {
    expect(has(chipClasses({ variant: "gap", tone }), ...expected)).toBe(true);
  });

  // §0 law 1: gaps never render in Danger red.
  it("never uses danger on a gap chip", () => {
    for (const tone of CHIP_GAP_TONES) {
      expect(chipClasses({ variant: "gap", tone })).not.toContain("danger");
    }
  });

  // §8: interactive chips get hover + press.
  it("adds the tactile control only when interactive", () => {
    expect(has(chipClasses({ interactive: true }), "control")).toBe(true);
    expect(has(chipClasses(), "control")).toBe(false);
  });
});

describe("spinnerClasses", () => {
  // §8: ring 16/20/24, 2px stroke, 800ms linear rotation.
  it.each(SPINNER_SIZES)("rings at %i", (size) => {
    expect(has(spinnerClasses({ size }), `size-[${size}px]`, "spinner-ring")).toBe(true);
  });

  it("defaults to a 20px prime ring", () => {
    expect(has(spinnerClasses(), "size-[20px]", "text-prime")).toBe(true);
  });

  // §8: --prime, or #0E0F11 on prime fills; `inherit` takes the label's colour.
  it.each([
    ["prime", "text-prime"],
    ["on-prime", "text-bg-base"],
  ] as const)("tones %s", (tone, expected) => {
    expect(has(spinnerClasses({ tone }), expected)).toBe(true);
  });

  it("sets no colour when told to inherit", () => {
    expect(spinnerClasses({ tone: "inherit" })).not.toContain("text-");
    expect(SPINNER_TONES).toContain("inherit");
  });
});
