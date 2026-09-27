import { describe, expect, it, vi } from "vitest";

import {
  classifyViewportChange,
  dockChanged,
  subscribeDockChange,
  type ViewportState,
} from "./anchor-change";

const at = (width: number, height: number, angle = 0): ViewportState => ({ width, height, angle });

describe("C-28 · what a viewport change does to an open panel", () => {
  it("closes a panel on a width change", () => {
    expect(classifyViewportChange(at(1000, 800), at(900, 800))).toBe("close");
  });

  it("closes a panel on an orientation change", () => {
    expect(classifyViewportChange(at(800, 800), at(800, 800, 90))).toBe("close");
  });

  it("leaves a panel open on a height-only change and re-places it", () => {
    expect(classifyViewportChange(at(1000, 800), at(1000, 740))).toBe("replace");
  });

  it("does nothing when neither has moved", () => {
    expect(classifyViewportChange(at(1000, 800), at(1000, 800))).toBe("none");
  });
});

describe("C-28 · the dock's own signal", () => {
  it("tells every open panel to close when the docked dock opens or closes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeDockChange(first);
    const offSecond = subscribeDockChange(second);

    dockChanged();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    offFirst();
    offSecond();
  });

  it("stops telling a panel that has unsubscribed", () => {
    const listener = vi.fn();
    subscribeDockChange(listener)();
    dockChanged();
    expect(listener).not.toHaveBeenCalled();
  });
});
