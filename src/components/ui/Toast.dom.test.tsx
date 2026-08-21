import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ToastOptions } from "@/components/ui/Toast";

function Trigger({ options }: { options: ToastOptions }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      fire
    </button>
  );
}

function show(options: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "fire" }));
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** design-spec.md §8: auto-dismiss 5s, hover pauses, optional undo, never red. */
describe("Toast", () => {
  it("shows the message and its tone dot", () => {
    show({ message: "Parked", tone: "warning" });

    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Parked");
    expect(toast.querySelector(".bg-warning")).not.toBeNull();
  });

  it("dismisses itself after five seconds, not before", () => {
    show({ message: "Parked" });

    tick(4999);
    expect(screen.queryByRole("status")).not.toBeNull();

    tick(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses the clock while hovered and resumes on the way out", () => {
    show({ message: "Parked" });
    const toast = screen.getByRole("status");

    tick(2000);
    fireEvent.mouseOver(toast);

    // Nothing moves while the pointer is on it, however long it sits there.
    tick(20000);
    expect(screen.queryByRole("status")).not.toBeNull();

    fireEvent.mouseOut(toast);
    // Three seconds were left when it was paused.
    tick(2999);
    expect(screen.queryByRole("status")).not.toBeNull();
    tick(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // §12: an undo stays available 8s, not §8's 5s — long enough to be reached.
  it("gives a toast carrying an undo the longer clock", () => {
    show({ message: "Parked", action: { label: "Undo", onAction: vi.fn() } });

    tick(5000);
    expect(screen.queryByRole("status")).not.toBeNull();

    tick(2999);
    expect(screen.queryByRole("status")).not.toBeNull();
    tick(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("leaves an explicit duration alone", () => {
    show({ message: "Parked", action: { label: "Undo", onAction: vi.fn() }, duration: 1000 });

    tick(1000);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("runs the undo action and closes on it", () => {
    const onAction = vi.fn();
    show({ message: "Parked", action: { label: "Undo", onAction } });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stacks and clears each toast on its own clock", () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: "First" }} />
      </ToastProvider>,
    );
    const fire = screen.getByRole("button", { name: "fire" });

    fireEvent.click(fire);
    tick(2000);
    fireEvent.click(fire);
    expect(screen.getAllByRole("status")).toHaveLength(2);

    tick(3000);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    tick(2000);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // §8: "never a red toast — errors surface inline". §0 law 2 reserves danger.
  it("paints nothing in danger", () => {
    show({ message: "Parked", tone: "warning" });
    expect(screen.getByRole("status").outerHTML).not.toContain("danger");
  });
});
