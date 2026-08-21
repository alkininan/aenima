import { describe, expect, it } from "vitest";

import {
  AVATAR_SIZES,
  TAB_LIST_CLASSES,
  AVATAR_STATUSES,
  CHECK_LABEL_CLASSES,
  CHECK_ROW_CLASSES,
  MENU_SEPARATOR_CLASSES,
  MODAL_WIDTHS,
  PANEL_MAX_HEIGHT,
  RADIO_DOT_CLASSES,
  SKELETON_SHAPES,
  TAB_UNDERLINE_CLASSES,
  TOAST_DISMISS_MS,
  TOAST_TONES,
  TOAST_UNDO_DISMISS_MS,
  TOOLTIP_SHOW_DELAY_MS,
  TOGGLE_THUMB_CLASSES,
  avatarClasses,
  avatarInitialsClasses,
  avatarStatusClasses,
  checkBoxClasses,
  emptyStateClasses,
  menuPanelClasses,
  modalClasses,
  panelClasses,
  panelRowClasses,
  sheetClasses,
  skeletonClasses,
  tabClasses,
  toastClasses,
  toastDotClasses,
  toggleTrackClasses,
  tooltipClasses,
} from "@/components/ui/variants";

/** Class lists are order-insensitive; compare as sets. */
const has = (classes: string, ...expected: string[]) => {
  const present = new Set(classes.split(" ").filter(Boolean));
  return expected.every((token) => present.has(token));
};

describe("tooltipClasses", () => {
  // design-spec.md §8: --surface-2, radius 8, ui-caption, pad 6/10,
  // max-width 240, no arrow, z 600 (§4).
  it("builds the §8 tooltip box", () => {
    const classes = tooltipClasses();
    expect(
      has(
        classes,
        "bg-surface-2",
        "rounded-xs",
        "type-ui-caption",
        "px-[10px]",
        "py-[6px]",
        "max-w-[240px]",
        "z-[var(--z-tooltip)]",
      ),
    ).toBe(true);
  });

  it("takes its z from the §4 ladder, never a raw number", () => {
    expect(tooltipClasses()).not.toMatch(/\bz-\d/);
  });

  it("flips the stand-off when it opens downwards", () => {
    expect(has(tooltipClasses("top"), "bottom-full", "mb-[8px]")).toBe(true);
    expect(has(tooltipClasses("bottom"), "top-full", "mt-[8px]")).toBe(true);
  });

  it("shows after the §8 delay", () => {
    expect(TOOLTIP_SHOW_DELAY_MS).toBe(500);
  });
});

describe("panelClasses", () => {
  // §8: panel --surface-1, radius 12, dropdown shadow, 6px padding (all in
  // `.panel`), max-height 320 with inner scroll, z 300 (§4).
  it("caps the panel at the §8 max height with its own scrollbar", () => {
    const classes = panelClasses();
    expect(has(classes, "panel", "scroll-thin", "max-h-[320px]", "overflow-y-auto")).toBe(true);
    expect(PANEL_MAX_HEIGHT).toBe(320);
  });

  it("sits on the popover rung", () => {
    expect(panelClasses()).toContain("z-[var(--z-popover)]");
    expect(panelClasses()).not.toMatch(/\bz-\d/);
  });

  // §8: opens below, above if less than 320px of space.
  it("hangs below by default and above when flipped", () => {
    expect(has(panelClasses(), "top-full", "mt-[8px]")).toBe(true);
    expect(has(panelClasses({ placement: "above" }), "bottom-full", "mb-[8px]")).toBe(true);
  });

  it("lets a menu size to its content", () => {
    expect(has(menuPanelClasses(), "w-max", "left-0")).toBe(true);
    expect(has(menuPanelClasses({ align: "end" }), "right-0")).toBe(true);
  });
});

describe("panelRowClasses", () => {
  // §8: options 36h, ui-body, pad …/12, radius 8; hover --surface-3.
  it("builds the 36h row", () => {
    const classes = panelRowClasses();
    expect(has(classes, "h-[36px]", "type-ui-body", "px-[12px]", "rounded-xs")).toBe(true);
    expect(classes).toContain("hover:bg-surface-3");
  });

  // §7 selected: --prime-soft fill, --n-primary text.
  it("marks the selected row with prime-soft", () => {
    const classes = panelRowClasses({ selected: true });
    expect(has(classes, "bg-prime-soft", "text-n-primary")).toBe(true);
  });

  // The keyboard cursor reuses hover — §8 gives it no separate treatment.
  it("gives the keyboard cursor the hover fill", () => {
    expect(has(panelRowClasses({ active: true }), "bg-surface-3")).toBe(true);
    // Selection is the stronger signal and is not overpainted.
    expect(has(panelRowClasses({ active: true, selected: true }), "bg-surface-3")).toBe(false);
  });

  // §8 menus: destructive rows --danger text.
  it("paints a destructive row in danger and nothing else", () => {
    expect(has(panelRowClasses({ destructive: true }), "text-danger")).toBe(true);
    expect(panelRowClasses()).not.toContain("danger");
  });

  // §7 disabled: --n-disabled, cursor default, no hover.
  it("drops hover and the pointer on a disabled row", () => {
    const classes = panelRowClasses({ disabled: true });
    expect(has(classes, "text-n-disabled", "cursor-default")).toBe(true);
    expect(classes).not.toContain("hover:");
  });

  // §8: separators 1px --glass-border. §4: 1px everywhere.
  it("keeps the separator a hairline", () => {
    expect(has(MENU_SEPARATOR_CLASSES, "h-[1px]", "bg-glass-border")).toBe(true);
  });
});

