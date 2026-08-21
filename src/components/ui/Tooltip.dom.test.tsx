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
