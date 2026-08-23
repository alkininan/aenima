import { beforeEach, describe, expect, it } from "vitest";

import { FOCUS_MODALITY_ATTRIBUTE, FOCUS_MODALITY_SCRIPT, FOCUS_KEYS } from "@/lib/focus-modality";

/**
 * The script the document head actually inlines, run as-is.
 *
 * Testing a re-implementation of it would prove nothing: the thing that ships
 * is a string, and a string is exactly what can drift from the module it sits
 * next to. `new Function` evaluates it in this jsdom window, listeners and all.
 */
function runScript() {
  new Function(FOCUS_MODALITY_SCRIPT)();
}

const modality = () => document.documentElement.getAttribute(FOCUS_MODALITY_ATTRIBUTE);

describe("focus modality", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(FOCUS_MODALITY_ATTRIBUTE);
    runScript();
  });

  /**
   * §6: no modality until a device has actually been used.
   *
   * The ring is gated on `[data-focus-modality="keyboard"]`, so an absent
   * attribute means no ring — which is the point. Sign-in autofocuses its field,
   * and an autofocused field already carries a caret; ringing it too is the
   * double stroke the split exists to remove, just moved to the load path.
   */
  it("sets no modality at all before anything has happened", () => {
    expect(modality()).toBeNull();
  });

  // And the ring arrives on the first Tab, which is the first moment there is
  // anything true to say about which device is in use.
  it("starts on the keyboard at the first focus key", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(modality()).toBe("keyboard");
  });

  it("switches to pointer on a pointerdown", () => {
    window.dispatchEvent(new Event("pointerdown"));
    expect(modality()).toBe("pointer");
  });

  it("switches back on any key that moves or acts on focus", () => {
    for (const key of FOCUS_KEYS) {
      window.dispatchEvent(new Event("pointerdown"));
      expect(modality()).toBe("pointer");

      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      expect(modality()).toBe("keyboard");
    }
  });

  /**
   * The regression that would make the split feel broken: click into a field,
   * start typing, and a ring appears under your cursor halfway through a word.
   * Character keys and bare modifiers do not move focus, so they do not change
   * modality.
   */
  it("stays on pointer while typing into a field that was clicked into", () => {
    window.dispatchEvent(new Event("pointerdown"));

    for (const key of ["a", "Z", "@", "1", "Shift", "Meta", "Backspace"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      expect(modality()).toBe("pointer");
    }
  });
});
