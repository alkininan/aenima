import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import { useExitTransition } from "./useExit";

/**
 * `transition` is set inline so `getComputedStyle` has something to report: the
 * hook waits only where an exit is really running, and jsdom has no stylesheet
 * of its own. `animating: false` is the other half of that rule — a surface
 * with nothing declared, which is what `prefers-reduced-motion` leaves behind.
 */
function Harness({ open, animating = true }: { open: boolean; animating?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { present, leaving } = useExitTransition({ open, ref });
  if (!present) return null;
  return (
    <div
      ref={ref}
      data-testid="surface"
      data-leaving={leaving ? "" : undefined}
      // The longhand, not the `transition` shorthand: jsdom does not expand
      // the shorthand, so `transitionDuration` would come back empty and the
      // hook would read a surface that is animating as one that is not.
      style={animating ? { transitionProperty: "opacity", transitionDuration: "200ms" } : undefined}
    >
      surface
    </div>
  );
}

const surface = () => screen.queryByTestId("surface");

/**
 * design-spec.md §6: "A top-layer element leaves the top layer the moment it is
 * hidden, so the code applies the leaving state, waits for `transitionend`, then
 * hides." C-48 reads the durations; this reads the sequence.
 */
describe("useExitTransition", () => {
  it("renders nothing while closed", () => {
    render(<Harness open={false} />);
    expect(surface()).toBeNull();
  });

  it("is present on the very render its open turns true", () => {
    // Not one render later: a caller that reaches for the surface on mount —
    // the modal's focus trap does — would find nothing and never look again.
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    expect(surface()).not.toBeNull();
  });

  it("keeps the surface present, in its leaving state, until the transition ends", () => {
    const { rerender } = render(<Harness open />);
    expect(surface()?.hasAttribute("data-leaving")).toBe(false);

    rerender(<Harness open={false} />);
    expect(surface()).not.toBeNull();
    expect(surface()?.hasAttribute("data-leaving")).toBe(true);

    act(() => {
      surface()?.dispatchEvent(new Event("transitionend", { bubbles: true }));
    });
    expect(surface()).toBeNull();
  });

  /**
   * §6, C-15: under `prefers-reduced-motion` every slide "appears in place", so
   * there is no exit to wait for and the surface goes on the frame it was
   * dismissed. A hook that waited anyway would hold a dismissed toast on the
   * page for half a second with nothing happening.
   */
  it("goes at once when nothing is animating", () => {
    const { rerender } = render(<Harness open animating={false} />);
    rerender(<Harness open={false} animating={false} />);
    expect(surface()).toBeNull();
  });

  it("cancels the exit when it is reopened mid-flight", () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    expect(surface()?.hasAttribute("data-leaving")).toBe(true);

    rerender(<Harness open />);
    expect(surface()?.hasAttribute("data-leaving")).toBe(false);
  });
});