describe("checkBoxClasses", () => {
  // §8: 20×20; checkbox radius 6, radio circle; unchecked --surface-1 +
  // --glass-border; checked --prime fill with a #0E0F11 mark.
  it("builds the 20px box", () => {
    expect(
      has(checkBoxClasses(), "size-[20px]", "bg-surface-1", "border-glass-border", "text-bg-base"),
    ).toBe(true);
  });

  it("shapes the checkbox at radius 6 and the radio as a circle", () => {
    expect(has(checkBoxClasses("checkbox"), "rounded-[6px]")).toBe(true);
    expect(has(checkBoxClasses("radio"), "rounded-pill")).toBe(true);
  });

  it("fills with prime once checked", () => {
    const classes = checkBoxClasses();
    expect(classes).toContain("group-has-[:checked]:bg-prime");
    expect(classes).toContain("group-has-[:checked]:border-prime");
  });

  // §7 disabled: fills at 40% opacity.
  it("drops the fill to 40% when the input is disabled", () => {
    expect(checkBoxClasses()).toContain("group-has-[:disabled]:opacity-40");
  });

  // §6 press physics apply; §8 puts the hit area on the whole row.
  it("is a tactile control inside a tactile row", () => {
    expect(has(checkBoxClasses(), "control")).toBe(true);
    expect(has(CHECK_ROW_CLASSES, "control-host", "group", "gap-[10px]")).toBe(true);
    expect(has(CHECK_LABEL_CLASSES, "type-ui-body")).toBe(true);
  });

  // 8px is the system dot, confirmed on the ticket; §8 gives only the colour.
  it("puts an 8px dot in the radio", () => {
    expect(has(RADIO_DOT_CLASSES, "size-[8px]", "rounded-pill", "bg-bg-base")).toBe(true);
  });
});

describe("toggleTrackClasses", () => {
  // §8: 56×28, --r-pill, 2px inset, thumb 24; off --surface-2 / --n-secondary,
  // on --prime / --n-white; --t-fast on both.
  it("builds the 56×28 track", () => {
    const classes = toggleTrackClasses();
    expect(has(classes, "h-[28px]", "w-[56px]", "rounded-pill", "bg-surface-2", "p-[2px]")).toBe(
      true,
    );
    expect(classes).toContain("group-has-[:checked]:bg-prime");
    expect(classes).toContain("duration-[var(--t-fast)]");
  });

  it("travels the thumb by the track minus its inset and its own width", () => {
    // 56 − 2 − 2 − 24 = 28.
    expect(has(TOGGLE_THUMB_CLASSES, "size-[24px]", "bg-n-secondary")).toBe(true);
    expect(TOGGLE_THUMB_CLASSES).toContain("group-has-[:checked]:translate-x-[28px]");
    expect(TOGGLE_THUMB_CLASSES).toContain("group-has-[:checked]:bg-n-white");
  });
});

describe("tabClasses", () => {
  // §8: ui-subhead, inactive --n-secondary, active --n-primary + 2px --prime
  // underline (radius 2), hover overlay on a 36h hit area.
  it("builds the 36h hit area", () => {
    const classes = tabClasses();
    expect(has(classes, "h-[36px]", "type-ui-subhead", "text-n-secondary")).toBe(true);
    expect(classes).toContain("hover:bg-[var(--hover-overlay)]");
  });

  it("lifts the active tab to primary text", () => {
    expect(has(tabClasses(true), "text-n-primary")).toBe(true);
    expect(has(tabClasses(true), "text-n-secondary")).toBe(false);
  });

  it("underlines at 2px on radius 2", () => {
    expect(has(TAB_UNDERLINE_CLASSES, "h-[2px]", "rounded-[2px]", "bg-prime")).toBe(true);
  });

  // §6 lists press physics for buttons, chips, toggle and checkbox — not tabs.
  it("takes hover but not the press physics", () => {
    expect(has(tabClasses(), "control")).toBe(false);
  });

  // §7 disabled: --n-disabled text, no hover, cursor default.
  it("dims a disabled tab and takes its hover away", () => {
    const classes = tabClasses(false, true);
    expect(classes).toContain("disabled:text-n-disabled");
    expect(classes).toContain("disabled:cursor-default");
    expect(classes).toContain("not-disabled:hover:bg-[var(--hover-overlay)]");
    expect(has(classes, "pointer-events-none")).toBe(true);
  });

  // A strip too wide for its column scrolls; it never pushes the page sideways.
  it("scrolls the strip instead of wrapping it", () => {
    expect(has(TAB_LIST_CLASSES, "overflow-x-auto", "scroll-thin")).toBe(true);
    expect(has(tabClasses(), "shrink-0")).toBe(true);
  });
});

