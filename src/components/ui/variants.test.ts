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
  OTP_BOX_COUNT,
  OTP_GROUP_CLASSES,
  inputCompositeClasses,
  inputHelperClasses,
  otpBoxClasses,
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
    expect(has(classes, "h-[34px]", "type-ui-button", "control-gloss", "text-bg-base")).toBe(true);
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
    ["primary", ["control-gloss", "text-bg-base", "control-edge-strong"]],
    ["soft", ["bg-prime-soft", "text-prime"]],
    ["neutral", ["bg-surface-2", "text-n-primary"]],
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
    ["neutral", "disabled:bg-surface-2/40"],
    ["secondary", "disabled:border-glass-border/40"],
    ["danger", "disabled:bg-danger-deep/40"],
  ] as const)("drops the %s fill to 40%% when disabled", (variant, expected) => {
    expect(has(buttonClasses({ variant }), expected)).toBe(true);
  });

  // §8 loading: spinner replaces the label, width locked — the button keeps its
  // variant fill and is not restyled as disabled.
  it("blocks the press while loading without borrowing disabled styling", () => {
    const loading = buttonClasses({ loading: true });
    // §8 (v2.8): the variant fill it keeps is the gloss gradient.
    expect(has(loading, "pointer-events-none", "control-gloss")).toBe(true);
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
  // §8 (v2.3): field 48h, --r-pill, --surface-1 fill, 1px --glass-border, pad 16
  // horizontal, gap 8. 48 aligns the field with the lg button.
  it("builds the resting 48h pill", () => {
    const classes = inputFieldClasses();
    expect(
      has(
        classes,
        "h-[48px]",
        "rounded-pill",
        "bg-surface-1",
        "border-glass-border",
        "px-[16px]",
        "gap-[8px]",
      ),
    ).toBe(true);
  });

  // §8 option-row rule: height wins, so the value centres inside the 48 rather
  // than the 48 being built out of vertical padding. A py- utility here would
  // make the field 48 + padding.
  it("declares no vertical padding — height wins", () => {
    expect(inputFieldClasses()).not.toMatch(/\bpy-/);
  });

  // §8: the lg button is 48 too, so a field and its submit sit at one height.
  it("matches the lg button height, so a field and its submit align", () => {
    expect(buttonClasses({ size: "lg" })).toContain("h-[48px]");
    expect(inputFieldClasses()).toContain("h-[48px]");
  });

  // §8 (v2.5) focus split: pointer focus swaps the border and stops there.
  it("moves the border to prime on any focus", () => {
    expect(inputFieldClasses()).toContain("focus-within:border-prime");
  });

  /**
   * The double stroke this revision kills. No utility may paint a ring or a
   * glow on focus: both are keyboard affordances, and globals.css draws them
   * behind the modality attribute because `:focus-visible` matches a *clicked*
   * text input. A glow that reappears here is the bug coming back.
   *
   * The hook class is asserted too — the CSS rule selects on it, so dropping it
   * would silently take the keyboard ring away with no test to notice.
   */
  it("leaves the ring and the glow to the modality-gated CSS", () => {
    const classes = inputFieldClasses();

    expect(classes).toContain("field-pill");
    expect(classes).not.toContain("prime-glow");
    expect(classes).not.toContain("outline-prime");
  });

  // The OTP box is a field too, and carries the same split.
  it("gives the OTP box the same pointer/keyboard split", () => {
    const classes = otpBoxClasses();

    expect(classes).toContain("otp-box");
    expect(classes).toContain("focus:border-prime");
    expect(classes).not.toContain("prime-glow");
    expect(classes).not.toContain("outline-prime");
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

describe("inputCompositeClasses", () => {
  // §8: the label zone is always reserved, so floating never shifts layout.
  it("reserves the label zone by default", () => {
    expect(has(inputCompositeClasses(), "field")).toBe(true);
    expect(inputCompositeClasses()).not.toContain("field-unlabelled");
  });

  // §8 exemption: Search and the chat composer are labelled by context.
  it("drops the zone for the fields §8 exempts", () => {
    expect(has(inputCompositeClasses({ floatingLabel: false }), "field-unlabelled")).toBe(true);
  });

  // A leading icon moves where the value starts (16 + 24 + 8), and the label
  // tracks it — §8 animates translateY only, so there is one x for both states.
  it("shifts the label to the value's x when there is a leading icon", () => {
    expect(has(inputCompositeClasses({ leadingIcon: true }), "field-with-leading-icon")).toBe(true);
    expect(inputCompositeClasses()).not.toContain("field-with-leading-icon");
  });
});

describe("inputHelperClasses", () => {
  // §8 (v2.3): the helper speaks only in states — error, warning, success. It
  // has no neutral tone, because instructions belong in the subtitle slot.
  it("carries one tone per state and none by default", () => {
    expect(has(inputHelperClasses(), "type-ui-footnote", "mt-[8px]")).toBe(true);
    expect(has(inputHelperClasses("error"), "text-danger")).toBe(true);
    expect(has(inputHelperClasses("warning"), "text-warning")).toBe(true);
    expect(has(inputHelperClasses("success"), "text-success")).toBe(true);
  });

  it("stays toneless when there is no state to report", () => {
    const neutral = inputHelperClasses();
    for (const tone of ["text-danger", "text-warning", "text-success"]) {
      expect(neutral).not.toContain(tone);
    }
  });

  // §8: reserve one helper line (18h) under any field that can produce a state,
  // so an error appearing never shifts layout.
  it("reserves its line by default and gives it up only on request", () => {
    expect(has(inputHelperClasses(), "field-helper-reserved")).toBe(true);
    expect(inputHelperClasses(undefined, false)).not.toContain("field-helper-reserved");
  });
});

describe("otp geometry", () => {
  /**
   * §8: the OTP group is a distinct component, deliberately exempt from the 48
   * field height — in both directions. v2.4 gives it its own responsive step
   * rather than folding it into the field scale.
   *
   * The arithmetic is the reason the step exists: six 52s with five 16 gaps is
   * 392px, which does not fit a 375 viewport, and the boxes ran off the screen.
   * 6×44 + 5×8 is 304, which does. Both sums are asserted below, because the
   * failure they prevent is invisible until someone opens the page on a phone.
   */
  it("steps down below 768 and back up above it", () => {
    const box = otpBoxClasses();
    expect(has(box, "size-[44px]", "rounded-[22px]", "md:size-[52px]", "md:rounded-[27px]")).toBe(
      true,
    );
    expect(has(OTP_GROUP_CLASSES, "gap-[8px]", "md:gap-[16px]")).toBe(true);
  });

  it("fits a 375 viewport narrow and keeps the §8 size wide", () => {
    const width = (boxPx: number, gapPx: number) =>
      OTP_BOX_COUNT * boxPx + (OTP_BOX_COUNT - 1) * gapPx;

    expect(width(44, 8)).toBe(304);
    expect(width(44, 8)).toBeLessThan(375);
    expect(width(52, 16)).toBe(392);
  });

  // §4 density: touch targets are never below 40, and 44 is the narrow size.
  it("keeps the narrow box above the §4 touch-target floor", () => {
    expect(44).toBeGreaterThanOrEqual(40);
  });

  // §8: a filled box takes --prime; error still wins over filled.
  it("borders a filled box in prime and an errored one in danger", () => {
    expect(otpBoxClasses({ filled: true })).toContain("border-prime");
    expect(otpBoxClasses({ filled: true, invalid: true })).toContain("border-danger");
    expect(otpBoxClasses({ filled: true, invalid: true })).not.toContain("border-prime");
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
