import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";

function harness() {
  render(
    <Tooltip content="Helper text">
      <Button>Trigger</Button>
    </Tooltip>,
  );
  return screen.getByRole("button", { name: "Trigger" });
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** design-spec.md §8: 500ms show delay, instant hide. */
describe("Tooltip", () => {
  it("waits the full delay before showing", () => {
    const trigger = harness();
    fireEvent.mouseOver(trigger);

    tick(499);
    expect(screen.queryByRole("tooltip")).toBeNull();

    tick(1);
    expect(screen.getByRole("tooltip").textContent).toBe("Helper text");
  });

  it("hides the moment the pointer leaves", () => {
    const trigger = harness();
    fireEvent.mouseOver(trigger);
    tick(500);
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseOut(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("drops a pending open when the pointer leaves first", () => {
    const trigger = harness();
    fireEvent.mouseOver(trigger);
    tick(300);
    fireEvent.mouseOut(trigger);

    tick(5000);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  // §11 wants a keyboard path to everything, including a control's help text.
  it("opens on keyboard focus too", () => {
    const trigger = harness();
    act(() => trigger.focus());

    tick(500);
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    act(() => trigger.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  // §11: Esc closes the topmost layer, and a tooltip sits at the top of §4's
  // ladder while it is up.
  it("closes on Escape", () => {
    const trigger = harness();
    fireEvent.mouseOver(trigger);
    tick(500);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes its trigger only while it is showing", () => {
    const trigger = harness();
    expect(trigger.getAttribute("aria-describedby")).toBeNull();

    fireEvent.mouseOver(trigger);
    tick(500);

    const describedBy = trigger.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(screen.getByRole("tooltip").id).toBe(describedBy);
  });
});

/**
 * §8.14's flip: below by default, above only where the bubble does not fit beneath. The
 * bridge's height already holds the 8 it stands off by — it is the bridge's own padding —
 * so the room needed below is that height and nothing added to it.
 */
describe("Tooltip flip", () => {
  it("stays below when the bridge, gap included, fits the room beneath", () => {
    const bridgeHeight = 40;
    const room = 44;
    const offset = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(bridgeHeight);
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: window.innerHeight - room - 32,
      bottom: window.innerHeight - room,
      left: 0,
      right: 80,
      width: 80,
      height: 32,
      x: 0,
      y: window.innerHeight - room - 32,
      toJSON: () => ({}),
    });
    try {
      const trigger = harness();
      fireEvent.mouseOver(trigger);
      tick(500);
      const bridge = screen.getByRole("tooltip").parentElement!;
      expect(bridge.className).toContain("top-full");
      expect(bridge.className).not.toContain("bottom-full");
    } finally {
      offset.mockRestore();
      rect.mockRestore();
    }
  });
});