describe("toastClasses", () => {
  // §8: glass recipe, radius 12, ui-body, z 500 (§4), auto-dismiss 5s.
  it("builds the glass toast", () => {
    const classes = toastClasses();
    expect(has(classes, "glass", "rounded-[12px]", "type-ui-body", "p-[20px]")).toBe(true);
    expect(classes).toContain("[--glass-elevation:var(--shadow-dropdown)]");
  });

  // §8 is the default clock; §12 gives the undo case longer. Both are law.
  it("runs two clocks: 5s to read, 8s to act", () => {
    expect(TOAST_DISMISS_MS).toBe(5000);
    expect(TOAST_UNDO_DISMISS_MS).toBe(8000);
  });

  // §8: "never a red toast — errors surface inline". §0 law 2 backs it up.
  it("offers success and warning and no third tone", () => {
    expect(TOAST_TONES).toEqual(["success", "warning"]);
    expect(has(toastDotClasses("success"), "bg-success", "size-[8px]")).toBe(true);
    expect(has(toastDotClasses("warning"), "bg-warning")).toBe(true);
    for (const tone of TOAST_TONES) {
      expect(toastDotClasses(tone)).not.toContain("danger");
    }
    expect(toastClasses()).not.toContain("danger");
  });
});

describe("modalClasses", () => {
  // §8: glass recipe, --r-md, modal shadow, max 400 (confirm) / 640 (content).
  it("builds the glass modal at both widths", () => {
    expect(has(modalClasses("confirm"), "glass", "rounded-md", "max-w-[400px]")).toBe(true);
    expect(has(modalClasses("content"), "max-w-[640px]")).toBe(true);
    expect(MODAL_WIDTHS).toEqual(["confirm", "content"]);
  });

  it("carries the §5 modal shadow, not the dropdown one", () => {
    expect(modalClasses()).toContain("[--glass-elevation:var(--shadow-modal)]");
  });

  // §8: 480 wide, right slide-in, --r-lg on the leading corners only.
  it("builds the sheet on its leading corners", () => {
    const classes = sheetClasses();
    expect(has(classes, "glass", "max-w-[480px]", "rounded-l-lg", "sheet-in", "h-full")).toBe(true);
    expect(classes).not.toContain("rounded-lg ");
  });
});

describe("avatarClasses", () => {
  // §8: circular, sizes 24 · 32 · 40 · 44 · 48 · 56 · 64 · 80 · 96 · 112.
  it("is the §8 size scale exactly", () => {
    expect(AVATAR_SIZES).toEqual([24, 32, 40, 44, 48, 56, 64, 80, 96, 112]);
  });

  it("renders every size as a circle", () => {
    for (const size of AVATAR_SIZES) {
      expect(has(avatarClasses(size), `size-[${size}px]`, "rounded-pill")).toBe(true);
    }
  });

  it("takes initials off the §3 scale rather than scaling them freehand", () => {
    expect(avatarInitialsClasses(24)).toBe("type-ui-caption");
    expect(avatarInitialsClasses(96)).toBe("type-display-md");
  });

  // §8: --success present, --warning away — the same dot language as freshness.
  it("tones the status dot and keeps it 8px", () => {
    expect(AVATAR_STATUSES).toEqual(["present", "away"]);
    expect(has(avatarStatusClasses("present"), "bg-success", "size-[8px]", "rounded-pill")).toBe(
      true,
    );
    expect(has(avatarStatusClasses("away"), "bg-warning")).toBe(true);
  });

  // §4: 1px everywhere; 2px is reserved for meaning.
  it("separates the dot with a 1px ring", () => {
    expect(has(avatarStatusClasses(), "outline-1", "outline-bg-base")).toBe(true);
  });
});

describe("emptyStateClasses", () => {
  // §0 law 9 rations the dot grid; §8 allows it on an empty state.
  it("adds the texture only when asked", () => {
    expect(has(emptyStateClasses(true), "dot-grid")).toBe(true);
    expect(has(emptyStateClasses(), "dot-grid")).toBe(false);
  });
});

describe("skeletonClasses", () => {
  // §6 owns the shimmer itself; the shape only picks a §5 radius.
  it("shimmers whatever the shape", () => {
    for (const shape of SKELETON_SHAPES) {
      expect(has(skeletonClasses(shape), "shimmer")).toBe(true);
    }
  });

  it("mirrors a card, a line of text or a circle", () => {
    expect(has(skeletonClasses("block"), "rounded-sm")).toBe(true);
    expect(has(skeletonClasses("text"), "rounded-pill")).toBe(true);
    expect(has(skeletonClasses("circle"), "rounded-pill", "aspect-square")).toBe(true);
  });
});
