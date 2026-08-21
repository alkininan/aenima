import { beforeEach, describe, expect, it } from "vitest";

import {
  Z_LAYERS,
  isTopLayer,
  layerCount,
  layerKind,
  pushLayer,
  removeLayer,
  resetLayers,
  topLayer,
} from "@/lib/layer-stack";

beforeEach(resetLayers);

describe("Z_LAYERS", () => {
  // design-spec.md §4: content 0 · sticky 100 · chat 200 · dropdown/popover 300
  // · modal 400 · toast 500 · tooltip 600.
  it("is the §4 ladder, exactly", () => {
    expect(Z_LAYERS).toEqual({
      content: 0,
      sticky: 100,
      chat: 200,
      popover: 300,
      modal: 400,
      toast: 500,
      tooltip: 600,
    });
  });
});

describe("layer stack", () => {
  it("starts empty and tracks what is open", () => {
    expect(topLayer()).toBeUndefined();
    pushLayer("a", "modal");
    expect(layerCount()).toBe(1);
    removeLayer("a");
    expect(layerCount()).toBe(0);
  });

  // §11: Esc closes the topmost layer. A select opened inside a modal paints
  // above it and takes the first Escape, even though §4 ranks popover (300)
  // below modal (400) — nesting decides dismissal, the ladder decides painting.
  it("gives Escape to the most recently opened layer, not the highest rung", () => {
    pushLayer("modal", "modal");
    pushLayer("select", "popover");
    expect(topLayer()).toBe("select");

    resetLayers();
    pushLayer("select", "popover");
    pushLayer("modal", "modal");
    expect(topLayer()).toBe("modal");
  });

  it("still records the rung each layer paints on", () => {
    pushLayer("select", "popover");
    expect(layerKind("select")).toBe("popover");
    expect(Z_LAYERS[layerKind("select") ?? "content"]).toBe(300);
  });

  it("orders same-rung layers by most recently opened", () => {
    pushLayer("first", "modal");
    pushLayer("second", "modal");
    expect(topLayer()).toBe("second");
    expect(isTopLayer("first")).toBe(false);
  });

  it("hands the layer back when the one above it closes", () => {
    pushLayer("modal", "modal");
    pushLayer("tooltip", "tooltip");
    expect(isTopLayer("tooltip")).toBe(true);

    removeLayer("tooltip");
    expect(isTopLayer("modal")).toBe(true);
  });

  it("re-registering a layer does not duplicate it", () => {
    pushLayer("a", "modal");
    pushLayer("a", "modal");
    expect(layerCount()).toBe(1);
  });
});
