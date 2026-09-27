import { describe, expect, it } from "vitest";

import { placePanel, PANEL_VIEWPORT_GAP } from "./panel-placement";

const viewport = { width: 1000, height: 800 };

/** A trigger 48 tall — a select field — sitting 100 from the top, 200 wide. */
const field = { top: 100, left: 300, width: 200, height: 48 };

describe("C-14 · §6's placement rule", () => {
  it("grows downward from the trigger's top edge when its height fits below it", () => {
    const place = placePanel({ trigger: field, panel: { width: 200, height: 320 }, viewport });
    expect(place.side).toBe("below");
    expect(place.top).toBe(field.top);
    expect(place.maxHeight).toBe(320);
  });

  it("measures the downward room from the trigger's top edge, not its bottom", () => {
    // 360 of room below the trigger's top, 312 below its bottom. A 340-tall
    // panel fits the first and not the second; §6 measures the first.
    const low = { top: 440, left: 300, width: 200, height: 48 };
    const place = placePanel({ trigger: low, panel: { width: 200, height: 340 }, viewport });
    expect(place.side).toBe("below");
    expect(place.top).toBe(low.top);
  });

  it("grows upward when its height does not fit below the trigger's top edge", () => {
    const low = { top: 600, left: 300, width: 200, height: 48 };
    const place = placePanel({ trigger: low, panel: { width: 200, height: 320 }, viewport });
    expect(place.side).toBe("above");
    // Upward, the panel's bottom sits on the trigger's bottom edge.
    expect(place.top).toBe(low.top + low.height - 320);
    expect(place.maxHeight).toBe(320);
  });

  it("opens toward the larger side with max-height that room less 8 when it fits neither", () => {
    const tight = { top: 360, left: 300, width: 200, height: 48 };
    // room below the top edge: 800 - 360 = 440. room above the bottom: 408.
    const place = placePanel({ trigger: tight, panel: { width: 200, height: 600 }, viewport });
    expect(place.side).toBe("below");
    expect(place.maxHeight).toBe(440 - PANEL_VIEWPORT_GAP);
    expect(place.top).toBe(tight.top);
  });

  it("takes the upward side when that is the larger of the two", () => {
    const tight = { top: 500, left: 300, width: 200, height: 48 };
    // below the top edge: 300. above the bottom: 548.
    const place = placePanel({ trigger: tight, panel: { width: 200, height: 600 }, viewport });
    expect(place.side).toBe("above");
    expect(place.maxHeight).toBe(548 - PANEL_VIEWPORT_GAP);
    expect(place.top).toBe(tight.top + tight.height - (548 - PANEL_VIEWPORT_GAP));
  });

  it("grows toward the side with more room horizontally", () => {
    const nearRight = { top: 100, left: 900, width: 60, height: 34 };
    // right of the trigger's left edge: 100. left of its right edge: 960.
    const place = placePanel({ trigger: nearRight, panel: { width: 280, height: 100 }, viewport });
    expect(place.left).toBe(nearRight.left + nearRight.width - 280);
  });

  it("left-aligns on the trigger when the room to the right is the larger", () => {
    const place = placePanel({ trigger: field, panel: { width: 280, height: 100 }, viewport });
    expect(place.left).toBe(field.left);
  });

  it("never places a panel outside the viewport", () => {
    const edge = { top: 100, left: 10, width: 40, height: 34 };
    const place = placePanel({ trigger: edge, panel: { width: 990, height: 100 }, viewport });
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.left + 990).toBeLessThanOrEqual(viewport.width);
  });

  it("caps the panel at the height it is given", () => {
    const place = placePanel({
      trigger: field,
      panel: { width: 200, height: 900 },
      viewport,
      maxHeight: 320,
    });
    expect(place.maxHeight).toBeLessThanOrEqual(320);
  });
});
