import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ToastOptions } from "@/components/ui/Toast";

function Trigger({ options, label = "fire" }: { options: ToastOptions; label?: string }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      {label}
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

  /**
   * §8.20 (v2.21), and C-20's "a new toast replaces the one showing, undo or
   * not". The rule reversed here: until v2.19 toasts stacked, each on its own
   * clock. §8.20 gives the reason for the reversal and it is about meaning
   * rather than room — "queuing it would leave an Undo on screen that means an
   * earlier move than the one just made".
   */
  it("shows one at a time, the newest replacing the one showing", () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: "First" }} />
      </ToastProvider>,
    );
    const fire = screen.getByRole("button", { name: "fire" });

    fireEvent.click(fire);
    tick(2000);
    fireEvent.click(fire);
    expect(screen.getAllByRole("status")).toHaveLength(1);

    // The replacement brought its own full clock with it, so three more
    // seconds — which would have finished the first — leave it standing.
    tick(3000);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    tick(2000);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // §8.20: "A failure dismisses its own move's undo at once." With one toast at
  // a time the failure is the dismissal, and the shortcut goes with the button.
  it("lets a failure take the place of its move's undo", () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Parked", action: { label: "Undo", onAction } }} />
        <Trigger label="fail" options={{ message: "Could not park", tone: "warning" }} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "fail" }));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Could not park");
  });

  /**
   * §8.20: "While an undo shows, `Cmd/Ctrl+Z` triggers it when focus is not in a
   * text field." Inside one the keystroke is the platform's own undo and taking
   * it would silently discard what someone typed (§11).
   */
  it("fires a showing undo on Cmd/Ctrl+Z, and stays quiet inside a text field", () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <input aria-label="note" />
        <Trigger options={{ message: "Parked", action: { label: "Undo", onAction } }} />
      </ToastProvider>,
    );

    const field = screen.getByLabelText("note");
    fireEvent.click(screen.getByRole("button", { name: "fire" }));

    field.focus();
    fireEvent.keyDown(document, { key: "z", metaKey: true });
    expect(onAction).not.toHaveBeenCalled();

    field.blur();
    fireEvent.keyDown(document, { key: "z", metaKey: true });
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });

  // §8: "never a red toast — errors surface inline". §0 law 2 reserves danger.
  it("paints nothing in danger", () => {
    show({ message: "Parked", tone: "warning" });
    expect(screen.getByRole("status").outerHTML).not.toContain("danger");
  });
});
